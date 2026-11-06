import type { FrameworkControlData } from "@/lib/actions/framework-controls";
import type {
  FrameworkDefinition,
  FrameworkRequirement,
  FrameworkSubcontrol,
} from "./types";
import { FRAMEWORKS } from "./index";
import { str } from "./helpers";

/**
 * Controls that ask for the same thing in different frameworks, as leaf ids
 * "slug:key" (a subcontrol key such as "1.1.2", or the requirement key for flat
 * frameworks). They collapse into ONE Kentron control row, and whatever is saved
 * on any member is copied to all the others (see `mirrorWrites`).
 * Keep at most one leaf per framework in a group; add groups as mappings are agreed.
 */
export const EQUIVALENT_CONTROLS = [
  // Governance, people and regulators
  [
    "eu-ai-act:1.1.1",
    "colorado-ai-act:8.1",
    "texas-traiga:10.1",
    "ftc-ai:5.1",
    "oecd-ai-principles:5.1",
    "ai-ethics-governance:3.1",
  ], // leadership accountability / governance structure
  ["eu-ai-act:1.1.2", "colorado-ai-act:8.3"], // AI literacy and training
  ["eu-ai-act:1.2.2", "colorado-ai-act:2.5", "texas-traiga:9.1"], // regulator cooperation
  // Risk
  [
    "eu-ai-act:3.1.1",
    "colorado-ai-act:3.1",
    "texas-traiga:5.1",
    "oecd-ai-principles:5.2",
    "ftc-ai:5.2",
    "ai-ethics-governance:3.2",
  ], // risk management program
  ["eu-ai-act:3.1.2", "colorado-ai-act:4.4", "ai-ethics-governance:1.3"], // risk mitigation / remediation
  ["eu-ai-act:3.1.3", "texas-traiga:2.4"], // periodic reassessment
  [
    "eu-ai-act:10.1.2",
    "colorado-ai-act:3.2",
    "texas-traiga:2.1",
    "oecd-ai-principles:5.3",
  ], // impact assessment
  // Data
  ["eu-ai-act:4.1.1", "colorado-ai-act:7.2"], // data provenance
  [
    "eu-ai-act:4.1.2",
    "colorado-ai-act:7.1",
    "texas-traiga:6.1",
    "altai:3.2",
  ], // data quality
  [
    "eu-ai-act:4.1.3",
    "colorado-ai-act:4.1",
    "texas-traiga:2.2",
    "ftc-ai:2.3",
    "ai-ethics-governance:1.2",
    "altai:5.1",
    "oecd-ai-principles:2.2",
  ], // bias testing
  // Documentation, logging and retention
  [
    "eu-ai-act:5.1.1",
    "colorado-ai-act:9.1",
    "texas-traiga:7.1",
    "ai-ethics-governance:2.3",
  ], // technical documentation
  [
    "eu-ai-act:5.2.1",
    "oecd-ai-principles:4.4",
    "altai:4.1",
    "hipaa-security:3.2",
    "pci-dss-lite:5.1",
  ], // logging and traceability
  [
    "eu-ai-act:5.2.2",
    "colorado-ai-act:9.4",
    "texas-traiga:7.4",
    "nyc-ll-144:5.1",
    "ftc-ai:5.4",
    "oecd-ai-principles:5.5",
  ], // record retention
  // Oversight
  [
    "eu-ai-act:7.1.1",
    "texas-traiga:4.1",
    "oecd-ai-principles:2.4",
    "altai:1.2",
    "ai-ethics-governance:4.1",
  ], // human oversight
  ["eu-ai-act:7.1.3", "texas-traiga:4.4", "ai-ethics-governance:4.3"], // oversight personnel
  // Accuracy, resilience and security
  ["eu-ai-act:8.1.1", "oecd-ai-principles:4.1", "altai:2.3"], // accuracy
  ["eu-ai-act:8.1.2", "altai:2.5", "oecd-ai-principles:4.5"], // fallback
  [
    "eu-ai-act:8.1.3",
    "texas-traiga:6.4",
    "ftc-ai:3.2",
    "oecd-ai-principles:4.2",
    "altai:2.1",
    "ai-ethics-governance:5.2",
  ], // AI system security
  // Telling people
  ["eu-ai-act:9.2.2", "ftc-ai:4.2", "nyc-ll-144:3.1"], // notify people affected
  [
    "eu-ai-act:11.1.1",
    "colorado-ai-act:3.3",
    "texas-traiga:3.1",
    "ftc-ai:1.3",
    "oecd-ai-principles:3.1",
    "ai-ethics-governance:2.1",
  ], // AI disclosure
  // Monitoring, audit and incidents
  ["eu-ai-act:12.1.1", "colorado-ai-act:4.3", "texas-traiga:5.2"], // monitoring
  [
    "eu-ai-act:12.1.2",
    "colorado-ai-act:8.4",
    "texas-traiga:10.4",
    "altai:7.1",
  ], // internal audit
  ["eu-ai-act:12.2.1", "texas-traiga:5.3"], // incident response
  // Not in the EU AI Act
  [
    "colorado-ai-act:3.4",
    "texas-traiga:3.4",
    "ftc-ai:4.3",
    "oecd-ai-principles:3.2",
    "altai:4.2",
    "ai-ethics-governance:2.2",
  ], // explanation
  [
    "colorado-ai-act:3.5",
    "texas-traiga:4.2",
    "oecd-ai-principles:5.4",
    "altai:7.4",
  ], // appeal and redress
  ["colorado-ai-act:8.2", "texas-traiga:10.3"], // compliance program
  ["colorado-ai-act:10.3", "texas-traiga:9.2"], // cure period
  ["texas-traiga:8.1", "ftc-ai:5.3", "ai-ethics-governance:3.3"], // third-party AI
  [
    "ftc-ai:3.1",
    "oecd-ai-principles:2.3",
    "altai:3.1",
    "ai-ethics-governance:5.1",
  ], // privacy and data protection
  ["hipaa-security:3.1", "pci-dss-lite:4.1"], // access control
  ["hipaa-security:3.3", "pci-dss-lite:2.2"], // transmission encryption
];

