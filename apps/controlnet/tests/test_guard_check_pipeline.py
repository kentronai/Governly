"""Tests for the policy-check flow: NORIX rules on a message, never calls a model.

This is the integration NORIX hands to customers who run their own LLM. The
guarantees under test are the ones that make it safe to hand out:

1. It runs the *same* guards as the proxying pipeline, so the two can never
   disagree about the same message.
2. It never touches provider resolution, so a broken model registry entry, an
   expired provider key or a provider outage cannot affect it.
3. It does not require a model id or an Authorization header — the customer's
   credentials stay with the customer.
"""

import sys
import types

import pytest

from cga_core import pipelines
from cga_core.pipeline_fns import extract_request_params
from cga_core.types import Left_, Right_
from gateway.routes.guard import _extract_text, _normalise_body


@pytest.mark.asyncio
async def test_guard_check_never_resolves_a_provider(monkeypatch):
    """The whole point: no provider is involved, even on a clean allow."""
    execution_order = []

    def passing_step(name):
        async def run(ctx):
            execution_order.append(name)
            return Right_(ctx)

        return run

    monkeypatch.setattr(pipelines, "extract_request_params", passing_step("request"))
    monkeypatch.setattr(pipelines, "resolve_policy", passing_step("policy"))
    monkeypatch.setattr(pipelines, "apply_prompt_routing", passing_step("routing"))
    monkeypatch.setattr(pipelines, "run_onnx_detection", passing_step("onnx"))
    monkeypatch.setattr(pipelines, "execute_input_guards_tiered", passing_step("guards"))
    monkeypatch.setattr(pipelines, "resolve_model_target", passing_step("provider"))

    result = await pipelines.guard_check_pipeline()({"body": {}})

    assert result["_tag"] == "Right"
    assert execution_order == ["request", "policy", "routing", "onnx", "guards"]
    # A production incident had every allowed message failing at the provider.
    # Guard-check callers must be structurally immune to that.
    assert "provider" not in execution_order


@pytest.mark.asyncio
async def test_guard_check_runs_the_same_guards_as_the_proxy(monkeypatch):
    """A message allowed here must be allowed by the proxy, and vice versa."""
    seen = []

    def passing_step(name):
        async def run(ctx):
            seen.append(name)
            return Right_(ctx)

        return run

    async def blocking_guards(ctx):
        seen.append("guards")
        return Left_([{
            "rule_id": "toxicity.detect",
            "message": "Toxic content detected",
            "severity": "high",
            "phase": "input",
        }])

    for name in ("extract_request_params", "resolve_policy", "apply_prompt_routing",
                 "run_onnx_detection", "resolve_model_target"):
        monkeypatch.setattr(pipelines, name, passing_step(name))
    monkeypatch.setattr(pipelines, "execute_input_guards_tiered", blocking_guards)

    check = await pipelines.guard_check_pipeline()({"body": {}})
    proxy = await pipelines.chat_completions_pipeline()({"body": {}})

    assert check["_tag"] == "Left"
    assert proxy["_tag"] == "Left"
    assert check["left"][0]["rule_id"] == proxy["left"][0]["rule_id"]


class _FakeAuth:
    auth_mode = "api_key"


class _FakeTenantContext:
    tenant_id = "org_test"
    auth = _FakeAuth()


class _FakeRequest:
    def __init__(self, headers):
        self.headers = headers


@pytest.fixture
def stub_identity_service(monkeypatch):
    """Stand in for the identity lookup, which needs a database and settings.

    `extract_request_params` imports it lazily, so replacing the module in
    `sys.modules` keeps this a true unit test with no environment to configure.
    """
    module = types.ModuleType("gateway.services.agent_identity_service")

    async def resolve_agent_identity(tenant_id, agent_identifier, application_id):
        return None, application_id

    module.resolve_agent_identity = resolve_agent_identity
    monkeypatch.setitem(
        sys.modules, "gateway.services.agent_identity_service", module
    )
    return module


@pytest.mark.asyncio
async def test_guard_only_does_not_demand_a_model_or_provider_key(
    stub_identity_service,
):
    """The customer's provider credentials never leave their own systems."""
    ctx = {
        # No 'model' in the body and no Authorization header — exactly what a
        # policy-check caller sends.
        "request": _FakeRequest({"x-policy-id": "policy-123"}),
        "body": {"messages": [{"role": "user", "content": "hi"}]},
        "tenant_context": _FakeTenantContext(),
        "guard_only": True,
    }

    result = await extract_request_params(ctx)

    assert result["_tag"] == "Right", result
    assert result["right"]["policy_id"] == "policy-123"
    assert result["right"]["user_api_key"] is None


@pytest.mark.asyncio
async def test_proxy_mode_still_requires_a_provider_key(stub_identity_service):
    """Guard-only must not have loosened the proxying path."""
    ctx = {
        "request": _FakeRequest({"x-policy-id": "policy-123"}),
        "body": {"messages": [{"role": "user", "content": "hi"}]},
        "tenant_context": _FakeTenantContext(),
    }

    result = await extract_request_params(ctx)

    assert result["_tag"] == "Left"
    assert result["left"][0]["rule_id"] == "request.extraction_failed"


class TestRequestShapes:
    """Customers arrive with either an OpenAI body or a bare string."""

    def test_reads_the_latest_user_turn_from_messages(self):
        body = {
            "messages": [
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": "reply"},
                {"role": "user", "content": "second"},
            ]
        }
        assert _extract_text(body) == "second"

    def test_reads_a_plain_input_string(self):
        for key in ("input", "text", "prompt", "content", "message"):
            assert _extract_text({key: "hello"}) == "hello"

    def test_returns_none_when_there_is_nothing_to_check(self):
        assert _extract_text({}) is None
        assert _extract_text({"messages": []}) is None
        assert _extract_text({"messages": [{"role": "system", "content": "x"}]}) is None

    def test_plain_input_is_evaluated_as_a_user_message(self):
        # The guards must see the same shape they would in a proxied request,
        # otherwise the two endpoints could disagree.
        assert _normalise_body({"input": "hello"}, "hello")["messages"] == [
            {"role": "user", "content": "hello"}
        ]

    def test_an_existing_messages_array_is_left_untouched(self):
        body = {"messages": [{"role": "user", "content": "hi"}]}
        assert _normalise_body(body, "hi") is body
