from unittest.mock import AsyncMock

import pytest

from gateway.services.model_registry import resolve_model


class _Result:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


@pytest.mark.asyncio
async def test_tenant_selection_is_authoritative():
    session = AsyncMock()
    session.execute.return_value = _Result(
        (
            "gemini",
            "gemini-3.6-flash",
            "https://generativelanguage.googleapis.com/v1beta/openai",
            {},
        )
    )

    target = await resolve_model("stale-browser-model", "tenant-1", session)

    assert target.model_id == "gemini-3.6-flash"
    assert target.provider == "gemini"
    assert (
        target.base_url
        == "https://generativelanguage.googleapis.com/v1beta/openai"
    )
    assert session.execute.await_count == 1


@pytest.mark.asyncio
async def test_requested_model_is_used_when_tenant_has_no_selection():
    session = AsyncMock()
    session.execute.side_effect = [
        _Result(None),
        _Result(("openai", "gpt-4o-mini", "https://api.openai.com/v1", {})),
    ]

    target = await resolve_model("gpt-4o-mini", "tenant-1", session)

    assert target.model_id == "gpt-4o-mini"
    assert session.execute.await_count == 2
