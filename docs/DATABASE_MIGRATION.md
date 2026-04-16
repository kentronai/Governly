# Database Migration

This guide explains how to make schema changes using **`Drizzle ORM`**.

## Existing issue and solution

- Previously, raw SQL was used to update the database, so Drizzle couldn’t track changes.

- The schema is now synced with the existing database — all future updates should be done through Drizzle migrations only.

## Steps to migrate

- **Open [`schema.ts`](../apps/web/drizzle/schema.ts) and add your new table or modify existing ones**

- **For Example**

```javascript
export const sampleTable = pgTable("sample_table", {
  id: uuid().defaultRandom().primaryKey().notNull(),
});
```

- **Generate a migration**

```bash
bun run db:generate
```

- **Apply the migration**

```bash
bun run db:migrate
```
