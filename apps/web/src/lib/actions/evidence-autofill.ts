"use server";

import { auth } from "@clerk/nextjs/server";
import { pickRadarModel, radarChat } from "@/lib/server/radar/llm";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
const STATUSES = ["Not started", "In progress", "Done"];

export type AutofillItem = { key: string; title: string; description: string };
export type AutofillEntry = {
  implementation?: string;
  evidence?: string;
  status?: string;
};

async function documentText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    return (await extractText(pdf, { mergePages: true })).text;
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  if (/\.(txt|md|csv|json)$/.test(name)) return buf.toString("utf8");
  throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT, MD or CSV.");
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
 * FormData: file, items (JSON AutofillItem[]).
 */
export async function autofillFromDocument(
  form: FormData,
): Promise<{ fill: Record<string, AutofillEntry> } | { error: string }> {
  // Errors are returned, not thrown: Next hides thrown messages in production.
  try {
    return { fill: await fillFromDocument(form) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to read the document" };
  }
}

async function fillFromDocument(form: FormData) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("No file uploaded");
  if (file.size > MAX_FILE_BYTES) throw new Error("File is too large (max 8 MB)");
  const items: AutofillItem[] = JSON.parse(String(form.get("items") ?? "[]"));
  if (!items.length) throw new Error("Nothing to fill");

  const text = (await documentText(file)).replace(/\s+\n/g, "\n").trim();
  if (text.length < 20)
    throw new Error("No readable text found (scanned PDFs are not supported)");

  const model = await pickRadarModel(orgId);
  if (!model)
    throw new Error("No AI model configured. Add an LLM key (BYOK) in Admin settings first.");

  const out = (await radarChat(
    model,
    `You help fill a compliance control tracker from an evidence document. For each control, write from the document only; never invent facts. ` +
      `Return JSON {"entries":{"<key>":{"implementation":"how the document shows this is implemented","evidence":"quotes or references from the document that prove it (mention section/page if visible)","status":"Not started|In progress|Done"}}}. ` +
      `Leave implementation and evidence as "" and status "Not started" for controls the document does not address. Use "Done" only when the document clearly satisfies the control.`,
    `Document "${file.name}":\n"""\n${text.slice(0, MAX_TEXT_CHARS)}\n"""\n\nControls:\n${JSON.stringify(items)}`,
  )) as { entries?: Record<string, Record<string, unknown>> };

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
    throw new Error("The document doesn't seem to cover this control");
  return result;
}
