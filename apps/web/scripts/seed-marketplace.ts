/**
 * Seed Marketplace Guardrails
 * 
 * Seeds the database with global marketplace guardrails that match
 * the Python guard implementations in apps/controlnet/guard_packs/
 */

import { db, guardrails } from "../src/db"
import { and, eq, isNull, sql } from "drizzle-orm"

// Only include guards that exist in Python registry
const MARKETPLACE_GUARDRAILS = [
  // PII Guards
  {
    key: "pii.detect",
    name: "PII Detection",
    description: "Detects personally identifiable information (PII) such as emails, phone numbers, SSN, credit cards, and addresses",
    category: "privacy",
    tier: "T0",
    packName: "pii",
    functionName: "detect",
    performanceBudgetMs: "10",
    infrastructure: "rule",
    isGlobal: true,
    isCertified: true,
    requiresOnnx: false,
    defaultParams: {
      types: ["EMAIL", "PHONE"],
      threshold: 0,
      severity: "high"
    },
    avgLatencyMs: "5",
    accuracyScore: "0.95",
  },
  {
    key: "pii.redact",
    name: "PII Redaction",
    description: "Redacts or masks PII from content to protect privacy",
    category: "privacy",
    tier: "T0",
    packName: "pii",
    functionName: "redact",
    performanceBudgetMs: "10",
    infrastructure: "rule",
    isGlobal: true,
    isCertified: true,
    requiresOnnx: false,
    defaultParams: {
      types: ["SSN"],
      mode: "mask"
    },
    avgLatencyMs: "6",
    accuracyScore: "0.98",
  },
  
  // Toxicity Guards
  {
    key: "toxicity.detect",
    name: "Toxicity Detection",
    description: "Detects toxic, offensive, or harmful language",
    category: "safety",
    tier: "T1",
    packName: "toxicity",
    functionName: "detect",
    performanceBudgetMs: "50",
    infrastructure: "rule",
    isGlobal: true,
    isCertified: true,
    requiresOnnx: false,
    defaultParams: {
      severity: "high",
      threshold: 0.5
    },
    avgLatencyMs: "35",
    accuracyScore: "0.92",
  },
  
  // Business Guards
  {
    key: "business.competitor_protection",
    name: "Competitor Protection",
    description: "Prevents mentioning or promoting competitor brands",
    category: "business",
    tier: "T0",
    packName: "business",
    functionName: "competitor_protection",
    performanceBudgetMs: "10",
    infrastructure: "rule",
    isGlobal: true,
    isCertified: true,
    requiresOnnx: false,
    defaultParams: {
      competitors: ["OldCorp"],
      severity: "low"
    },
    avgLatencyMs: "4",
    accuracyScore: "0.99",
  },
  {
    key: "business.brand_tone",
    name: "Brand Tone Enforcement",
    description: "Ensures responses match your brand's tone and voice",
    category: "business",
    tier: "T0",
    packName: "business",
    functionName: "brand_tone",
    performanceBudgetMs: "10",
    infrastructure: "rule",
    isGlobal: true,
    isCertified: true,
    requiresOnnx: false,
    defaultParams: {
      severity: "low",
      unprofessional_patterns: [],
      required_tone: "professional"
    },
    avgLatencyMs: "5",
    accuracyScore: "0.90",
  },
  
  // Tool Guards
  {
    key: "tools.allowlist",
    name: "Tool Allowlist",
    description: "Only allows execution of specified tools",
    category: "tools",
    tier: "T0",
    packName: "tools",
    functionName: "allowlist",
    performanceBudgetMs: "5",
    infrastructure: "rule",
    isGlobal: true,
    isCertified: true,
    requiresOnnx: false,
    defaultParams: {
      allowed_tools: [],
      severity: "high"
    },
    avgLatencyMs: "2",
    accuracyScore: "1.0",
  },
  {
    key: "tools.denylist",
    name: "Tool Denylist",
    description: "Blocks execution of dangerous or restricted tools",
    category: "tools",
    tier: "T0",
    packName: "tools",
    functionName: "denylist",
    performanceBudgetMs: "5",
    infrastructure: "rule",
    isGlobal: true,
    isCertified: true,
    requiresOnnx: false,
    defaultParams: {
      denied_tools: [],
      severity: "critical"
    },
    avgLatencyMs: "2",
    accuracyScore: "1.0",
  },
]

async function seedMarketplace() {
  console.log("🌱 Seeding marketplace guardrails...")
  
  try {
    // NEVER delete the global catalog here.
    //
    // This script used to run `DELETE FROM guardrails WHERE is_global = true`
    // before inserting. That wiped every guardrail this script does not define —
    // including jailbreak.detect, profanity.detect and harmful_instructions.detect,
    // which the default Launch policy is built from. Production ran that way:
    // policies could only bind the surviving keys, so Launch policies came up
    // with 2 of their 5 guards. Migration 0037 repairs the catalog.
    //
    // Seeding is an additive update-or-insert, matched per key.
    //
    // It deliberately does NOT use `ON CONFLICT (tenant_id, key, version)`:
    // these rows are global, so tenant_id IS NULL, and Postgres treats NULLs as
    // distinct in a unique constraint. The conflict target therefore never
    // matches an existing global row and every run inserts a duplicate instead
    // of updating. Match explicitly with `IS NULL` instead.
    console.log(`📦 Upserting ${MARKETPLACE_GUARDRAILS.length} marketplace guardrails...`)

    const values = MARKETPLACE_GUARDRAILS.map(guard => ({
      key: guard.key,
      name: guard.name,
      description: guard.description,
      category: guard.category,
      tier: guard.tier as "T0" | "T1" | "T2",
      packName: guard.packName,
      functionName: guard.functionName,
      performanceBudgetMs: guard.performanceBudgetMs,
      infrastructure: guard.infrastructure as "ml" | "llm" | "rule" | "na",
      isGlobal: guard.isGlobal,
      isCertified: guard.isCertified,
      requiresOnnx: guard.requiresOnnx,
      defaultParams: guard.defaultParams,
      avgLatencyMs: guard.avgLatencyMs,
      accuracyScore: guard.accuracyScore,
      tenantId: null, // Global marketplace guardrails have no tenant
      version: "v1",
      isEnabled: true,
    }))
    
    let inserted = 0
    let updated = 0

    for (const value of values) {
      const existing = await db
        .select({ id: guardrails.id })
        .from(guardrails)
        .where(
          and(
            isNull(guardrails.tenantId),
            eq(guardrails.key, value.key),
            eq(guardrails.version, value.version),
          ),
        )
        .limit(1)

      if (existing.length > 0) {
        const { key, version, tenantId, ...mutable } = value
        await db
          .update(guardrails)
          .set({ ...mutable, deletedAt: null, updatedAt: sql`NOW()` })
          .where(eq(guardrails.id, existing[0].id))
        updated++
      } else {
        await db.insert(guardrails).values(value)
        inserted++
      }
    }

    console.log(`  ↻ ${updated} updated, + ${inserted} inserted`)

    console.log(`  ✅ Upserted all ${values.length} guardrails (existing catalog left intact)`)
    
    
    console.log("✨ Marketplace seeding complete!")
    console.log(`📊 Total guardrails: ${MARKETPLACE_GUARDRAILS.length}`)
    
  } catch (error) {
    console.error("❌ Error seeding marketplace:", error)
    throw error
  }
}

// Run the seed
seedMarketplace()
  .then(() => {
    console.log("👍 Done!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("💥 Fatal error:", error)
    process.exit(1)
  })
