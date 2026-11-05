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
