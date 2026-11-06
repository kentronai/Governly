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
const SHARED_MANAGEMENT_CLAUSES = [
  "4.1", "4.2", "4.3", "4.4", "5.2", "6.1.1", "6.2", "6.3", "7.1", "7.3",
  "7.4", "7.5", "8.1", "9.1", "9.2", "9.3", "10.1", "10.2",
];

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
  // ISO/IEC 42001 and 27001 share the Annex SL clause structure: the same clause asks
  // for the same thing. The AI/security-specific risk and impact clauses are left unlinked.
  ...SHARED_MANAGEMENT_CLAUSES.map((key) => [
    `iso-42001:${key}`,
    `iso-27001:${key}`,
  ]),
  ["iso-42001:5.1", "iso-27001:5.1", "nist-ai-rmf:2.3"], // leadership and executive accountability
  [
    "iso-42001:5.3",
    "iso-27001:5.3",
    "soc-2-type-ii:1.3",
    "nist-ai-rmf:2.1",
  ], // roles and responsibilities
  ["iso-42001:7.2", "iso-27001:7.2", "nist-ai-rmf:2.2"], // competence and training
  // GDPR and CCPA ask for the same data-subject and security duties.
  ["gdpr:2.2", "ccpa:1.1"], // access / right to know
  ["gdpr:2.3", "ccpa:1.2"], // erasure / right to delete
  ["gdpr:3.2", "ccpa:2.2"], // records of processing / data inventory
  ["gdpr:3.3", "ccpa:3.1"], // security of processing / reasonable security
  ["gdpr:3.4", "ccpa:3.2"], // breach notification
  // DORA and SOC 2 system operations.
  ["dora:2.1", "soc-2-type-ii:5.2"], // incident detection / security monitoring
  ["dora:3.1", "soc-2-type-ii:5.1"], // vulnerability assessment / vulnerability management
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
 * Permanent control IDs. Every control gets its ID from its fixed place in the full
 * framework list, per kind, never from what a tenant has enabled — so enabling or
 * disabling a policy can't renumber anything. Regulations and frameworks each count
 * from KN0001 and never share rows. Add new frameworks at the END of FRAMEWORKS (and
 * new requirements at the end of a section) so existing IDs stay put; the snapshot
 * test fails on any change.
 * KN0001 = section, KN0001.1 = requirement, KN0001.1.1 = subcontrol.
 */
const sectionCodes = new Map<string, string>(); // "slug:sectionKey"
const requirementCodes = new Map<string, string>(); // "slug:requirementKey"
const leafCodes = new Map<string, string>(); // leaf id
for (const kind of ["regulation", "framework"] as const) {
  let sectionNo = 0;
  for (const framework of FRAMEWORKS.filter((f) => f.kind === kind))
    for (const section of framework.sections) {
      const code = `KN${String(++sectionNo).padStart(4, "0")}`;
      sectionCodes.set(`${framework.slug}:${section.key}`, code);
      section.requirements.forEach((requirement, i) => {
        const reqCode = `${code}.${i + 1}`;
        requirementCodes.set(`${framework.slug}:${requirement.key}`, reqCode);
        if (!requirement.subcontrols.length)
          leafCodes.set(`${framework.slug}:${requirement.key}`, reqCode);
        requirement.subcontrols.forEach((sub, j) =>
          leafCodes.set(`${framework.slug}:${sub.key}`, `${reqCode}.${j + 1}`),
        );
      });
    }
}

/** Every control ID with the control it belongs to, for the ID snapshot test. */
export const controlCodes = () =>
  [...leafCodes].map(([id, code]) => ({
    kind: nodes.get(id)!.framework.kind,
    code,
    id,
  }));

/**
 * Kentron control library for the enabled frameworks: regulations first, then
 * frameworks, each listed in framework order with its own row numbers (1, 2, 3…)
 * and its own permanent IDs. Every control keeps its own row; equivalent controls
 * (EQUIVALENT_CONTROLS) are shown in `members` and are filled in together when one
 * is saved, whether or not their framework is enabled or of the other kind.
 */
export function buildControls(
  enabled: FrameworkDefinition[],
): ControlSection[] {
  const sections: ControlSection[] = [];
  for (const kind of ["regulation", "framework"] as const) {
    let no = 0;
    for (const framework of enabled.filter((f) => f.kind === kind)) {
      for (const section of framework.sections) {
        const code = sectionCodes.get(`${framework.slug}:${section.key}`)!;
        const sectionNo = ++no;
        const controls: Control[] = [];
        for (const requirement of section.requirements) {
          const reqCode = requirementCodes.get(
            `${framework.slug}:${requirement.key}`,
          )!;
          const heading = `${reqCode} ${requirement.title}`;
          const membersOf = (primary: ControlMember) => [
            primary,
            ...peersOf(idOf(primary))
              .map((id) => nodes.get(id))
              .filter((m): m is ControlMember => !!m),
          ];
          if (!requirement.subcontrols.length) {
            const primary: ControlMember = { framework, requirement };
            controls.push({
              code: reqCode,
              no: ++no,
              title: requirement.title,
              description: requirement.description,
              nested: requirement.nested,
              parent: false,
              heading,
              primary,
              members: membersOf(primary),
            });
            continue;
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
          for (const sub of requirement.subcontrols) {
            const primary: ControlMember = { framework, requirement, sub };
            controls.push({
              code: leafCodes.get(idOf(primary))!,
              no: ++no,
              title: sub.title,
              description: sub.description,
              parent: false,
              heading,
              primary,
              members: membersOf(primary),
            });
          }
        }
        sections.push({ kind, code, no: sectionNo, title: section.title, controls });
      }
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
