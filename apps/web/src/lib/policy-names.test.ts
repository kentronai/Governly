/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";
import {
  EU_AI_ACT_POLICY_NAME,
  LEGACY_EU_AI_ACT_POLICY_NAME,
  isEuAiActPolicyName,
} from "./policy-names";

const DRIZZLE_DIR = path.resolve(__dirname, "../../drizzle");

describe("EU AI Act policy name", () => {
  it('is displayed as "EU AI Act"', () => {
    expect(EU_AI_ACT_POLICY_NAME).toBe("EU AI Act");
  });

  it.each([
    ["EU AI Act", true],
    ["EU AI Act (Regulation 2024/1689)", true],
    ["ISO/IEC 42001", false],
    ["EU AI Act draft", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isEuAiActPolicyName(%p) === %p", (name, expected) => {
    expect(isEuAiActPolicyName(name)).toBe(expected);
  });
});

describe("migration 0042_rename_eu_ai_act_policy", () => {
  const sql = fs.readFileSync(
    path.join(DRIZZLE_DIR, "0042_rename_eu_ai_act_policy.sql"),
    "utf8",
  );

  it("renames stored policies from the legacy name to the new name", () => {
    expect(sql).toMatch(/UPDATE\s+"policy_center"/);
    expect(sql).toContain(`SET "name" = '${EU_AI_ACT_POLICY_NAME}'`);
    expect(sql).toContain(`WHERE "name" = '${LEGACY_EU_AI_ACT_POLICY_NAME}'`);
  });

  it("is registered in the drizzle journal after 0041", () => {
    const journal = JSON.parse(
      fs.readFileSync(path.join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8"),
    );
    const entries: { idx: number; tag: string; when: number }[] =
      journal.entries;
    const entry = entries.find((e) => e.tag === "0042_rename_eu_ai_act_policy");
    const previous = entries.find(
      (e) => e.tag === "0041_clear_integration_creator_owners",
    );
    expect(entry).toBeDefined();
    expect(entry!.idx).toBe(42);
    expect(entry!.when).toBeGreaterThan(previous!.when);
  });
});

describe("no hard-coded legacy name outside policy-names.ts", () => {
  const SRC = path.resolve(__dirname, "..");
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });

  it("routes every EU AI Act name check through isEuAiActPolicyName", () => {
    const offenders = walk(SRC)
      .filter(
        (file) =>
          !file.endsWith("policy-names.ts") &&
          !file.endsWith("policy-names.test.ts"),
      )
      .filter((file) =>
        fs.readFileSync(file, "utf8").includes(LEGACY_EU_AI_ACT_POLICY_NAME),
      )
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
