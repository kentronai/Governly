import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { COMPLIANCE_CONTROL_CATALOG, getControlDefinition } from "@/lib/server/compliance/control-catalog";
import { calculateComplianceProgress } from "@/lib/server/compliance/scoring";

describe("governance engine foundations", () => {
  it("encrypts evidence bytes with authenticated encryption", () => {
    process.env.AWS_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
    const plaintext = Buffer.from("governance evidence").toString("base64");
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.split(".")).toHaveLength(3);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("provides actionable mapping metadata for every seeded control key", () => {
    const seededKeys = [
      "application_scope_documented", "bias_assessment", "data_governance", "human_oversight",
      "model_inventory", "policy_execution_verified", "record_keeping", "red_team_testing",
      "responsible_owner", "risk_register", "runtime_monitoring", "runtime_policy_configured",
      "transparency_notice", "use_case_documented",
    ];
    expect(Object.keys(COMPLIANCE_CONTROL_CATALOG).sort()).toEqual(seededKeys.sort());
    for (const key of seededKeys) {
      const definition = getControlDefinition(key);
      expect(definition.route).toBeTruthy();
      expect(definition.requiredEvidence.length).toBeGreaterThan(0);
      expect(definition.implementationGuidance.length).toBeGreaterThan(20);
    }
  });

  it("scores compliance deterministically and fails closed", () => {
    expect(calculateComplianceProgress([])).toMatchObject({ coverageScore: 0, complianceStatus: "non_compliant" });
    expect(calculateComplianceProgress([{ status: "verified" as const }, { status: "verified" as const }])).toMatchObject({ coverageScore: 100, complianceStatus: "compliant" });
    expect(calculateComplianceProgress([{ status: "verified" as const }, { status: "partial" as const }])).toMatchObject({ coverageScore: 75, complianceStatus: "partially_compliant" });
    expect(calculateComplianceProgress([{ status: "verified" as const }, { status: "missing" as const }])).toMatchObject({ coverageScore: 50, complianceStatus: "non_compliant" });
  });
});
