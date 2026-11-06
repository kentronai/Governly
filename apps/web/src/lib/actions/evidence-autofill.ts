"use server";

import { auth } from "@clerk/nextjs/server";
import { pickRadarModel, radarChat } from "@/lib/server/radar/llm";
import { referenceEntry } from "@/lib/evidence-reference";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
const STATUSES = ["Not started", "In progress", "Done"];
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export type AutofillItem = { key: string; title: string; description: string };
export type AutofillEntry = {
  implementation?: string;
  evidence?: string;
  status?: string;
};

const stripMarkup = (s: string) =>
  s
    .replace(/<\/(p|div|tr|li|h\d|a:p|text:p)>|<br\s*\/?>/gi, "\n")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\'[0-9a-f]{2}|\\[a-z]+-?\d* ?|[{}]/gi, " ") // RTF control words
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ");

/**
 * Best-effort text of any document. Never throws: a format we can't read returns
 * "" (and, for images, the image itself so a vision model can look at it).
 */
async function readDocument(file: File) {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";
  const buf = Buffer.from(await file.arrayBuffer());
  const none = { text: "", image: undefined as { data: Uint8Array; mediaType: string } | undefined };
  try {
    if (IMAGE_TYPES[ext])
      return { ...none, image: { data: new Uint8Array(buf), mediaType: IMAGE_TYPES[ext] } };
    if (ext === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      return { ...none, text: (await extractText(pdf, { mergePages: true })).text };
    }
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      return { ...none, text: (await mammoth.extractRawText({ buffer: buf })).value };
    }
    if (/^(xlsx|xlsm|xls|ods)$/.test(ext)) {
      const XLSX = await import("xlsx");
      const book = XLSX.read(buf, { type: "buffer" });
      return {
        ...none,
        text: book.SheetNames.map(
          (n) => `Sheet ${n}:\n${XLSX.utils.sheet_to_csv(book.Sheets[n])}`,
        ).join("\n\n"),
      };
    }
    if (/^(pptx|odt|odp)$/.test(ext)) {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(buf);
      const parts = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$|^content\.xml$/.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const xml = await Promise.all(parts.map((f) => zip.files[f].async("string")));
      return { ...none, text: stripMarkup(xml.join("\n")) };
    }
    // Everything else (txt, md, csv, json, html, xml, rtf, yaml, logs, unknown types):
    // use it as text when it decodes as text.
    const decoded = buf.toString("utf8");
    const sample = decoded.slice(0, 4000);
    const printable = sample.replace(/[^\x09\x0a\x0d\x20-\x7e -￿]/g, "").length;
    if (sample.length && printable / sample.length > 0.9)
      return { ...none, text: /^(html?|xml|rtf)$/.test(ext) ? stripMarkup(decoded) : decoded };
  } catch {
    // unreadable or corrupt: fall through, the file is still attached as evidence
  }
  return none;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = (text: unknown) =>
  typeof text === "string" && text.trim()
    ? text
        .trim()
        .split(/\n{2,}|\n/)
        .map((p) => `<p>${esc(p)}</p>`)
        .join("")
    : "";

/**
 * Reads an uploaded evidence document and drafts the Details fields of the given
 * controls from it. Nothing is saved: the dialog shows the draft for review.
 * A document is never rejected: whatever can't be read or matched is attached as
 * an evidence reference instead, with a note saying why.
 * FormData: file, items (JSON AutofillItem[]).
 */
export async function autofillFromDocument(
  form: FormData,
): Promise<{ fill: Record<string, AutofillEntry>; note?: string } | { error: string }> {
  // Errors are returned, not thrown: Next hides thrown messages in production.
  try {
    return await fillFromDocument(form);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to read the document" };
  }
}

async function fillFromDocument(form: FormData) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("No file uploaded");
  const items: AutofillItem[] = JSON.parse(String(form.get("items") ?? "[]"));
  if (!items.length) throw new Error("Nothing to fill");

  const attachAll = (why: string) => ({
    fill: Object.fromEntries(items.map(({ key }) => [key, referenceEntry(file.name, why)])),
    note: `${why} The document is attached as evidence for you to review.`,
  });
  if (file.size > MAX_FILE_BYTES)
    return attachAll("The file is too large to read automatically (over 8 MB).");

  const { text: raw, image } = await readDocument(file);
  const text = raw.replace(/\s+\n/g, "\n").trim();
  if (text.length < 20 && !image)
    return attachAll(
      "No text could be read from this file (it may be scanned, protected or in an unusual format).",
    );

  const model = await pickRadarModel(orgId);
  if (!model)
    return attachAll(
      "No AI model is configured (add an LLM key under BYOK), so the file couldn't be analysed.",
    );

  let out: { entries?: Record<string, Record<string, unknown>> };
  try {
    out = (await radarChat(
      model,
      `You help fill a compliance control tracker from an evidence document, which may be in any format and may only partly relate to the controls. For each control, write from the document only; never invent facts. ` +
        `Return JSON {"entries":{"<key>":{"implementation":"how the document shows this is implemented","evidence":"quotes or references from the document that prove it (mention section/page if visible)","status":"Not started|In progress|Done"}}}. ` +
        `Leave implementation and evidence as "" and status "Not started" for controls the document does not address. Use "Done" only when the document clearly satisfies the control.`,
      `Document "${file.name}":\n"""\n${text.slice(0, MAX_TEXT_CHARS)}\n"""\n\nControls:\n${JSON.stringify(items)}`,
      image ? [image] : [],
    )) as typeof out;
  } catch {
    return attachAll(
      image
        ? "The configured AI model couldn't read this image."
        : "The AI model couldn't analyse this document right now.",
    );
  }

  const result: Record<string, AutofillEntry> = {};
  for (const { key } of items) {
    const e = out.entries?.[key];
    if (!e) continue;
    const implementation = html(e.implementation);
    const evidence = html(e.evidence);
    if (!implementation && !evidence) continue;
    result[key] = {
      implementation,
      evidence: evidence && `${evidence}<p>Source: ${esc(file.name)}</p>`,
      status: STATUSES.includes(e.status as string) ? (e.status as string) : "In progress",
    };
  }
  if (!Object.keys(result).length)
    return attachAll("The document didn't clearly match this control.");
  return { fill: result };
}
