"""
Audit System for CGA Core

Simple async audit logging - fire-and-forget, zero blocking.

Usage:
    from cga_core.audit import with_router_audit
    
    @with_router_audit
    async def my_handler():
        return router.route(prompt, families)
"""

from .decorators import (
    with_background_audit,
    fire_and_forget_audit,
)
from .router_audit import with_router_audit
from .onnx_audit import with_model_audit
from .compiler_audit import with_compilation_audit

__all__ = [
    "with_background_audit",
    "fire_and_forget_audit",
    "with_router_audit",
    "with_model_audit",
    "with_compilation_audit",
]
