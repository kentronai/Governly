/**
 * Group fairness metrics computed from a model's decisions (one row per person).
 *
 * - Selection rate: share of a group that received the positive outcome.
 * - Impact ratio: a group's selection rate / the highest group's rate. The "four-fifths rule"
 *   (EEOC Uniform Guidelines, 29 CFR 1607.4(D); NYC LL 144 bias audits) flags a ratio below 0.8.
 * - Demographic parity difference: highest minus lowest selection rate.
 * - Equal opportunity difference (only with a true-label column): highest minus lowest true
 *   positive rate, i.e. the share of truly-positive people the model also marked positive.
 */

export const FOUR_FIFTHS = 0.8;
/** Groups smaller than this give unstable rates; they are flagged, not hidden. */
export const SMALL_GROUP = 30;

export interface FairnessInput {
  rows: Record<string, unknown>[];
  groupColumn: string;
  decisionColumn: string;
  /** Decision value that means the favourable outcome, e.g. "1", "hired", "approved". */
  positiveValue: string;
  /** Optional ground-truth column; enables equal opportunity. */
  labelColumn?: string;
  /** Label value that means truly positive (defaults to positiveValue). */
  labelPositiveValue?: string;
}

export interface GroupResult {
  group: string;
  n: number;
  selected: number;
  selectionRate: number;
  impactRatio: number;
  truePositiveRate?: number;
  small: boolean;
}

export interface FairnessResult {
  rows: number;
  /** Rows skipped because the group or decision cell was empty. */
  skipped: number;
  groups: GroupResult[];
  minImpactRatio: number;
  demographicParityDifference: number;
  equalOpportunityDifference?: number;
  passed: boolean;
}

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const round = (x: number) => Math.round(x * 10000) / 10000;

export function computeFairness(input: FairnessInput): FairnessResult {
  const { rows, groupColumn, decisionColumn, positiveValue, labelColumn } = input;
  const labelPositive = input.labelPositiveValue ?? positiveValue;
  const tally = new Map<string, { n: number; selected: number; actual: number; truePos: number }>();
  let skipped = 0;

  for (const row of rows) {
    const group = cell(row[groupColumn]);
    const decision = cell(row[decisionColumn]);
    if (!group || !decision) {
      skipped++;
      continue;
    }
    const t = tally.get(group) ?? { n: 0, selected: 0, actual: 0, truePos: 0 };
    const selected = decision === positiveValue;
    t.n++;
    if (selected) t.selected++;
    if (labelColumn && cell(row[labelColumn]) === labelPositive) {
      t.actual++;
      if (selected) t.truePos++;
    }
    tally.set(group, t);
  }

  if (tally.size < 2) throw new Error("Need at least two groups to compare");

  const rates = [...tally].map(([group, t]) => ({ group, ...t, rate: t.selected / t.n }));
  const maxRate = Math.max(...rates.map((r) => r.rate));
  const groups: GroupResult[] = rates
    .map((r) => ({
      group: r.group,
      n: r.n,
      selected: r.selected,
      selectionRate: round(r.rate),
      // Nobody selected in any group: every group is treated the same.
      impactRatio: round(maxRate === 0 ? 1 : r.rate / maxRate),
      truePositiveRate: labelColumn && r.actual ? round(r.truePos / r.actual) : undefined,
      small: r.n < SMALL_GROUP,
    }))
    .sort((a, b) => a.impactRatio - b.impactRatio);

  const minImpactRatio = Math.min(...groups.map((g) => g.impactRatio));
  const tprs = groups.flatMap((g) => (g.truePositiveRate === undefined ? [] : [g.truePositiveRate]));

  return {
    rows: rows.length - skipped,
    skipped,
    groups,
    minImpactRatio,
    demographicParityDifference: round(maxRate - Math.min(...rates.map((r) => r.rate))),
    equalOpportunityDifference:
      labelColumn && tprs.length >= 2 ? round(Math.max(...tprs) - Math.min(...tprs)) : undefined,
    passed: minImpactRatio >= FOUR_FIFTHS,
  };
}
