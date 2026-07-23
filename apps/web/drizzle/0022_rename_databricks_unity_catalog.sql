UPDATE "integrations"
SET
  "name" = 'Databricks Unity Catalog',
  "description" = 'Discovers Unity Catalog catalogs, schemas, tables, registered models, and Model Serving endpoints with real governance evidence.',
  "updated_at" = now()
WHERE "name" = 'Databricks';
