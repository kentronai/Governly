"""
Tools Guardrails Implementation

Gate which tool/function calls a model's response is allowed to make.
Both guards run in the "tool_args" phase, where the context shape is
{"phase": "tool_args", "tool_args": {"function_name": str, "arguments": dict}}
(see gateway/guards.py:run_tool_args_guards and
gateway/routes/chat.py:_enforce_tool_args).

Guards:
1. allowlist: T0 - only named tools may run
2. denylist: T0 - named tools may never run
"""

from typing import List, Literal

from cga_core import guard, Violation, Ctx, Either, Right_, Left_, Guard


def _tool_name(ctx: Ctx) -> str:
    tool_args = ctx.get("tool_args", {})
    if isinstance(tool_args, dict):
        return tool_args.get("function_name") or ""
    return ""


# ============================================================================
# TOOL ALLOWLIST (T0)
# ============================================================================


@guard("tools.allowlist", tier="T0", description="Only allows execution of specified tools", performance_budget_ms=2.0)
def allowlist(
    allowed_tools: List[str],
    severity: Literal["low", "med", "high", "critical"] = "high"
) -> Guard:
    """
    Blocks any tool call whose name is not in allowed_tools.

    An empty allowed_tools list is treated as "no tools permitted" (the
    restrictive default for an allowlist), matching the marketplace
    catalog's seeded default of [] + severity "high".

    Args:
        allowed_tools: Tool names permitted to run.
        severity: Severity level for violations.

    Returns:
        Guard that blocks tool calls not on the allowlist.
    """
    allowed = set(allowed_tools)

    async def run(ctx: Ctx) -> Either:
        tool_name = _tool_name(ctx)
        if not tool_name:
            return Right_(ctx)

        if tool_name in allowed:
            return Right_(ctx)

        return Left_([Violation(
            rule_id="tools.allowlist",
            severity=severity,
            message=f"Tool '{tool_name}' is not on the allowlist",
            score=1.0,
            evidence={"tool_name": tool_name, "allowed_tools": sorted(allowed)}
        )])

    return run


# ============================================================================
# TOOL DENYLIST (T0)
# ============================================================================


@guard("tools.denylist", tier="T0", description="Blocks execution of dangerous or restricted tools", performance_budget_ms=2.0)
def denylist(
    denied_tools: List[str],
    severity: Literal["low", "med", "high", "critical"] = "critical"
) -> Guard:
    """
    Blocks any tool call whose name is in denied_tools.

    An empty denied_tools list never blocks anything, matching the
    marketplace catalog's seeded default of [].

    Args:
        denied_tools: Tool names that must never run.
        severity: Severity level for violations.

    Returns:
        Guard that blocks tool calls on the denylist.
    """
    denied = set(denied_tools)

    async def run(ctx: Ctx) -> Either:
        tool_name = _tool_name(ctx)
        if not tool_name or tool_name not in denied:
            return Right_(ctx)

        return Left_([Violation(
            rule_id="tools.denylist",
            severity=severity,
            message=f"Tool '{tool_name}' is on the denylist",
            score=1.0,
            evidence={"tool_name": tool_name, "denied_tools": sorted(denied)}
        )])

    return run
