import { getShadowAiActivity, listShadowAiTools } from "@/lib/actions/shadow-ai";
import { STATUS_LABEL } from "@/lib/shadow-ai";

/**
 * Shadow AI audit report (CSV): the AI tool inventory with labels, risk and reach, then the
 * full detection/decision timeline. Each timeline row carries its audit record id as the
 * verifiable reference. Signed-in tenant members only (middleware + requireActiveTenant).
 */
const FRAMEWORKS = [
  ["ISO/IEC 42001", "AI system inventory, monitoring and records of decisions"],
  ["NIST AI RMF", "GOVERN 1.6 (inventory of AI systems), MAP and MANAGE"],
  ["EU AI Act", "Art. 4 (AI literacy) and Art. 26 (deployer obligations): knowing which AI is in use"],
  ["SOC 2", "CC6 (logical access) and CC7 (system monitoring)"],
];

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote, and neutralise spreadsheet formulas (CSV injection) from tool names in logs.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};
const row = (...cells: unknown[]) => cells.map(cell).join(",");

export async function GET() {
  const [tools, activity] = await Promise.all([listShadowAiTools(), getShadowAiActivity(1000)]);
  const generated = new Date().toISOString();
  const lines = [
    row("Governly Shadow AI report"),
    row("Generated", generated),
    "",
    row("Framework", "What this report evidences"),
    ...FRAMEWORKS.map((f) => row(...f)),
    "",
    row("AI tool inventory"),
    row("Tool", "Category", "Label", "Label reason", "Risk (0-100)", "Risk basis", "Machines", "Users", "First detected", "Last seen", "Blocked at", "Approved alternative"),
    ...tools.map((t) =>
      row(t.name, t.category, STATUS_LABEL[t.status], t.statusReason, t.risk, t.riskBasis, t.machines, t.users, t.firstSeenAt, t.lastSeenAt, t.blockedAt, t.alternative),
    ),
    "",
    row("Timeline (detections, labels, risk overrides, blocks)"),
    row("When", "Event", "Tool", "By", "Details", "Audit record id"),
    ...activity.map((a) => row(a.createdAt, a.action.replace("shadow_ai.", ""), a.tool, a.actor, a.message, a.id)),
  ];
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shadow-ai-report-${generated.slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
