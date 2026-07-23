"""Regression tests for the fail-closed pre-provider enforcement boundary."""

import pytest

from cga_core import pipelines
from cga_core.types import Left_, Right_


@pytest.mark.asyncio
async def test_policy_violation_stops_before_provider_resolution(monkeypatch):
    execution_order = []

    def passing_step(name):
        async def run(ctx):
            execution_order.append(name)
            return Right_(ctx)

        return run

    async def blocked_guard(ctx):
        execution_order.append("guards")
        return Left_([{
            "rule_id": "pii.detect",
            "message": "PII detected",
            "severity": "high",
            "phase": "input",
        }])

    monkeypatch.setattr(pipelines, "extract_request_params", passing_step("request"))
    monkeypatch.setattr(pipelines, "resolve_policy", passing_step("policy"))
    monkeypatch.setattr(pipelines, "apply_prompt_routing", passing_step("routing"))
    monkeypatch.setattr(pipelines, "run_onnx_detection", passing_step("onnx"))
    monkeypatch.setattr(pipelines, "execute_input_guards_tiered", blocked_guard)
    monkeypatch.setattr(pipelines, "resolve_model_target", passing_step("provider"))

    result = await pipelines.chat_completions_pipeline()({"body": {}})

    assert result["_tag"] == "Left"
    assert execution_order == ["request", "policy", "routing", "onnx", "guards"]
    assert "provider" not in execution_order
