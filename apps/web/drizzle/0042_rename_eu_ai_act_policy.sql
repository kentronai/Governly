-- Shorten the EU AI Act compliance policy title shown in Admin Center →
-- Compliance Policies. Renames the global catalog row and every tenant's
-- activated copy (copies inherit the parent's name when a policy is activated).
-- Code matches either name via isEuAiActPolicyName, so the rename is safe in
-- either deploy order.
UPDATE "policy_center"
SET "name" = 'EU AI Act'
WHERE "name" = 'EU AI Act (Regulation 2024/1689)';
