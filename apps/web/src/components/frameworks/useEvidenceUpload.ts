import { useState } from "react";
import {
  autofillFromDocument,
  type AutofillEntry,
} from "@/lib/actions/evidence-autofill";
import type { FrameworkControlData } from "@/lib/actions/framework-controls";
import type { FrameworkRequirement } from "@/lib/frameworks";
import { str } from "@/lib/frameworks/helpers";
import { referenceEntry } from "@/lib/evidence-reference";
import { errorToast, infoToast } from "@/lib/utils/toast";

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    // Any file is accepted: unreadable formats are still attached as evidence.
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click(); // must run inside the click handler (browser user-gesture rule)
  });
}

/** Controls whose Details a document can fill: the subcontrols, else the requirement. */
const targets = (r: FrameworkRequirement) =>
  (r.subcontrols.length ? r.subcontrols : [r]).map(
    ({ key, title, description }) => ({ key, title, description }),
  );

/** Add the AI draft to what's already written (never overwrites). */
export function mergeFill(
  draft: Record<string, FrameworkControlData>,
  fill: Record<string, AutofillEntry>,
) {
  const next = { ...draft };
  for (const [key, f] of Object.entries(fill)) {
    const cur = next[key] ?? {};
    const started = str(cur.status) && str(cur.status) !== "Not started";
    next[key] = {
      ...cur,
      implementation: str(cur.implementation) + (f.implementation ?? ""),
      evidence: str(cur.evidence) + (f.evidence ?? ""),
      status: started ? cur.status : f.status,
    };
  }
  return next;
}

/** Pick a document, let the AI read it, return the drafted fields (null on cancel/error). */
export function useEvidenceUpload() {
  const [busy, setBusy] = useState(false);
  const upload = async (requirement: FrameworkRequirement) => {
    const file = await pickFile();
    if (!file) return null;
    // Too big to send to the server (action body limit): attach it as a reference.
    if (file.size > 8 * 1024 * 1024) {
      infoToast(
        "The file is too large to read automatically. It is attached as evidence for you to review.",
      );
      return Object.fromEntries(
        targets(requirement).map(({ key }) => [
          key,
          referenceEntry(file.name, "The file is too large to read automatically (over 8 MB)."),
        ]),
      );
    }
    setBusy(true);
    infoToast(`Reading ${file.name}…`);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("items", JSON.stringify(targets(requirement)));
      const result = await autofillFromDocument(form);
      if ("error" in result) {
        errorToast(result.error);
        return null;
      }
      infoToast(
        result.note ?? "Details filled from your document. Review, then Save.",
      );
      return result.fill;
    } catch {
      errorToast("Unable to read the document");
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, upload };
}
