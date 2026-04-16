"""
Router Audit - Simple async decorators
"""

import time
from functools import wraps
from .decorators import fire_and_forget_audit


def with_router_audit(func):
    """
    Simple router audit decorator (fire-and-forget)
    
    Usage:
        @with_router_audit
        async def route_handler(router, prompt, families, **audit_kwargs):
            return router.route(prompt, families)
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start = time.time()
        
        # Extract audit params (optional)
        audit_service = kwargs.pop('audit_service', None)
        db_session = kwargs.pop('db_session', None)
        tenant_id = kwargs.pop('tenant_id', 'unknown')
        actor_user_id = kwargs.pop('actor_user_id', 'system')
        prompt = kwargs.get('prompt', '')
        
        # Execute routing (critical path)
        result = await func(*args, **kwargs)
        duration_ms = (time.time() - start) * 1000
        
        # Fire-and-forget audit (background)
        if audit_service and db_session:
            fire_and_forget_audit(
                audit_service.log_router_operation(
                    db_session=db_session,
                    tenant_id=tenant_id,
                    actor_user_id=actor_user_id,
                    prompt=prompt,
                    selected_families=list(result) if isinstance(result, set) else [],
                    similarity_scores=kwargs.get('similarity_scores', {}),
                    metadata={
                        "duration_ms": duration_ms,
                        "prompt_length": len(prompt),
                        "families_count": len(result) if isinstance(result, set) else 0,
                    }
                )
            )
        
        return result
    
    return wrapper