/** One thing a control can be answered against: a subcontrol, or a flat requirement. */
export interface ControlMember {
  framework: FrameworkDefinition;
  requirement: FrameworkRequirement;
  /** Set when the leaf is a subcontrol of `requirement`. */
  sub?: FrameworkSubcontrol;
}

/** Key the leaf's Details (implementation, status, evidence…) are saved under. */
export const leafKey = (m: ControlMember) => m.sub?.key ?? m.requirement.key;
const idOf = (m: ControlMember) => `${m.framework.slug}:${leafKey(m)}`;

/** One row of the Controls table. */
export interface Control {
  /** "KN0001.1" or, for a subcontrol, "KN0001.1.1" */
  code: string;
  /** Row number in the table. */
  no: number;
  title: string;
  description: string;
  nested?: boolean;
  /** Heading row of a requirement that has subcontrols; its subcontrols follow. */
  parent: boolean;
  /** Dialog title: the requirement's code and name. */
  heading: string;
  /** First enabled framework's leaf; the dialog edits this one. */
  primary: ControlMember;
  /** Every framework leaf this control satisfies, primary first (empty for a parent row). */
  members: ControlMember[];
}

export interface ControlSection {
  /** Whether the section comes from a regulation or a framework. */
  kind: FrameworkDefinition["kind"];
  /** "KN0001" */
  code: string;
  no: number;
  title: string;
  controls: Control[];
}

const leavesOf = (
  framework: FrameworkDefinition,
  requirement: FrameworkRequirement,
): ControlMember[] =>
  requirement.subcontrols.length
    ? requirement.subcontrols.map((sub) => ({ framework, requirement, sub }))
    : [{ framework, requirement }];

const nodes = new Map<string, ControlMember>(
  FRAMEWORKS.flatMap((f) =>
    f.sections.flatMap((s) =>
      s.requirements.flatMap((r) => leavesOf(f, r)),
    ),
  ).map((m) => [idOf(m), m]),
);
const groupOf = new Map<string, string[]>(
  EQUIVALENT_CONTROLS.flatMap((group) =>
    group.map((id): [string, string[]] => [id, group]),
  ),
);
const peersOf = (id: string) =>
  (groupOf.get(id) ?? []).filter((other) => other !== id);

/**
 * Kentron control library for the enabled frameworks: regulations first, then
 * frameworks, each in framework order. A control shared by a regulation and a
 * framework sits under the regulation.
 * Numbered KN0001… per section, KN0001.1… per requirement and KN0001.1.1… per
 * subcontrol. Equivalent leaves merge into the row of the first enabled
 * framework that has them; mapped frameworks that are not enabled still show
 * in `members`, because filling the row completes them too.
 */
