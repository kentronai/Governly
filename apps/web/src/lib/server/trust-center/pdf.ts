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
const DASH = "\u2014";
const cell = (v: string) => (v === NOT_SPECIFIED ? DASH : v);

/** Governly mark (src/assets/images/governly-logo.svg): a shield with a "G" cut out. */
function governlyMark(doc: Doc, x: number, y: number, size: number, fg: string, bg: string) {
  doc.save().translate(x, y).scale(size / 64);
  doc.path("M32 3 56 11v19c0 15-10 26-24 31C18 56 8 45 8 30V11Z").fill(fg);
  doc.path("M43 22.5A14 14 0 1 0 46 32H33").lineWidth(5.5).stroke(bg);
  doc.restore();
}

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
      Creator: "Governly", Producer: "Governly",
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

  /** One muted line listing items with a missing field, instead of a column full of blanks. */
  const unknowns = (label: string, names: string[]) => {
    if (names.length) para(`${label}: ${names.join(", ")}.`, { color: MUTED, size: 8.5 });
  };
  const callout = (title: string, body: string) => {
    doc.font("Helvetica").fontSize(9.5);
    const h = doc.heightOfString(body, { width: CONTENT_W - 28 }) + 38;
    ensure(h + 8);
    const y = doc.y;
    artifact(() => {
      doc.rect(M.left, y, CONTENT_W, h).fill("#FEF7E6");
      doc.rect(M.left, y, 3, h).fill("#B45309");
    });
    tagged("P", () => doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#7C2D12").text(title, M.left + 14, y + 10, { width: CONTENT_W - 28 }));
    tagged("P", () => doc.font("Helvetica").fontSize(9.5).fillColor(TEXT).text(body, M.left + 14, doc.y + 3, { width: CONTENT_W - 28, lineGap: 2 }));
    doc.x = M.left;
    doc.y = y + h + 10;
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
  artifact(() => {
    governlyMark(doc, PAGE.w - M.right - 104, 50, 16, "#FFFFFF", NAVY);
    doc.font("Helvetica").fontSize(9).fillColor("#BFD7F2").text("Prepared with Governly", PAGE.w - M.right - 84, 54, { width: 84, lineBreak: false });
  });
  doc.y = 52;
  tagged("P", () => doc.font("Helvetica-Bold").fontSize(10).fillColor("#BFD7F2").text("AI TRUST CENTER", M.left, doc.y));
  doc.moveDown(0.6);
  tagged("H1", () => doc.font("Helvetica-Bold").fontSize(26).fillColor("#FFFFFF").text("AI Trust Center Report", M.left, doc.y));
  doc.moveDown(0.2);
  tagged("P", () => doc.font("Helvetica-Bold").fontSize(15).fillColor("#FFFFFF").text(data.orgName, M.left, doc.y));
  doc.moveDown(0.3);
  tagged("P", () =>
    doc.font("Helvetica").fontSize(10.5).fillColor("#E5EEF8").text("AI models, customer data practices, regulatory alignment and sub-processors", M.left, doc.y),
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
  const aligned = data.frameworks.filter((f) => f.status === "Aligned").length;
  const tiles: [string, string][] = [
    [String(activeModels), "AI models in production or pilot"],
    [String(data.subprocessors.length), "Active sub-processors"],
    [String(assessed), "Frameworks and regulations assessed"],
    [training === "N/A" ? "None" : training, training === "N/A" ? "Training policy published" : "Customer data used for model training by default"],
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
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const providers = [...new Set(data.models.filter((m) => m.stage !== "Retired").map((m) => m.hosting.match(/\(([^)]+)\)/)?.[1]).filter(Boolean))];
  para(
    `This report describes how ${data.orgName} uses and governs artificial intelligence. It is generated from live records in Governly ` +
      `(model registry, policy assessments, control evidence and vendor data) and covers the reporting period ${period}.`,
  );
  const points = [
    `${data.orgName} has ${plural(activeModels, "AI model")} in production or pilot` +
      (providers.length ? `, supplied by ${providers.join(", ")}` : "") +
      (tierCount("High") ? `, of which ${tierCount("High")} support high-risk use cases under the EU AI Act` : "") + ".",
    assessed
      ? `${assessed} ${assessed === 1 ? "framework or regulation has" : "frameworks and regulations have"} been assessed, ${aligned ? `${aligned} of them fully aligned` : "with remediation in progress for all of them"}.`
      : "No framework assessments have been recorded yet.",
    `${plural(data.subprocessors.length, "sub-processor")} ${data.subprocessors.length === 1 ? "is" : "are"} involved in delivering AI capabilities.`,
    data.training
      ? `Customer data ${training === "On" ? "is" : "is not"} used for model training by default (policy ${data.training.policyId}, version ${data.training.version}).`
      : "A customer data training policy has not yet been published.",
  ];
  para(`Highlights for this period: ${points.join(" ")}`);

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
      para(`The AI models ${data.orgName} uses, as recorded in its model registry on ${fmtDate(options.periodEnd)}. The EU AI Act tier reflects the strictest classification of any application that uses the model.`, { color: MUTED, size: 9.5 });
      if (!data.models.length) para("No AI models have been registered.");
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
          data.models.map((m) => [m.name, m.type, m.hosting, m.stage, m.purpose, m.euTier].map(cell)),
        );
      unknowns("Business purpose not yet documented", data.models.filter((m) => m.purpose === NOT_SPECIFIED).map((m) => m.name));
    }
    if (s.key === "training") {
      if (!data.training) callout("No customer data training policy has been published", `${data.orgName} has not yet published a policy stating whether customer data may be used to train AI models. Until one is published, no statement is made in this report.`);
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
      para("Alignment with AI, security and privacy frameworks, based on application assessments, control evidence and administrator attestations. Coverage is the average share of requirements met across assessed applications.", { color: MUTED, size: 9.5 });
      table(
        [
          { header: "Framework", width: 1.3 },
          { header: "Scope", width: 1.4 },
          { header: "Status", width: 1.0 },
          { header: "Evidence", width: 1.7 },
          { header: "Last assessed", width: 0.8 },
        ],
        data.frameworks.map((f) => [f.name, f.scope, f.status, f.evidence, f.lastAssessed].map(cell)),
      );
    }
    if (s.key === "subprocessors") {
      para(`Third parties involved in delivering ${data.orgName}'s AI capabilities: model providers, connected platforms and vendors under review. Service and location details come from Governly vendor research where available.`, { color: MUTED, size: 9.5 });
      if (!data.subprocessors.length) para("No sub-processors have been identified.");
      else
        table(
          [
            { header: "Sub-processor", width: 1.2 },
            { header: "Service", width: 1.3 },
            { header: "Data processed", width: 1.4 },
            { header: "Processing locations", width: 1.1 },
            { header: "DPA signed", width: 0.7 },
          ],
          data.subprocessors.map((p) => [p.name, p.service, p.dataProcessed, p.locations, p.dpa].map(cell)),
        );
      unknowns("Processing locations not yet recorded", data.subprocessors.filter((p) => p.locations === NOT_SPECIFIED).map((p) => p.name));
      unknowns("DPA status not yet recorded", data.subprocessors.filter((p) => p.dpa === NOT_SPECIFIED).map((p) => p.name));
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
      const contacts: [string, string | undefined][] = [
        ["Privacy enquiries", g.privacyContact],
        ["Security and incident reports", g.securityContact],
        ["AI governance", g.aiGovernanceContact],
        ["Review cadence", g.reviewCadence],
        ["Next scheduled review", g.nextReview],
      ];
      const known = contacts.filter(([, v]) => v?.trim());
      if (known.length) table([{ header: "Topic", width: 1 }, { header: "Detail", width: 2 }], known.map(([k, v]) => [k, v!]));
      unknowns("Not yet published", contacts.filter(([, v]) => !v?.trim()).map(([k]) => k));
      para(
        `Methodology: ${
          g.methodology ||
          "the model inventory is drawn from the Governly model registry, framework status from application assessments and control evidence, and sub-processors from model providers, connected integrations and tracked vendors, as of the report generation date."
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
      governlyMark(doc, M.left, PAGE.h - 41, 11, NAVY, "#FFFFFF");
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
      doc.text(`Prepared with Governly  |  Confidential  |  ${reportId}`, M.left + 15, PAGE.h - 38, { width: CONTENT_W * 0.7, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, M.left + CONTENT_W * 0.7, PAGE.h - 38, { width: CONTENT_W * 0.3, align: "right", lineBreak: false });
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
