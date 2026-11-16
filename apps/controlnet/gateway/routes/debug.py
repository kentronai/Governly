"""
Debug endpoints for testing guard execution
"""

import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from cga_core import is_left, get_violations
from ..guards import run_input_guards
from ..auth import require_tenant_auth, TenantContext

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/test-input-guards")
async def test_input_guards(
    request: Request,
    context: TenantContext = Depends(require_tenant_auth)
):
    """Debug endpoint to test input guard execution"""
    try:
        # Parse request body
        body = await request.json()
        
        # Get policy ID from headers
        policy_id = request.headers.get("x-policy-id", "enterprise_default_v1")
        
        logger.info(f"🔍 Debug: Testing input guards for policy {policy_id}")
        logger.info(f"🔍 Debug: Request body: {body}")
        
        # Get policy
        policy_cache = request.app.state.policy_cache
        compiled_guards, policy_metadata = await policy_cache.get_policy(
            tenant_id=context.tenant_id,
            policy_id=policy_id
        )
        
        logger.info(f"🔍 Debug: Policy loaded: {policy_metadata.get('policy', 'unknown')}")
        logger.info(f"🔍 Debug: Available phases: {list(compiled_guards.keys())}")
        
        # Test input guards
        input_result = await run_input_guards(compiled_guards, body)
        
        logger.info(f"🔍 Debug: Input guard result: {input_result['_tag']}")
        
        if is_left(input_result):
            violations = get_violations(input_result)
            logger.info(f"🔍 Debug: Found {len(violations)} violations")
            
            return JSONResponse(
                status_code=200,
                content={
                    "status": "blocked",
                    "violations": [
                        {
                            "rule_id": v.get("rule_id", "unknown"),
                            "message": v.get("message", "unknown"),
                            "score": v.get("score")
                        }
                        for v in violations
                    ]
                }
            )
        else:
            logger.info("🔍 Debug: No violations found")
            return JSONResponse(
                status_code=200,
                content={
                    "status": "allowed",
                    "updated_context": input_result["right"]
                }
            )
            
    except Exception as e:
        logger.error(f"🔍 Debug: Error testing input guards: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "traceback": traceback.format_exc()
            }
        )
