"""
Simple policy category extraction from database

This module extracts risk categories from policy guardrails by:
- Extracting from guardrail key pattern: "category.action" → "category"
  * "pii.detect" → "pii"
  * "toxicity.block" → "toxicity"
  * "jailbreak.detect" → "jailbreak"
- Verifying against risk_categories table
- Always fresh from database (never cached)
"""

from typing import List
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


async def get_policy_categories_from_db(
    session: AsyncSession,
    policy_id: str,
    tenant_id: str
) -> List[str]:
    """
    Get risk categories for a policy from database
    
    SIMPLE & GUARANTEED APPROACH:
    - Query policy_guardrails → guardrails JOIN
    - Extract category from guardrail key using GUARANTEED pattern:
      * "pii.detect" → "pii"
      * "toxicity.block" → "toxicity"
      * "jailbreak.detect" → "jailbreak"
    - Fallback to category/family fields if present
    - Only returns categories that exist in risk_categories table
    
    Args:
        session: Database session
        policy_id: Policy UUID or slug
        tenant_id: Tenant identifier
        
    Returns:
        List of risk category slugs (e.g., ["pii", "toxicity"])
        
    Example:
        >>> categories = await get_policy_categories_from_db(session, "policy-123", "tenant-1")
        >>> print(categories)
        ['pii', 'toxicity', 'jailbreak']
    """
    query = text("""
        SELECT DISTINCT
            g.key,
            g.category,
            g.family,
            CASE 
                WHEN g.key LIKE '%.%' THEN SPLIT_PART(g.key, '.', 1)
                ELSE g.category
            END as extracted_category
        FROM policy_guardrails pg
        INNER JOIN guardrails g ON g.id = pg.guardrail_id
        INNER JOIN policies p ON p.id = pg.policy_id
        WHERE (p.id::text = :policy_id OR p.slug = :policy_id)
          AND p.tenant_id = :tenant_id
          AND pg.enabled = true
          AND g.is_enabled = true
    """)
    
    try:
        result = await session.execute(
            query,
            {
                "policy_id": policy_id,
                "tenant_id": tenant_id
            }
        )
        
        rows = result.fetchall()
        
        # Collect unique categories
        categories = set()
        for row in rows:
            # Priority 1: Extracted from key pattern (GUARANTEED)
            if row.extracted_category and row.extracted_category.strip():
                categories.add(row.extracted_category.lower().strip())
            
            # Priority 2: Category field (if populated)
            elif row.category and row.category.strip():
                categories.add(row.category.lower().strip())
            
            # Priority 3: Family field (legacy, array type)
            elif row.family:
                if isinstance(row.family, list):
                    categories.update(f.lower().strip() for f in row.family if f)
                elif isinstance(row.family, str) and row.family.strip():
                    categories.add(row.family.lower().strip())
        
        # Filter to only include categories that exist in risk_categories table
        # This ensures we don't return invalid categories like "business", "tools", etc.
        if categories:
            verify_query = text("""
                SELECT DISTINCT slug
                FROM risk_categories
                WHERE slug = ANY(:slugs)
            """)
            verify_result = await session.execute(
                verify_query,
                {"slugs": list(categories)}
            )
            verified_categories = sorted([row.slug for row in verify_result.fetchall()])
            
            logger.info(
                "policy_categories_extracted",
                policy_id=policy_id,
                tenant_id=tenant_id,
                categories=verified_categories,
                count=len(verified_categories),
                method="key_pattern_extraction"
            )
            
            return verified_categories
        
        # No categories found
        logger.info(
            "policy_categories_empty",
            policy_id=policy_id,
            tenant_id=tenant_id
        )
        return []
        
    except Exception as e:
        logger.error(
            "policy_categories_extraction_failed",
            policy_id=policy_id,
            tenant_id=tenant_id,
            error=str(e),
            exc_info=True
        )
        # Fail-fast: If we can't query categories, something is wrong
        raise ValueError(f"Failed to extract policy categories from database: {e}") from e
