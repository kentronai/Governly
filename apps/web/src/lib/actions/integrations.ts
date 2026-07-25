/**
 * Server actions for Integrations
 */

"use server";

import { db, integrations, tenants } from "@db";
import { eq, and } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";

export interface CreateIntegrationInput {
  tenantSlug: string;
  name: string;
  category: string;
  description?: string;
  logoUrl?: string;
  configuration?: Record<string, unknown>;
}

export interface UpdateIntegrationInput {
  tenantSlug: string;
  id: string;
  isEnabled?: boolean;
  isCredentialsAdded?: boolean;
  configuration?: Record<string, unknown>;
  apiKey?: string;
  name?: string;
  description?: string;
  logoUrl?: string;
}

type CatalogEntryDefinition = {
  name: string;
  category: string;
  description: string;
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  isEnabled?: boolean;
  isCredentialsAdded?: boolean;
  legacyNames?: string[];
};

const DEFAULT_CATALOG_ENTRIES: CatalogEntryDefinition[] = [
  {
    name: "AWS",
    category: "cloud_providers",
    description:
      "Discovers Bedrock, AgentCore, Lambda, and explicitly identified EC2 agent workloads across enabled AWS regions.",
    metadata: { logoUrl: "/logos/AWS.svg" },
  },
  {
    name: "Azure",
    category: "cloud_providers",
    description:
      "Discovers Azure OpenAI, AI Foundry, and identified agent workloads on Functions, Logic Apps, VMs, Container Apps, and AKS.",
  },
  {
    name: "Google Cloud",
    category: "cloud_providers",
    description:
      "Discovers Vertex AI Agent Engine and explicitly identified agent workloads on Cloud Run, Compute Engine, GKE, and Cloud Functions.",
  },
  {
    name: "Databricks Unity Catalog",
    category: "data_platforms",
    description:
      "Discovers deployed agents across Databricks Apps, Model Serving, Genie, Jobs, and workspace notebooks, with Unity Catalog governance evidence.",
    legacyNames: ["Databricks"],
  },
  {
    name: "Kubernetes Cluster",
    category: "runtime_platforms",
    description:
      "Registers deployed agent workloads from Kubernetes clusters through NORIX's authenticated cluster ingestion endpoint.",
    configuration: {
      endpoint: "/api/agent-discovery/ingest",
      authentication: "x-api-key",
      provider: "kubernetes",
    },
    legacyNames: ["Universal Agent Collector"],
  },
];

async function resolveTenant(tenantSlugOrId: string) {
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  return tenantRow[0];
}

async function ensureDefaultCatalogEntries(tenantId: string, userId: string) {
  for (const entry of DEFAULT_CATALOG_ENTRIES) {
    try {
      let existing = await db.query.integrations.findFirst({
        where: and(
          eq(integrations.tenantId, tenantId),
          eq(integrations.name, entry.name),
        ),
      });

      for (const legacyName of entry.legacyNames ?? []) {
        if (existing) break;
        existing = await db.query.integrations.findFirst({
          where: and(
            eq(integrations.tenantId, tenantId),
            eq(integrations.name, legacyName),
          ),
        });
      }

      if (existing) {
        await db
          .update(integrations)
          .set({
            name: entry.name,
            category: entry.category,
            description: entry.description,
            isEnabled:
              entry.isEnabled ??
              (existing.isCredentialsAdded || existing.isEnabled),
            isCredentialsAdded:
              entry.isCredentialsAdded ?? existing.isCredentialsAdded,
            configuration:
              Object.keys(entry.configuration ?? {}).length > 0
                ? {
                    ...((existing.configuration as Record<string, unknown>) ??
                      {}),
                    ...entry.configuration,
                  }
                : existing.configuration,
            metadata: {
              ...((existing.metadata as Record<string, unknown>) ?? {}),
              ...(entry.metadata ?? {}),
            },
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(integrations.id, existing.id));
        continue;
      }

      await db.insert(integrations).values({
        tenantId,
        name: entry.name,
        category: entry.category,
        description: entry.description,
        configuration: entry.configuration ?? {},
        metadata: entry.metadata ?? {},
        isEnabled: entry.isEnabled ?? false,
        isCredentialsAdded: entry.isCredentialsAdded ?? false,
        createdBy: userId,
        updatedBy: userId,
      });
    } catch (error) {
      console.error(
        `Failed to ensure ${entry.name} integration catalog entry:`,
        error,
      );
    }
  }
}

export const getIntegrations = async (tenantSlugOrId: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenant = await resolveTenant(tenantSlugOrId);
  const tenantId = tenant.id;

  const integrationsList = await db
    .select()
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId))
    .orderBy(integrations.name);

  return { integrations: integrationsList };
};

