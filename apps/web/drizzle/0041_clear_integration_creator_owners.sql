-- Agents used to get the NORIX user who connected the integration as their
-- owner when the provider exposed no Owner/Email/Team tag. Connecting an
-- account does not make someone the owner of its resources, so clear those
-- inferred owners; agents without real ownership evidence show as Unassigned.
UPDATE "agents"
SET "owner_user_id" = NULL,
    "owner_source" = NULL,
    "owner_confidence" = NULL,
    "updated_at" = now()
WHERE "owner_source" = 'integration_creator';
