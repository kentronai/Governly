import type { FrameworkControlData } from "@/lib/actions/framework-controls";
import type { FrameworkRequirement } from "./types";

/** Flat requirement: the requirement itself is the control (no subcontrols). */
export const req = (
  key: string,
  title: string,
  summary: string,
  description: string,
  keyQuestions: string[],
  evidenceExamples: string[],
): FrameworkRequirement => ({
  key,
  title,
  summary,
  description,
  keyQuestions,
  evidenceExamples,
  subcontrols: [],
});

/** Flat requirement whose summary is also its description (shown once as "Summary"). */
export const clause = (
  key: string,
  title: string,
  summary: string,
  keyQuestions: string[],
  evidenceExamples: string[],
): FrameworkRequirement =>
  req(key, title, summary, summary, keyQuestions, evidenceExamples);

/** Flat sub-item listed under a requirement; Details form only, no guidance. */
export const spec = (
  key: string,
  title: string,
  description: string,
): FrameworkRequirement => ({
  key,
  title,
  description,
  nested: true,
  subcontrols: [],
});

export const str = (value: unknown) => (typeof value === "string" ? value : "");
// A subcontrol counts as completed once any of its details are filled in (or it is marked Done).
export const isDone = (
  data: Record<string, FrameworkControlData>,
  key: string,
) => {
  const c = data[key];
  return Boolean(
    c &&
      (c.status === "Done" ||
        ["implementation", "evidence", "auditorFeedback"].some((f) =>
          str(c[f]).trim(),
        )),
  );
};
// Shown status: the one picked, else "In progress" once any detail is filled in.
// ("Waiting" was the old default label; treat it as unset.)
export const statusOf = (c: FrameworkControlData | undefined) => {
  const picked = str(c?.status);
  if (picked && picked !== "Waiting") return picked;
  return c &&
    ["implementation", "evidence", "auditorFeedback"].some((f) =>
      str(c[f]).trim(),
    )
    ? "In progress"
    : "Not started";
};
// Keys whose Details count toward completion: the subcontrols, or the
// requirement itself for flat frameworks.
export const controlKeys = (r: FrameworkRequirement) =>
  r.subcontrols.length ? r.subcontrols.map((s) => s.key) : [r.key];
export const percent = (done: number, total: number) =>
  total ? Math.round((done / total) * 100) : 0;
