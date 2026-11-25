# AI Trust Center report

Admins can generate a PDF that tells customers and auditors how the organization uses AI. It is built
from live Governly data at the moment you generate it.

## Generate a report

1. Open **Admin Center > Admin Home** (AI Trust Center card) or **Admin Center > AI Trust Center**.
2. Click **Generate AI Trust Center Report**. Only admins (Clerk `org:admin`) see the button, and the
   server refuses other users.
3. Choose the reporting period (default: the last full quarter; any of the last four quarters or a
   custom range), the sections, the **Confidential** watermark and whether to list previously used
   sub-processors.
4. **Generate PDF** downloads the file. Each report gets an ID like `TCR-20261125-QQZV`, printed on the
   cover and in every page footer.

Every generation is written to the audit log (`trust_center.report.generated`, with the admin,
timestamp, period, sections and report ID). Shares and downloads are audited too.

## Recent reports and sharing

The **Trust Center reports** card on the AI Trust Center page lists recent reports. Downloads work for
7 days after generation. An admin can switch **Shared** on for a report; members who are not admins
can then see and download it. Reports are stored encrypted (AES-256-GCM, `AWS_CREDENTIALS_ENCRYPTION_KEY`).

## Where each section comes from

| Section | Source |
| --- | --- |
| 1. AI models deployed | Model Registry (`provider_models` of the tenant). Stage: available = Production, preview = Pilot, deprecated/unavailable = Retired. Region comes from the hosting location of applications that use the model; EU AI Act tier is the strictest EU AI Act assessment of those applications. Missing values print "Not specified" / "Not assessed". |
| 2. Customer data training policy | The latest version published on the AI Trust Center page (policy ID, version, effective date, owner, statement, data categories). |
| 3. Framework alignment | Ten fixed frameworks. Status and evidence come from the requirements trackers under Regulations & Frameworks; a framework that is not enabled prints "Not applicable" with a reason. Admins can override status, evidence, last assessed date and the reason. |
| 4. Sub-processors | Vendors tracked in Trust Dossier. Service and locations default to the Trust Dossier catalog; data processed and DPA status are set by admins. Untracking a vendor keeps it as "previously used". |
| 5. Governance, contacts and methodology | Contacts, review cadence, next review and methodology set on the AI Trust Center page. |

## Admin-editable content

On **Admin Center > AI Trust Center**: the training policy (each publish adds a version), governance
contacts and cadence, framework overrides, and sub-processor details. Non-admins see these read-only.

## Technical notes

- The PDF is rendered server-side with `pdfkit` (pure JavaScript, no browser in the Docker image). It
  has real, selectable text, a tagged structure tree (headings, lists, tables with header cells), the
  document title and language set, and the header, footer and watermark marked as artifacts. 50 models
  and 100 sub-processors render in well under a second.
- `next.config.js` keeps `pdfkit` external and traces its font metric files into the standalone build.
- Tables: `trust_center_settings`, `trust_center_training_policies`, `trust_center_reports`, and
  `trust_dossier_tracked.removed_at` (migration `0072_trust_center_reports`).