export const getIntegrationsWithCatalog = async (tenantSlugOrId: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenant = await resolveTenant(tenantSlugOrId);
  await ensureDefaultCatalogEntries(tenant.id, userId);

  const integrationsList = await db
    .select()
    .from(integrations)
    .where(eq(integrations.tenantId, tenant.id))
    .orderBy(integrations.name);

  return { integrations: integrationsList };
};

export const createIntegration = async (input: CreateIntegrationInput) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  // Try to find by ID first, then by slug
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, input.tenantSlug))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, input.tenantSlug))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const tenantId = tenantRow[0].id;

  if (!input.name || !input.category) {
    throw new Error("Name and category are required");
  }

  const newIntegration = await db
    .insert(integrations)
    .values({
      tenantId,
      name: input.name,
      category: input.category,
      description: input.description,
      configuration: input.configuration || {},
      metadata: input.logoUrl ? { logoUrl: input.logoUrl } : {},
      isEnabled: false,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "integration.created",
      targetType: "integration",
      targetId: newIntegration[0].id,
      metadata: { name: input.name, category: input.category },
    });
  } catch (e) {
    console.error("Failed to write audit event (integration.created):", e);
  }

  return { integration: newIntegration[0] };
};

export const updateIntegration = async (input: UpdateIntegrationInput) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  // Try to find by ID first, then by slug
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, input.tenantSlug))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, input.tenantSlug))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const tenantId = tenantRow[0].id;

  const updateData: any = {
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  };

  if (input.isEnabled !== undefined) updateData.isEnabled = input.isEnabled;
  if (input.isCredentialsAdded !== undefined)
    updateData.isCredentialsAdded = input.isCredentialsAdded;
  if (input.configuration !== undefined)
    updateData.configuration = input.configuration;
  if (input.apiKey !== undefined)
    updateData.credentialsEncrypted = input.apiKey;
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined)
    updateData.description = input.description;
  if (input.logoUrl !== undefined)
    updateData.metadata = { logoUrl: input.logoUrl };

  const updatedIntegration = await db
    .update(integrations)
    .set(updateData)
    .where(
      and(eq(integrations.id, input.id), eq(integrations.tenantId, tenantId)),
    )
    .returning();

  if (updatedIntegration.length === 0) {
    throw new Error("Integration not found");
  }

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "integration.updated",
      targetType: "integration",
      targetId: input.id,
      metadata: { update: input },
    });
  } catch (e) {
    console.error("Failed to write audit event (integration.updated):", e);
  }

  return { integration: updatedIntegration[0] };
};

export const saveEncryptedIntegrationCredentials = async (input: {
  tenantSlug: string;
  id: string;
  credentials: Record<string, unknown>;
}) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, input.tenantSlug))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, input.tenantSlug))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.id, input.id),
      eq(integrations.tenantId, tenantRow[0].id),
    ),
  });
  if (!existing) throw new Error("Integration not found");
  const [integration] = await db
    .update(integrations)
    .set({
      credentialsEncrypted: encryptSecret(JSON.stringify(input.credentials)),
      configuration: {
        ...((existing.configuration as Record<string, unknown>) ?? {}),
        credentialFields: Object.keys(input.credentials),
      },
      isCredentialsAdded: true,
      isEnabled: true,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(integrations.id, input.id),
        eq(integrations.tenantId, tenantRow[0].id),
      ),
    )
    .returning();
  if (!integration) throw new Error("Integration not found");
  await createAuditEvent({
    tenantId: tenantRow[0].id,
    actorUserId: userId,
    action: "integration.credentials_saved",
    targetType: "integration",
    targetId: input.id,
    metadata: { credentialFields: Object.keys(input.credentials) },
  });
  return { integration };
};

export const clearIntegrationCredentials = async (
  tenantSlugOrId: string,
  id: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const [integration] = await db
    .update(integrations)
    .set({
      credentialsEncrypted: null,
      configuration: {},
      isCredentialsAdded: false,
      isEnabled: false,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(eq(integrations.id, id), eq(integrations.tenantId, tenantRow[0].id)),
    )
    .returning();
  if (!integration) throw new Error("Integration not found");
  return { integration };
};

export const deleteIntegration = async (tenantSlugOrId: string, id: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  // Try to find by ID first, then by slug
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const tenantId = tenantRow[0].id;

  const deletedIntegration = await db
    .delete(integrations)
    .where(and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)))
    .returning();

  if (deletedIntegration.length === 0) {
    throw new Error("Integration not found");
  }

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "integration.deleted",
      targetType: "integration",
      targetId: id,
    });
  } catch (e) {
    console.error("Failed to write audit event (integration.deleted):", e);
  }

  return { message: "Integration deleted successfully" };
};
