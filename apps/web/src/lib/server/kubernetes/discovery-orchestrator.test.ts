import type { RawDiscoveredResource } from "@/lib/server/aws/discovery/types";
import { correlateKubernetesResources } from "./discovery-orchestrator";

jest.mock("drizzle-orm", () => ({
  and: jest.fn((...conditions) => ({ and: conditions })),
  eq: jest.fn((left, right) => ({ left, right })),
  notInArray: jest.fn((left, right) => ({ left, right })),
}));

jest.mock("@db", () => ({
  agents: {
    id: "agents.id",
    integrationId: "agents.integration_id",
    externalAgentId: "agents.external_agent_id",
  },
  agentRecommendations: {
    agentId: "agent_recommendations.agent_id",
    status: "agent_recommendations.status",
  },
  agentResources: { agentId: "agent_resources.agent_id" },
  discoveryScans: { id: "discovery_scans.id" },
  integrations: { id: "integrations.id" },
  db: {},
}));

jest.mock("@/lib/server/crypto", () => ({
  decryptSecret: jest.fn(),
}));

jest.mock("@/lib/server/agents/capability-engine", () => ({
  buildCapabilityFacts: jest.fn(),
}));

jest.mock("@/lib/server/agents/autonomy-engine", () => ({
  classifyAutonomy: jest.fn(),
}));

jest.mock("@/lib/server/agents/risk-engine", () => ({
  assessRisk: jest.fn(),
}));

jest.mock("@/lib/server/agents/ownership-engine", () => ({
  detectOwnership: jest.fn(),
}));

jest.mock("@/lib/server/agents/recommendations-engine", () => ({
  generateRecommendations: jest.fn(),
}));

jest.mock("@/lib/server/policy-enforcement/agent-policy-sync", () => ({
  syncAgentPolicyEvaluations: jest.fn(),
}));

const resource = (
  kind: "Deployment" | "Pod" | "Service",
  name: string,
  metadata: Record<string, unknown> = {},
): RawDiscoveredResource => ({
  resourceType: "kubernetes_workload",
  resourceId: `eks-prod/norix-agents-prod/${kind}/${name}`,
  resourceArn: `eks-prod/norix-agents-prod/${kind}/${name}`,
  resourceName: name,
  region: "norix-agents-prod",
  tags: { app: "chatbot-agent" },
  createdAt: null,
  lastUpdatedAt: null,
  metadata: {
    evidenceSource: "kubernetes_api",
    clusterName: "eks-prod",
    namespace: "norix-agents-prod",
    kind,
    ...metadata,
  },
});

describe("correlateKubernetesResources", () => {
  it("groups a deployment, its pod, and its service into one logical agent", () => {
    const agents = correlateKubernetesResources(
      [
        resource("Deployment", "chatbot-agent", {
          selector: { app: "chatbot-agent" },
        }),
        resource("Pod", "chatbot-agent-6dc6cccfbd-pl82v", {
          ownerReferences: [
            {
              kind: "ReplicaSet",
              name: "chatbot-agent-6dc6cccfbd",
              controller: true,
            },
          ],
        }),
        resource("Service", "chatbot-agent", {
          selector: { app: "chatbot-agent" },
        }),
      ],
      "aws_eks",
    );

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      externalAgentId: "eks-prod/norix-agents-prod/Deployment/chatbot-agent",
      name: "chatbot-agent",
      platform: "aws_eks",
      region: "norix-agents-prod",
      discoverySource: "kubernetes_workload",
    });
    expect(agents[0].resources.map((item) => item.metadata.kind)).toEqual([
      "Deployment",
      "Pod",
      "Service",
    ]);
  });
});
