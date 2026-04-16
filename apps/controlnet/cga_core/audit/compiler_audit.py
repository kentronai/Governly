"""
Compiler Audit - Simple async decorators
"""

import time
from functools import wraps
from .decorators import fire_and_forget_audit


def with_compilation_audit(func):
    """
    Simple compilation audit (fire-and-forget)
    
    Usage:
        @with_compilation_audit
        async def compile_handler(yaml_bytes, **audit_kwargs):
            return compile_policy(yaml_bytes)
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start = time.time()
        
        # Extract params
        audit_service = kwargs.pop('audit_service', None)
        db_session = kwargs.pop('db_session', None)
        tenant_id = kwargs.pop('tenant_id', 'unknown')
        actor_user_id = kwargs.pop('actor_user_id', 'system')
        policy_id = kwargs.get('policy_id', 'unknown')
        
        try:
            # Execute compilation (critical path)
            result = await func(*args, **kwargs)
            duration_ms = (time.time() - start) * 1000
            
            # Extract metadata
            compiled_guard, metadata = result
            
            # Fire-and-forget audit
            if audit_service and db_session:
                fire_and_forget_audit(
                    audit_service.log_audit_event(
                        db_session=db_session,
                        tenant_id=tenant_id,
                        actor_user_id=actor_user_id,
                        action="policy.compile.success",
                        target_type="policy",
                        target_id=policy_id,
                        metadata={
                            "duration_ms": duration_ms,
                            "policy_hash": metadata.get('hash'),
                            "guard_count": sum(
                                len(guards)
                                for guards in metadata.get('guards_by_tier', {}).values()
                            ),
                        }
                    )
                )
            
            return result
            
        except Exception as e:
            duration_ms = (time.time() - start) * 1000
            
            # Fire-and-forget error audit
            if audit_service and db_session:
                fire_and_forget_audit(
                    audit_service.log_audit_event(
                        db_session=db_session,
                        tenant_id=tenant_id,
                        actor_user_id=actor_user_id,
                        action="policy.compile.failed",
                        target_type="policy",
                        target_id=policy_id,
                        metadata={
                            "duration_ms": duration_ms,
                            "error": str(e),
                            "error_type": type(e).__name__,
                        }
                    )
                )
            
            raise
    
    return wrapper

