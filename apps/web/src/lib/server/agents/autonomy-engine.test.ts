import { classifyAutonomy } from "./autonomy-engine";
import { evaluateRules } from "./rule-engine";
import type { CapabilityFacts } from "./capability-engine";

jest.mock("./rule-engine", () => ({
  evaluateRules: jest.fn(),
}));

const mockedEvaluateRules = evaluateRules as jest.MockedFunction<
  typeof evaluateRules
>;

describe("autonomy engine evidence caps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not classify a simple conversational endpoint as L4", async () => {
    mockedEvaluateRules.mockResolvedValueOnce([
      {
        ruleKey: "broad-execute-rule",
        description: "Execute-capable resource detected",
        weight: 100,
        resultValue: "L4",
        severity: "critical",
      },
    ]);

    await expect(
      classifyAutonomy("tenant-1", facts({ isConversationalAgent: true })),
    ).resolves.toEqual(
      expect.objectContaining({
        level: "L1",
        evidence: expect.arrayContaining([
          "Autonomy capped at L1: no discovered provider evidence supports L4.",
        ]),
      }),
    );
  });

  it("requires privileged control evidence for L4", async () => {
    mockedEvaluateRules.mockResolvedValueOnce([
      {
        ruleKey: "privileged-autonomy",
        description: "Privileged autonomous control detected",
        weight: 100,
        resultValue: "L4",
        severity: "critical",
      },
    ]);

    await expect(
      classifyAutonomy("tenant-1", facts({ hasAdminRole: true })),
    ).resolves.toEqual(expect.objectContaining({ level: "L4" }));
  });
});

function facts(overrides: Partial<CapabilityFacts> = {}): CapabilityFacts {
  return {
    hasOwner: false,
    hasAdminRole: false,
    hasWritePermissions: false,
    hasDeletePermissions: false,
    hasInvokePermissions: true,
    hasCrossAccountPermissions: false,
    hasGuardrails: false,
    hasApprovalWorkflow: false,
    isDormant: false,
    hasPublicEndpoint: true,
    hasSensitiveDataAccess: false,
    credentialAgeDays: null,
    hasUnusedPermissions: false,
    hasExternalApiAccess: false,
    hasExecuteCapableResource: true,
    isConversationalAgent: false,
    resourceCount: 1,
    ...overrides,
  };
}
