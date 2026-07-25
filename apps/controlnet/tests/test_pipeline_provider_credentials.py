from types import SimpleNamespace

import pytest

from cga_core.pipeline_fns import resolve_model_target


class _Client:
    pass


@pytest.mark.asyncio
async def test_playground_loads_gemini_key_after_model_resolution(
    monkeypatch,
):
    target = SimpleNamespace(
        provider="gemini",
        model_id="gemini-3.6-flash",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
    )

    async def resolve_model(**_kwargs):
        return target

    async def get_db():
        yield object()

    captured = {}

    def create_client(api_key, base_url):
        captured.update(api_key=api_key, base_url=base_url)
        return _Client()

    monkeypatch.setattr(
        "gateway.services.model_registry.resolve_model",
        resolve_model,
    )
    monkeypatch.setattr("gateway.db.get_db", get_db)
    monkeypatch.setattr(
        "gateway.llm_client.create_openai_client",
        create_client,
    )
    monkeypatch.setenv("GEMINI_API_KEY", "server-gemini-key")

    result = await resolve_model_target(
        {
            "model_id": "stale-browser-model",
            "user_api_key": None,
            "body": {"model": "stale-browser-model"},
            "tenant_context": SimpleNamespace(
                tenant_id="tenant-1",
                auth=SimpleNamespace(auth_mode="clerk_jwt"),
            ),
        }
    )

    assert result["_tag"] == "Right"
    assert result["right"]["model_id"] == "gemini-3.6-flash"
    assert result["right"]["body"]["model"] == "gemini-3.6-flash"
    assert captured == {
        "api_key": "server-gemini-key",
        "base_url": target.base_url,
    }


@pytest.mark.asyncio
async def test_playground_fails_closed_without_selected_provider_key(
    monkeypatch,
):
    target = SimpleNamespace(
        provider="gemini",
        model_id="gemini-3.6-flash",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai",
    )

    async def resolve_model(**_kwargs):
        return target

    async def get_db():
        yield object()

    monkeypatch.setattr(
        "gateway.services.model_registry.resolve_model",
        resolve_model,
    )
    monkeypatch.setattr("gateway.db.get_db", get_db)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    result = await resolve_model_target(
        {
            "model_id": "gemini-3.6-flash",
            "user_api_key": None,
            "body": {"model": "gemini-3.6-flash"},
            "tenant_context": SimpleNamespace(
                tenant_id="tenant-1",
                auth=SimpleNamespace(auth_mode="clerk_jwt"),
            ),
        }
    )

    assert result["_tag"] == "Left"
    assert result["left"][0]["rule_id"] == "model.resolution_failed"
    assert "GEMINI_API_KEY is not configured" in result["left"][0]["message"]