export function buildControls(
  enabled: FrameworkDefinition[],
): ControlSection[] {
  const placed = new Set<string>();
  const sections: ControlSection[] = [];
  let no = 0;
  const ordered = [
    ...enabled.filter((f) => f.kind === "regulation"),
    ...enabled.filter((f) => f.kind === "framework"),
  ];
  for (const framework of ordered) {
    for (const section of framework.sections) {
      const drafts: {
        requirement: FrameworkRequirement;
        leaves: { primary: ControlMember; members: ControlMember[] }[];
      }[] = [];
      for (const requirement of section.requirements) {
        const leaves = [];
        for (const primary of leavesOf(framework, requirement)) {
          if (placed.has(idOf(primary))) continue;
          const others = peersOf(idOf(primary))
            .map((id) => nodes.get(id))
            .filter((m): m is ControlMember => !!m);
          const members = [primary, ...others];
          members.forEach((m) => placed.add(idOf(m)));
          leaves.push({ primary, members });
        }
        if (leaves.length) drafts.push({ requirement, leaves });
      }
      if (!drafts.length) continue;

      const code = `KN${String(sections.length + 1).padStart(4, "0")}`;
      const sectionNo = ++no;
      const controls: Control[] = [];
      drafts.forEach(({ requirement, leaves }, i) => {
        const reqCode = `${code}.${i + 1}`;
        const heading = `${reqCode} ${requirement.title}`;
        if (!requirement.subcontrols.length) {
          controls.push({
            code: reqCode,
            no: ++no,
            title: requirement.title,
            description: requirement.description,
            nested: requirement.nested,
            parent: false,
            heading,
            ...leaves[0],
          });
          return;
        }
        controls.push({
          code: reqCode,
          no: ++no,
          title: requirement.title,
          description: requirement.description,
          parent: true,
          heading,
          primary: { framework, requirement },
          members: [],
        });
        leaves.forEach((leaf, j) =>
          controls.push({
            code: `${reqCode}.${j + 1}`,
            no: ++no,
            title: leaf.primary.sub!.title,
            description: leaf.primary.sub!.description,
            parent: false,
            heading,
            ...leaf,
          }),
        );
      });
      sections.push({
        kind: framework.kind,
        code,
        no: sectionNo,
        title: section.title,
        controls,
      });
    }
  }
  return sections;
}

const META_FIELDS = ["owner", "reviewer", "approver", "dueDate"];
const DETAIL_FIELDS = ["implementation", "evidence", "auditorFeedback", "status"];
const filled = (data: FrameworkControlData, fields: string[]) =>
  Object.fromEntries(
    fields.filter((f) => str(data[f]).trim()).map((f) => [f, data[f]]),
  );

/**
 * What to write on the OTHER frameworks after `entries` were saved on
 * `framework`: { slug: { key: partial data } }. Details go to each mapped leaf,
 * owner/reviewer/approver/due date to each mapped leaf's requirement. Empty
 * values are skipped so nothing already filled in elsewhere is wiped; the
 * caller merges the partial data into what is stored.
 */
export function mirrorWrites(
  framework: string,
  entries: Record<string, FrameworkControlData>,
): Record<string, Record<string, FrameworkControlData>> {
  const out: Record<string, Record<string, FrameworkControlData>> = {};
  const def = FRAMEWORKS.find((f) => f.slug === framework);
  if (!def) return out;
  const requirements = def.sections.flatMap((s) => s.requirements);
  const put = (slug: string, key: string, data: FrameworkControlData) => {
    if (!Object.keys(data).length) return;
    (out[slug] ??= {})[key] = { ...out[slug]?.[key], ...data };
  };
  for (const [key, data] of Object.entries(entries)) {
    const node = nodes.get(`${framework}:${key}`);
    const spokenFor = node
      ? [node]
      : requirements.filter((r) => r.key === key).flatMap((r) => leavesOf(def, r));
    const isLeaf = Boolean(node);
    const meta = filled(data, META_FIELDS);
    const details = filled(data, DETAIL_FIELDS);
    for (const leaf of spokenFor)
      for (const peerId of peersOf(idOf(leaf))) {
        const peer = nodes.get(peerId);
        if (!peer) continue;
        if (isLeaf) put(peer.framework.slug, leafKey(peer), details);
        put(peer.framework.slug, peer.requirement.key, meta);
      }
  }
  return out;
}
