/**
 * Integrations API integration
 *
 * Provides functions to interact with the integrations API for managing third-party integrations
 */

import * as integrationActions from "@/lib/actions/integrations";

const INTEGRATION_CATEGORIES = [
  "data_platforms",
  "ml_platforms",
  "llm_providers",
  "ai_security",
  "vector_databases",
  "cloud_providers",
  "runtime_platforms",
  "agent_frameworks",
  "observability",
  "developer_tools",
  "identity_security",
  "communication",
  "productivity",
  "crm_sales",
  "marketing_analytics",
  "customer_support",
  "finance",
  "hr_recruiting",
  "ecommerce",
  "legal",
  "other",
] as const;

type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export interface Integration {
  id: string;
  tenantId: string;
  name: string;
  category: IntegrationCategory;
  description?: string;
  isEnabled: boolean;
  isCredentialsAdded: boolean;
  nangoConnectionId?: string;
  nangoProviderConfigKey?: string;
  configuration: Record<string, any>;
  apiKey?: string;
  logoUrl?: string;
  webhookUrl?: string;
  lastSyncAt?: string;
  syncStatus?: "success" | "failed" | "pending";
  errorMessage?: string;
  metadata?: any;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrationRequest {
  name: string;
  category: IntegrationCategory;
  description?: string;
  logoUrl?: string;
  configuration?: Record<string, any>;
}

export interface UpdateIntegrationRequest {
  isEnabled?: boolean;
  isCredentialsAdded?: boolean;
  configuration?: Record<string, any>;
  apiKey?: string;
  name?: string;
  description?: string;
  logoUrl?: string;
}

// Fetch integrations for a tenant
export async function fetchIntegrations(
  tenantSlugOrId: string,
): Promise<Integration[]> {
  try {
    const result =
      await integrationActions.getIntegrationsWithCatalog(tenantSlugOrId);
    return (result.integrations || []).map(toIntegration);
  } catch (error) {
    console.error("Error fetching integrations:", error);
    throw error;
  }
}

function toIntegration(integration: any): Integration {
  const category = INTEGRATION_CATEGORIES.includes(integration.category)
    ? integration.category
    : "data_platforms";

  return {
    id: integration.id,
    tenantId: integration.tenantId,
    name: integration.name,
    category,
    description: integration.description || undefined,
    isEnabled: integration.isEnabled,
    isCredentialsAdded: integration.isCredentialsAdded,
    nangoConnectionId: integration.nangoConnectionId || undefined,
    nangoProviderConfigKey: integration.nangoProviderConfigKey || undefined,
    configuration: (integration.configuration as Record<string, any>) || {},
    // Secrets never reach the browser; only whether one is stored.
    apiKey: integration.hasCredentials ? "stored" : undefined,
    logoUrl: integration.logoUrl || integration.metadata?.logoUrl || undefined,
    webhookUrl: integration.webhookUrl || undefined,
    lastSyncAt: integration.lastSyncAt || undefined,
    syncStatus: integration.syncStatus || undefined,
    errorMessage: integration.errorMessage || undefined,
    metadata: integration.metadata,
    createdBy: integration.createdBy,
    updatedBy: integration.updatedBy || undefined,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

// Create a new integration
export async function createIntegration(
  tenantSlugOrId: string,
  data: CreateIntegrationRequest,
): Promise<Integration> {
  try {
    const result = await integrationActions.createIntegration({
      tenantSlug: tenantSlugOrId,
      ...data,
    });
    const integration = result.integration;
    return toIntegration(integration);
  } catch (error) {
    console.error("Error creating integration:", error);
    throw error;
  }
}

// Update an integration
export async function updateIntegration(
  tenantSlugOrId: string,
  id: string,
  data: UpdateIntegrationRequest,
): Promise<Integration> {
  try {
    const result = await integrationActions.updateIntegration({
      tenantSlug: tenantSlugOrId,
      id,
      ...data,
    });
    const integration = result.integration;
    return toIntegration(integration);
  } catch (error) {
    console.error("Error updating integration:", error);
    throw error;
  }
}

// Delete an integration
export async function deleteIntegration(
  tenantSlugOrId: string,
  id: string,
): Promise<void> {
  try {
    await integrationActions.deleteIntegration(tenantSlugOrId, id);
  } catch (error) {
    console.error("Error deleting integration:", error);
    throw error;
  }
}

// Toggle integration enabled status
export async function toggleIntegrationStatus(
  tenantId: string,
  id: string,
  isEnabled: boolean,
): Promise<Integration> {
  return updateIntegration(tenantId, id, { isEnabled });
}

// Add credentials to an integration
export async function addIntegrationCredentials(
  tenantId: string,
  id: string,
  credentials: Record<string, any>,
): Promise<Integration> {
  return updateIntegration(tenantId, id, {
    configuration: credentials,
    isCredentialsAdded: true,
    isEnabled: true,
  });
}

export async function addEncryptedIntegrationCredentials(
  tenantId: string,
  id: string,
  credentials: Record<string, unknown>,
): Promise<Integration> {
  const result = await integrationActions.saveEncryptedIntegrationCredentials({
    tenantSlug: tenantId,
    id,
    credentials,
  });
  return toIntegration(result.integration);
}

// Remove credentials from an integration
export async function removeIntegrationCredentials(
  tenantId: string,
  id: string,
): Promise<Integration> {
  const result = await integrationActions.clearIntegrationCredentials(
    tenantId,
    id,
  );
  return toIntegration(result.integration);
}
