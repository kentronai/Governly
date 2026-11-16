/**
 * Server actions for Model Scans
 * Used to fetch scan results for provider models
 */

"use server";

import { db, modelScans, modelArtifacts } from "@db";
import { eq, and, desc } from "drizzle-orm";
import { requireActiveTenant } from "@/lib/server/tenant-access";

export const getModelScanResultsByUrl = async (
  modelUrl: string,
) => {
  // Tenant comes from the session: one tenant can never read another's scans.
  const { tenantId } = await requireActiveTenant();

  try {
    // Trim the modelUrl to remove any leading/trailing spaces
    const trimmedUrl = modelUrl.trim();

    const [artifact] = await db
      .select()
      .from(modelArtifacts)
      .where(and(eq(modelArtifacts.uri, trimmedUrl), eq(modelArtifacts.tenantId, tenantId)))
      .limit(1);

    if (!artifact) {
      return null;
    }

    const [scan] = await db
      .select()
      .from(modelScans)
      .where(and(eq(modelScans.artifactId, artifact.id), eq(modelScans.tenantId, tenantId)))
      .orderBy(desc(modelScans.createdAt))
      .limit(1);

    if (!scan) {
      return null;
    }

    // Return the scan results in the format expected by the ModelGuard UI
    const reportJson = scan.reportJson as any;

    // Count findings by severity - the findings are nested under security.findings.details
    const findings = reportJson?.security?.findings?.details || [];

    // Get severity counts from the by_severity object if available, otherwise count manually
    const bySeverity = reportJson?.security?.findings?.by_severity || {};
    const severityCounts = {
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
      medium: bySeverity.medium || 0,
      low: bySeverity.low || 0,
      info: bySeverity.info || 0,
    };

    // If by_severity is not available, count manually
    if (Object.values(severityCounts).every((count) => count === 0)) {
      findings.forEach((finding: any) => {
        const severity = finding.severity?.toLowerCase();
        if (severityCounts.hasOwnProperty(severity)) {
          severityCounts[severity as keyof typeof severityCounts]++;
        }
      });
    }

    const result = {
      scan_id: scan.id,
      artifact_id: artifact.id,
      status: scan.status,
      format: artifact.detectedFormat,
      findings_count: reportJson?.security?.findings?.total || findings.length,
      critical_count: severityCounts.critical,
      high_count: severityCounts.high,
      medium_count: severityCounts.medium,
      low_count: severityCounts.low,
      info_count: severityCounts.info,
      approval_status: artifact.approvalStatus,
      blocked_reason: artifact.blockedReason,
      registry_synced: true, // Since it's in the registry
      scan_duration_ms:
        reportJson?.scan?.duration_ms ||
        (reportJson?.metadata?.scan_duration
          ? reportJson.metadata.scan_duration * 1000
          : undefined),
      created_at: scan.createdAt,
      completed_at: scan.finishedAt,
      cached: false,
      findings: findings.map((finding: any) => ({
        id: finding.id || `finding-${Math.random()}`,
        type: finding.type || finding.category || "security",
        severity: finding.severity || "medium",
        title: finding.title || finding.name || "Security Finding",
        description:
          finding.description || finding.message || "No description available",
        recommendation: finding.recommendation || finding.suggestion,
        evidence: finding.evidence || finding.details,
        scanner: finding.scanner || finding.rule_id || "Model Guard",
        location: finding.location?.file || finding.file,
        created_at: finding.created_at || scan.createdAt,
      })),
      metadata: {
        model_name:
          reportJson?.model?.metadata?.description ||
          reportJson?.sbom?.model_info?.description ||
          artifact.filename,
        model_size:
          reportJson?.model?.metadata?.file_size ||
          reportJson?.sbom?.model_info?.file_size ||
          artifact.sizeBytes,
        scan_duration: reportJson?.scan?.duration_ms
          ? reportJson.scan.duration_ms / 1000
          : undefined,
        engine_version: scan.engineVersion,
        detected_format: artifact.detectedFormat,
        approval_status: artifact.approvalStatus,
      },
      finished_at: scan.finishedAt,
    };
    return result;
  } catch (error) {
    console.error("Error fetching model scan results by URL:", error);
    return null;
  }
};
