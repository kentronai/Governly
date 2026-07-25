/**
 * Server-side creation of the default "Launch" policy for an application.
 *
 * Why this exists: the previous auto-create lived client-side in ApplicationsList,
 * was host-gated to app.kentron.ai, and POSTed hardcoded guardrail UUIDs that exist
 * in no database — so it silently failed and new applications had no policy. This
 * resolves the default guardrails by STABLE KEY (per-tenant or global) and calls the
 * ControlNet gateway (the canonical policy authority, which generates the YAML), so
 * the result is identical to a user-built policy.
 *
 * Scoped to app.kentron.ai / kentron-production behavior; environment-agnostic code.
 */

"use server";

import { db, guardrails, applicationPolicies } from "@db";
import { and, or, eq, isNull, inArray } from "drizzle-orm";

// The only guards that are BOTH registered in the gateway AND present in the
// guardrails catalog (see docs/superpowers/specs/2026-05-29-guard-catalog-and-default-policy-design.md).
const DEFAULT_GUARD_KEYS = [
  "pii.detect",
  "jailbreak.detect",
  "profanity.detect",
  "toxicity.detect",
  "harmful_instructions.detect",
];

const LAUNCH_POLICY_NAME = "Launch";
const LAUNCH_POLICY_VERSION = "v1";
const LAUNCH_POLICY_DESCRIPTION =
  "Kickstart your AI security with the Launch — a ready-to-deploy protection layer " +
  "that automatically blocks Jailbreak attempts, PII exposure, Profanity, Toxic " +
  "content, and requests for actionable harmful instructions. " +
  "Designed for instant activation, it ensures your AI applications stay " +
  "compliant, safe, and user-friendly from day one.";

export interface CreateDefaultLaunchPolicyArgs {
  /** Clerk org id — equals tenants.id and applications.tenant_id. */
  orgId: string;
  applicationId: string;
  userId: string;
  /** Server-minted Clerk JWT (from auth().getToken()). */
  token: string | null;
}

export interface CreateDefaultLaunchPolicyResult {
  created: boolean;
  reason?: string;
}

/**
 * Create the default Launch policy for an application. Idempotent and safe to call
 * after application creation. Throws only on an unexpected gateway error so the caller
 * can isolate it (a failure must never fail application creation).
 */
export async function createDefaultLaunchPolicy(
  args: CreateDefaultLaunchPolicyArgs
): Promise<CreateDefaultLaunchPolicyResult> {
  const { orgId, applicationId, userId, token } = args;

  // Idempotency: skip if this application already has a Launch policy.
  const existing = await db
    .select({ id: applicationPolicies.id })
    .from(applicationPolicies)
    .where(
      and(
        eq(applicationPolicies.applicationId, applicationId),
        eq(applicationPolicies.policyName, LAUNCH_POLICY_NAME)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    return { created: false, reason: "already_exists" };
  }

  // Resolve default guards by stable key. They exist as global rows (tenant_id NULL)
  // and may also have per-tenant copies; accept either, dedupe by key (prefer tenant-scoped).
  const rows = await db
    .select({
      id: guardrails.id,
      key: guardrails.key,
      tenantId: guardrails.tenantId,
    })
    .from(guardrails)
    .where(
      and(
        inArray(guardrails.key, DEFAULT_GUARD_KEYS),
        or(eq(guardrails.tenantId, orgId), isNull(guardrails.tenantId)),
        isNull(guardrails.deletedAt)
      )
    );

  const byKey = new Map<string, { id: string; tenantId: string | null }>();
  for (const r of rows) {
    const prev = byKey.get(r.key);
    // Prefer a tenant-scoped row over a global one when both exist.
    if (!prev || (prev.tenantId === null && r.tenantId !== null)) {
      byKey.set(r.key, { id: r.id, tenantId: r.tenantId });
    }
  }

  if (byKey.size === 0) {
    return { created: false, reason: "no_default_guards_found" };
  }

  // Stable order matching DEFAULT_GUARD_KEYS; all guards run in the input phase.
  const guardrailLinks = DEFAULT_GUARD_KEYS.map((key, index) => {
    const g = byKey.get(key);
    if (!g) return null;
    return {
      guardrail_id: g.id,
      phase: "input",
      order_index: index,
      params: {},
    };
  }).filter((link): link is NonNullable<typeof link> => link !== null);

  if (!token) {
    return { created: false, reason: "no_auth_token" };
  }

  const controlnetUrl =
    process.env.CONTROLNET_INTERNAL_URL || "http://controlnet:8000";

  const response = await fetch(`${controlnetUrl}/v1/policies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      // The gateway resolves tenant from the JWT org claim, falling back to this
      // header. Send the org id so tenant_id matches applications.tenant_id.
      "X-Tenant-ID": orgId,
      "X-User-ID": userId,
    },
    body: JSON.stringify({
      name: LAUNCH_POLICY_NAME,
      description: LAUNCH_POLICY_DESCRIPTION,
      version: LAUNCH_POLICY_VERSION,
      guardrails: guardrailLinks,
      composition: {
        input: "allOf",
        output: "allOf",
        tool_args: "allOf",
        tool_result: "allOf",
      },
      status: "active",
      is_active: true,
      application_id: applicationId,
    }),
  });

  // 409 = policy name already exists for this application → idempotent success.
  if (response.status === 409) {
    return { created: false, reason: "already_exists_409" };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `ControlNet /v1/policies failed (${response.status}): ${body}`
    );
  }

  return { created: true };
}
