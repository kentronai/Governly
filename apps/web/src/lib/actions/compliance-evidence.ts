"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { applications, complianceEvidence, db, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const EVIDENCE_TYPES = new Set([
  "policy", "pdf", "word", "link", "audit_report", "risk_report",
  "approval_record", "training_record",
]);

async function resolveAuthorizedTenant(slugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db.select().from(tenants).where(eq(tenants.id, slugOrId)).limit(1);
  if (!rows.length) rows = await db.select().from(tenants).where(eq(tenants.slug, slugOrId)).limit(1);
  if (!rows.length || rows[0].id !== orgId) throw new Error("Tenant access denied");
  return { tenant: rows[0], tenantId: orgId, userId };
}

export interface CreateComplianceEvidenceInput {
  tenantSlugOrId: string;
  applicationId?: string | null;
  policyId?: string | null;
  controlKey: string;
  scope: "organization" | "application";
  evidenceType: string;
  name: string;
  description?: string;
  externalUrl?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  fileContentBase64?: string;
}

export async function createComplianceEvidence(input: CreateComplianceEvidenceInput) {
  const { tenant, tenantId, userId } = await resolveAuthorizedTenant(input.tenantSlugOrId);
  if (!input.controlKey.trim() || !input.name.trim()) throw new Error("Control and evidence name are required");
  if (!EVIDENCE_TYPES.has(input.evidenceType)) throw new Error("Unsupported evidence type");
  if (input.scope === "application" && !input.applicationId) throw new Error("Application evidence requires an application");
  if (input.scope === "organization" && input.applicationId) throw new Error("Organization evidence cannot target one application");

  if (input.applicationId) {
    const application = await db.query.applications.findFirst({
      where: and(eq(applications.id, input.applicationId), eq(applications.tenantId, tenantId)),
    });
    if (!application) throw new Error("Application not found");
  }

  if (input.externalUrl) {
    const url = new URL(input.externalUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Evidence URL must use HTTP or HTTPS");
  }
  if (input.fileContentBase64) {
    if (!input.fileName || !input.mimeType || !input.fileSize) throw new Error("File metadata is incomplete");
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) throw new Error("Only PDF, Word, text, CSV and Excel evidence files are supported");
    if (input.fileSize > MAX_FILE_BYTES) throw new Error("Evidence files must be 8 MB or smaller");
    const decodedBytes = Buffer.from(input.fileContentBase64, "base64").byteLength;
    if (Math.abs(decodedBytes - input.fileSize) > 4) throw new Error("Evidence file size validation failed");
  }
  if (!input.externalUrl && !input.fileContentBase64) throw new Error("Upload a file or provide an evidence URL");

  const [created] = await db.insert(complianceEvidence).values({
    tenantId,
    applicationId: input.scope === "application" ? input.applicationId : null,
    policyId: input.policyId || null,
    controlKey: input.controlKey,
    scope: input.scope,
    evidenceType: input.evidenceType,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    externalUrl: input.externalUrl || null,
    fileName: input.fileName || null,
    mimeType: input.mimeType || null,
    fileSize: input.fileSize || null,
    // Evidence contents are encrypted with AES-256-GCM before they reach the
    // database. Metadata remains queryable, while document bytes do not.
    fileContentBase64: input.fileContentBase64 ? encryptSecret(input.fileContentBase64) : null,
    uploadedBy: userId,
  }).returning();

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "compliance_evidence.created",
    targetType: "compliance_evidence",
    targetId: created.id,
    metadata: { scope: input.scope, applicationId: input.applicationId, policyId: input.policyId, controlKey: input.controlKey, evidenceType: input.evidenceType },
  });
  revalidatePath(`/${tenant.slug}/admin/settings/policy-center`);
  if (input.applicationId) revalidatePath(`/${tenant.slug}/applications/${input.applicationId}`);
  return { ...created, fileContentBase64: undefined };
}

export async function getComplianceEvidence(input: {
  tenantSlugOrId: string;
  applicationId?: string;
  policyId?: string;
}) {
  const { tenantId } = await resolveAuthorizedTenant(input.tenantSlugOrId);
  return db.select({
    id: complianceEvidence.id,
    applicationId: complianceEvidence.applicationId,
    policyId: complianceEvidence.policyId,
    controlKey: complianceEvidence.controlKey,
    scope: complianceEvidence.scope,
    evidenceType: complianceEvidence.evidenceType,
    name: complianceEvidence.name,
    description: complianceEvidence.description,
    externalUrl: complianceEvidence.externalUrl,
    fileName: complianceEvidence.fileName,
    mimeType: complianceEvidence.mimeType,
    fileSize: complianceEvidence.fileSize,
    createdAt: complianceEvidence.createdAt,
  }).from(complianceEvidence).where(and(
    eq(complianceEvidence.tenantId, tenantId),
    eq(complianceEvidence.isActive, true),
    input.applicationId
      ? or(isNull(complianceEvidence.applicationId), eq(complianceEvidence.applicationId, input.applicationId))
      : isNull(complianceEvidence.applicationId),
    input.policyId
      ? or(isNull(complianceEvidence.policyId), eq(complianceEvidence.policyId, input.policyId))
      : undefined
  )).orderBy(desc(complianceEvidence.createdAt));
}

export async function deleteComplianceEvidence(tenantSlugOrId: string, evidenceId: string) {
  const { tenantId, userId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const [deleted] = await db.delete(complianceEvidence).where(and(
    eq(complianceEvidence.id, evidenceId), eq(complianceEvidence.tenantId, tenantId)
  )).returning({ id: complianceEvidence.id });
  if (!deleted) throw new Error("Evidence not found");
  await createAuditEvent({ tenantId, actorUserId: userId, action: "compliance_evidence.deleted", targetType: "compliance_evidence", targetId: evidenceId });
  return { success: true };
}
