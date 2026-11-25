import "server-only";
import PDFDocument from "pdfkit";
import { loadReportData, type ReportData } from "./data";
import {
  fmtDate,
  newReportId,
  NOT_SPECIFIED,
  REPORT_SECTIONS,
  type ReportOptions,
} from "@/lib/trust-center/report";

/**
 * Renders the AI Trust Center report with pdfkit: real text, a tagged structure tree
 * (H1/H2/P/L/Table), document title + language metadata, and header/footer/watermark
 * marked as artifacts. Colours meet WCAG AA contrast (navy on white, white on navy).
 */

const NAVY = "#0B1F3A";
const TEXT = "#1F2937";
const MUTED = "#4B5563";
const HEAD_BG = "#DCE8F5";
const BORDER = "#C7D2E0";
const PAGE = { w: 612, h: 792 };
const M = { top: 64, bottom: 60, left: 54, right: 54 };
const CONTENT_W = PAGE.w - M.left - M.right;

type Doc = PDFKit.PDFDocument;

export interface RenderInput {
  data: ReportData;
  options: ReportOptions;
  reportId: string;
  generatedAt: Date;
}

export async function renderTrustCenterPdf({ data, options, reportId, generatedAt }: RenderInput): Promise<Buffer> {
  const generated = fmtDate(generatedAt.toISOString(), "long");
  const generatedShort = fmtDate(generatedAt.toISOString(), "short");
  const period = `${fmtDate(options.periodStart)} to ${fmtDate(options.periodEnd)}`;
  const title = `AI Trust Center Report: ${data.orgName}`;

  const doc = new PDFDocument({
    size: "LETTER",
    margins: M,
    bufferPages: true,
    tagged: true,
    lang: "en-US",
    displayTitle: true,
    pdfVersion: "1.7",
    info: {
      Title: title,
      Author: data.orgName,
      Subject: `AI models, customer data policy, framework alignment and sub-processors. ${period}.`,
      Keywords: `AI Trust Center, ${reportId}`,
      Creator: "Governly",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const root = doc.struct("Document");
  doc.addStructure(root);

  const artifact = (draw: () => void) => {
    doc.markContent("Artifact");
    draw();
    doc.endMarkedContent();
  };
  const maxY = () => PAGE.h - M.bottom;
  const ensure = (h: number) => {
    if (doc.y + h > maxY()) doc.addPage();
  };
  const tagged = (type: string, draw: () => void) => root.add(doc.struct(type, {}, draw));
  const para = (text: string, opts: { size?: number; color?: string; bold?: boolean; gap?: number } = {}) => {
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size ?? 10);
    ensure(doc.heightOfString(text, { width: CONTENT_W }) + 2);
    tagged("P", () => {
      doc.fillColor(opts.color ?? TEXT).text(text, M.left, doc.y, { width: CONTENT_W, lineGap: 2 });
    });
    doc.moveDown(opts.gap ?? 0.6);
  };
  const heading = (text: string, level: "H1" | "H2" = "H2") => {
    ensure(level === "H1" ? 90 : 60);
    doc.moveDown(0.4);
    tagged(level, () => {
      doc.font("Helvetica-Bold").fontSize(level === "H1" ? 16 : 13).fillColor(NAVY).text(text, M.left, doc.y, { width: CONTENT_W });
    });
    doc.moveDown(0.5);
  };

  const table = (cols: { header: string; width: number }[], rows: string[][]) => {
    const pad = 5;
    const widths = cols.map((c) => (c.width * CONTENT_W) / cols.reduce((s, x) => s + x.width, 0));
    const t = doc.struct("Table");
    root.add(t);
    const rowHeight = (cells: string[], bold: boolean) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 9 : 9);
      return Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: widths[i] - pad * 2, lineGap: 1 }))) + pad * 2;
    };
    const drawRow = (cells: string[], header: boolean, tag: boolean) => {
      const h = rowHeight(cells, header);
      const y = doc.y;
      artifact(() => {
        let x = M.left;
        widths.forEach((w) => {
          doc.rect(x, y, w, h).lineWidth(0.5).fillAndStroke(header ? HEAD_BG : "#FFFFFF", BORDER);
          x += w;
        });
      });
      const drawCells = () => {
        let x = M.left;
        return cells.map((c, i) => {
          const cx = x;
          x += widths[i];
          return () => {
            doc
              .font(header ? "Helvetica-Bold" : "Helvetica")
              .fontSize(9)
              .fillColor(header ? NAVY : TEXT)
              .text(c, cx + pad, y + pad, { width: widths[i] - pad * 2, lineGap: 1 });
          };
        });
      };
      if (tag) {
        const tr = doc.struct("TR");
        t.add(tr);
        drawCells().forEach((draw) => tr.add(doc.struct(header ? "TH" : "TD", {}, draw)));
        tr.end();
      } else {
        // Header repeated after a page break: visual only, already in the tag tree.
        artifact(() => drawCells().forEach((draw) => draw()));
      }
      doc.x = M.left;
      doc.y = y + h;
    };
    const headers = cols.map((c) => c.header);
    ensure(rowHeight(headers, true) + rowHeight(rows[0] ?? headers, false));
    drawRow(headers, true, true);
    for (const r of rows) {
      if (doc.y + rowHeight(r, false) > maxY()) {
        doc.addPage();
        drawRow(headers, true, false);
      }
      drawRow(r, false, true);
    }
    t.end();
    doc.moveDown(0.8);
  };

  // ---- Cover -------------------------------------------------------------
  const bandH = 236;
  artifact(() => doc.rect(0, 0, PAGE.w, bandH).fill(NAVY));
  doc.y = 52;
  tagged("P", () => doc.font("Helvetica-Bold").fontSize(10).fillColor("#BFD7F2").text("AI TRUST CENTER", M.left, doc.y));
  doc.moveDown(0.6);
  tagged("H1", () => doc.font("Helvetica-Bold").fontSize(26).fillColor("#FFFFFF").text("AI Trust Center Report", M.left, doc.y));
  doc.moveDown(0.2);
  tagged("P", () => doc.font("Helvetica-Bold").fontSize(15).fillColor("#FFFFFF").text(data.orgName, M.left, doc.y));
  doc.moveDown(0.3);
  tagged("P", () =>
    doc.font("Helvetica").fontSize(10.5).fillColor("#E5EEF8").text("AI models, customer data policy, framework alignment and sub-processors", M.left, doc.y),
  );
  doc.moveDown(0.9);
  tagged("P", () =>
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor("#E5EEF8")
      .text(`Report generated: ${generated}\nReporting period: ${period}\nReport ID: ${reportId}`, M.left, doc.y, { lineGap: 2 }),
  );

  // Stat tiles
  const activeModels = data.models.filter((m) => m.stage !== "Retired").length;
  const training = data.training
    ? data.training.categories.some((c) => /^yes/i.test(c.usedForTraining.trim()) && !/opt-in/i.test(c.usedForTraining))
      ? "On"
      : "Off"
    : "N/A";
  const assessed = data.frameworks.filter((f) => f.status !== "Not applicable").length;
  const tiles: [string, string][] = [
    [String(activeModels), "AI models in production or pilot"],
    [String(data.subprocessors.length), "Active sub-processors"],
    [String(assessed), "Compliance frameworks assessed"],
    [training, "Customer data used for model training by default"],
  ];
  const tileY = bandH + 18;
  const gap = 10;
  const tileW = (CONTENT_W - gap * 3) / 4;
  const tileH = 74;
  artifact(() =>
    tiles.forEach((_, i) =>
      doc.roundedRect(M.left + i * (tileW + gap), tileY, tileW, tileH, 4).lineWidth(0.75).fillAndStroke("#F3F7FC", BORDER),
    ),
  );
  const tileList = doc.struct("L");
  root.add(tileList);
  tiles.forEach(([value, label], i) => {
    const x = M.left + i * (tileW + gap) + 10;
    tileList.add(
      doc.struct("LI", {}, [
        doc.struct("LBody", {}, () => {
          doc.font("Helvetica-Bold").fontSize(20).fillColor(NAVY).text(value, x, tileY + 10, { width: tileW - 20 });
          doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(label, x, tileY + 36, { width: tileW - 20 });
        }),
      ]),
    );
  });
  tileList.end();
  doc.x = M.left;
  doc.y = tileY + tileH + 14;

  // Executive summary
  const sections = REPORT_SECTIONS.filter((s) => options.sections.includes(s.key));
  heading("Executive summary");
  const tierCount = (t: string) => data.models.filter((m) => m.stage !== "Retired" && m.euTier.startsWith(t)).length;
  para(
    `This report summarizes how ${data.orgName} develops, deploys and governs artificial intelligence. ` +
      `It covers ${sections.map((s) => (s.title.startsWith("AI") ? s.title : s.title.toLowerCase())).join(", ")}, using live data from the Governly platform at the time of generation.`,
  );
  para(
    `Key points for this period: ${activeModels} AI model${activeModels === 1 ? "" : "s"} in production or pilot` +
      (tierCount("High") ? `, ${tierCount("High")} classified high risk under the EU AI Act` : "") +
      `; ${assessed} of ${data.frameworks.length} frameworks in scope; ${data.subprocessors.length} active sub-processor${data.subprocessors.length === 1 ? "" : "s"}; ` +
      `customer data used for model training by default: ${training === "N/A" ? "no policy published" : training}.`,
  );

  // Contents: kept together so it never spills onto an otherwise empty page.
  ensure(30 + sections.length * 16);
  heading("Contents");
  const list = doc.struct("L");
  root.add(list);
  sections.forEach((s, i) =>
    list.add(
      doc.struct("LI", {}, [
        doc.struct("LBody", {}, () => doc.font("Helvetica").fontSize(10).fillColor(TEXT).text(`${i + 1}. ${s.title}`, M.left + 8, doc.y, { lineGap: 4 })),
      ]),
    ),
  );
  list.end();

  // ---- Sections ----------------------------------------------------------
  doc.addPage();
  sections.forEach((s, i) => {
    heading(`${i + 1}. ${s.title}`, "H2");
    if (s.key === "models") {
      para(`Inventory of AI models registered in the Governly Model Registry as of ${fmtDate(options.periodEnd)}. EU AI Act tier is the strictest classification of the applications that use the model.`, { color: MUTED, size: 9.5 });
      if (!data.models.length) para("No AI models are registered.");
      else
        table(
          [
            { header: "Model", width: 1.3 },
            { header: "Type", width: 1.1 },
            { header: "Hosting and region", width: 1.4 },
            { header: "Stage", width: 0.8 },
            { header: "Business purpose", width: 1.6 },
            { header: "EU AI Act tier", width: 1.1 },
          ],
          data.models.map((m) => [m.name, m.type, m.hosting, m.stage, m.purpose, m.euTier]),
        );
    }
    if (s.key === "training") {
      if (!data.training) para("No customer data training policy has been published in Governly. An administrator can publish one under Admin Center > AI Trust Center.");
      else {
        const t = data.training;
        para(`Policy ID: ${t.policyId} | Version ${t.version} | Effective ${fmtDate(t.effectiveDate)} | Owner: ${t.owner}`, { bold: true, color: NAVY });
        if (t.statement.trim()) para(t.statement);
        if (t.categories.length)
          table(
            [
              { header: "Data category", width: 1.4 },
              { header: "Used for model training", width: 1.2 },
              { header: "Conditions", width: 2.4 },
            ],
            t.categories.map((c) => [c.category || NOT_SPECIFIED, c.usedForTraining || NOT_SPECIFIED, c.conditions || NOT_SPECIFIED]),
          );
      }
    }
    if (s.key === "frameworks") {
      para('Status reflects the Governly requirements tracker or the latest assessment recorded by an administrator. "Not applicable" rows state the reason.', { color: MUTED, size: 9.5 });
      table(
        [
          { header: "Framework", width: 1.3 },
          { header: "Scope", width: 1.4 },
          { header: "Status", width: 1.0 },
          { header: "Evidence", width: 1.7 },
          { header: "Last assessed", width: 0.8 },
        ],
        data.frameworks.map((f) => [f.name, f.scope, f.status, f.evidence, f.lastAssessed]),
      );
    }
    if (s.key === "subprocessors") {
      para(`Third parties that process customer data on behalf of ${data.orgName}, from the vendors tracked in Governly Trust Dossier.`, { color: MUTED, size: 9.5 });
      if (!data.subprocessors.length) para("No active sub-processors are recorded.");
      else
        table(
          [
            { header: "Sub-processor", width: 1.2 },
            { header: "Service", width: 1.3 },
            { header: "Data processed", width: 1.4 },
            { header: "Processing locations", width: 1.1 },
            { header: "DPA signed", width: 0.7 },
          ],
          data.subprocessors.map((p) => [p.name, p.service, p.dataProcessed, p.locations, p.dpa]),
        );
      if (options.includePreviousSubprocessors)
        para(
          data.previousSubprocessors.length
            ? `Previously used (no longer processing customer data): ${data.previousSubprocessors
                .map((p) => `${p.name} (removed ${fmtDate(p.removedAt ?? null, "short")})`)
                .join("; ")}.`
            : "Previously used: none.",
          { color: MUTED, size: 9.5 },
        );
    }
    if (s.key === "governance") {
      const g = data.settings;
      para(
        `Privacy questions: ${g.privacyContact || NOT_SPECIFIED}. Security questions and incident reports: ${g.securityContact || NOT_SPECIFIED}. AI governance review: ${g.aiGovernanceContact || NOT_SPECIFIED}.`,
      );
      para(`AI governance review cadence: ${g.reviewCadence || NOT_SPECIFIED}. Next scheduled review: ${g.nextReview || NOT_SPECIFIED}.`);
      para(
        `Methodology: ${
          g.methodology ||
          "model inventory is generated from the Governly Model Registry, sub-processor data from Trust Dossier, and framework status from Governly Regulations & Frameworks as of the report generation date."
        }`,
      );
      para("Disclaimer: this report is provided for information only and does not constitute legal advice or a warranty.", { color: MUTED, size: 8.5 });
    }
  });
  root.end();

  // ---- Running header, footer, watermark (artifacts) ---------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing in the margin must not trigger a page break
    artifact(() => {
      if (i > 0) {
        doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
        doc.text(`AI Trust Center | ${data.orgName}`, M.left, 30, { width: CONTENT_W / 2, lineBreak: false });
        doc.text(`Report generated ${generatedShort}`, M.left + CONTENT_W / 2, 30, { width: CONTENT_W / 2, align: "right", lineBreak: false });
        doc.moveTo(M.left, 44).lineTo(PAGE.w - M.right, 44).lineWidth(0.5).stroke(BORDER);
      }
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
      doc.text(`Confidential. Report ID ${reportId}`, M.left, PAGE.h - 38, { width: CONTENT_W / 2, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, M.left + CONTENT_W / 2, PAGE.h - 38, { width: CONTENT_W / 2, align: "right", lineBreak: false });
      if (options.watermark) {
        doc.save();
        doc.rotate(-35, { origin: [PAGE.w / 2, PAGE.h / 2] });
        doc.font("Helvetica-Bold").fontSize(72).fillColor("#9CA3AF").opacity(0.12);
        doc.text("CONFIDENTIAL", -150, PAGE.h / 2 - 36, { width: PAGE.w + 300, align: "center", lineBreak: false });
        doc.restore();
      }
    });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  return done;
}

/** Assembles live data and renders the PDF. No auth: callers (server actions, scripts) check access. */
export async function buildTrustCenterReport(tenantId: string, options: ReportOptions) {
  const generatedAt = new Date();
  const reportId = newReportId(generatedAt);
  const data = await loadReportData(tenantId, options);
  const pdf = await renderTrustCenterPdf({ data, options, reportId, generatedAt });
  return { reportId, pdf };
}
