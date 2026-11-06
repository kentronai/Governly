import type { AutofillEntry } from "@/lib/actions/evidence-autofill";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Evidence entry that just points at the uploaded document, for a human to review. */
export const referenceEntry = (fileName: string, why: string): AutofillEntry => ({
  evidence: `<p>Uploaded document: ${esc(fileName)}</p><p>${esc(why)}</p>`,
  status: "In progress",
});
