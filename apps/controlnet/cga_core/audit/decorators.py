"""
Generic Audit Decorators

Simple async decorators that don't block the critical path.
All audit operations are fire-and-forget.
"""

import asyncio
import time
import logging
from functools import wraps
from typing import Callable, Any, Dict, Optional

logger = logging.getLogger(__name__)


def fire_and_forget_audit(coro):
    """
    Fire-and-forget: Run audit in background without blocking
    
    Usage:
        fire_and_forget_audit(
            audit_service.log_event(...)
        )
    """
    try:
        asyncio.create_task(coro)
    except Exception as e:
        # Silently ignore audit failures - never break the app
        logger.debug(f"Audit task creation failed: {e}")


def with_background_audit(
    action: str,
    target_type: str,
    extract_metadata: Callable[[Any, Any], Dict] = None
):
    """
    Decorator: Add async audit logging (fire-and-forget)
    
    Args:
        action: Action name (e.g., "router.selection")
        target_type: Target type (e.g., "router")
        extract_metadata: Optional function to extract metadata from result
    
    Usage:
        @with_background_audit("router.selection", "router")
        async def route_request(prompt, families, **audit_kwargs):
            return router.route(prompt, families)
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start = time.time()
            
            # Extract audit params (won't block if missing)
            audit_service = kwargs.pop('audit_service', None)
            db_session = kwargs.pop('db_session', None)
            tenant_id = kwargs.pop('tenant_id', 'unknown')
            actor_user_id = kwargs.pop('actor_user_id', 'system')
            
            try:
                # Execute original function (critical path)
                result = await func(*args, **kwargs)
                duration_ms = (time.time() - start) * 1000
                
                # Fire-and-forget audit logging (background)
                if audit_service and db_session:
                    metadata = {
                        "duration_ms": duration_ms,
                        "function": func.__name__,
                    }
                    
                    # Extract custom metadata if provided
                    if extract_metadata:
                        try:
                            custom_meta = extract_metadata(args, result)
                            metadata.update(custom_meta)
                        except Exception:
                            pass  # Ignore metadata extraction errors
                    
                    # Fire and forget - doesn't block
                    fire_and_forget_audit(
                        audit_service.log_audit_event(
                            db_session=db_session,
                            tenant_id=tenant_id,
                            actor_user_id=actor_user_id,
                            action=f"{action}.success",
                            target_type=target_type,
                            target_id=func.__name__,
                            metadata=metadata
                        )
                    )
                
                return result
                
            except Exception as e:
                duration_ms = (time.time() - start) * 1000
                
                # Fire-and-forget error logging
                if audit_service and db_session:
                    fire_and_forget_audit(
                        audit_service.log_audit_event(
                            db_session=db_session,
                            tenant_id=tenant_id,
                            actor_user_id=actor_user_id,
                            action=f"{action}.failed",
                            target_type=target_type,
                            target_id=func.__name__,
                            metadata={
                                "duration_ms": duration_ms,
                                "error": str(e),
                                "error_type": type(e).__name__,
                            }
                        )
                    )
                
                raise  # Re-raise original error
        
        return wrapper
    return decorator

