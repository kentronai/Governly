from contextlib import asynccontextmanager

import pytest

from gateway.services import application_policy_service


class _Result:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _Session:
    def __init__(self, row):
        self.row = row
        self.query = None
        self.params = None

    async def execute(self, query, params):
        self.query = str(query)
        self.params = params
        return _Result(self.row)


def _session_context(session):
    @asynccontextmanager
    async def get_session():
        yield session

    return get_session


@pytest.mark.asyncio
async def test_explicit_linked_policy_does_not_need_to_be_default(monkeypatch):
    session = _Session(("strict-policy-id",))
    monkeypatch.setattr(
        application_policy_service,
        "get_session",
        _session_context(session),
    )

    policy_id, source = (
        await application_policy_service.resolve_application_policy(
            tenant_id="tenant-1",
            application_id="application-1",
            explicit_policy_id="strict-policy-id",
        )
    )

    assert policy_id == "strict-policy-id"
    assert source == "application_explicit"
    assert "ap.is_active = true" in session.query
    assert "ap.is_default = true" not in session.query
    assert "p.is_active = true" in session.query


@pytest.mark.asyncio
async def test_automatic_resolution_still_requires_active_default(monkeypatch):
    session = _Session(("standard-policy-id",))
    monkeypatch.setattr(
        application_policy_service,
        "get_session",
        _session_context(session),
    )

    policy_id, source = (
        await application_policy_service.resolve_application_policy(
            tenant_id="tenant-1",
            application_id="application-1",
        )
    )

    assert policy_id == "standard-policy-id"
    assert source == "application_default"
    assert "ap.is_active = true" in session.query
    assert "ap.is_default = true" in session.query


@pytest.mark.asyncio
async def test_explicit_policy_cannot_bypass_tenant_default_without_application(monkeypatch):
    session = _Session(("tenant-default-id",))
    monkeypatch.setattr(
        application_policy_service,
        "get_session",
        _session_context(session),
    )

    policy_id, source = (
        await application_policy_service.resolve_application_policy(
            tenant_id="tenant-1",
            application_id=None,
            explicit_policy_id="weak-policy",
        )
    )

    assert policy_id == "tenant-default-id"
    assert source == "tenant_default"


@pytest.mark.asyncio
async def test_explicit_policy_used_when_tenant_has_no_default(monkeypatch):
    session = _Session(None)
    monkeypatch.setattr(
        application_policy_service,
        "get_session",
        _session_context(session),
    )

    policy_id, source = (
        await application_policy_service.resolve_application_policy(
            tenant_id="tenant-1",
            application_id=None,
            explicit_policy_id="my-policy",
        )
    )

    assert (policy_id, source) == ("my-policy", "explicit")
