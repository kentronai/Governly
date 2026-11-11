// Client-safe grade helpers (no catalog import).
export const GRADE_SCALE = [
  { grade: "A", min: 70, max: 100 },
  { grade: "B", min: 60, max: 69 },
  { grade: "C", min: 48, max: 59 },
  { grade: "D", min: 35, max: 47 },
  { grade: "F", min: 0, max: 34 },
] as const;

export const gradeFor = (score: number) =>
  GRADE_SCALE.find((band) => score >= band.min)!.grade;

export const GRADE_CLASSES: Record<string, string> = {
  A: "border-emerald-300 bg-emerald-50 text-emerald-700",
  B: "border-sky-300 bg-sky-50 text-sky-700",
  C: "border-amber-300 bg-amber-50 text-amber-700",
  D: "border-orange-300 bg-orange-50 text-orange-700",
  F: "border-red-300 bg-red-50 text-red-700",
};

export const COLLECTIONS = [
  { id: "neo-cloud", name: "Neo Cloud & Inference Providers" },
  { id: "ai-apps", name: "AI Applications" },
] as const;

export type CollectionId = (typeof COLLECTIONS)[number]["id"];
