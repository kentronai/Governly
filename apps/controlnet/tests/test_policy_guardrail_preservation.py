"""
Regression tests for the policy-guardrail wipe bug.

Background: `PUT /v1/policies/{policy_id}` persists guardrail changes by
DELETE-ing every `policy_guardrails` row for the policy and re-inserting the
payload. A caller that failed to resolve its guardrails (the web edit page used
to filter global guardrails out of its lookup table) would therefore send an
empty list and silently wipe every guardrail off the policy.

These tests lock in the backend safety net: an empty `guardrails` list must be
rejected before the destructive DELETE runs.
"""

import pytest
from fastapi import HTTPException

from gateway.routes.policies import (
    GuardrailConfig,
    PolicyUpdateRequest,
    update_policy,
)


class _FakeResult:
    """Minimal stand-in for a SQLAlchemy Result."""

    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _RecordingSession:
    """Records every statement executed so tests can assert on the SQL."""

    def __init__(self, policy_row):
        self._policy_row = policy_row
        self.statements: list[str] = []
        self.committed = False
        self.rolled_back = False

    async def execute(self, statement, params=None):
        self.statements.append(str(statement))
        # The first SELECT in update_policy fetches the existing policy.
        return _FakeResult(self._policy_row)

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    def executed_sql(self) -> str:
        return "\n".join(self.statements).upper()


class _FakeAuth:
    user_id = "user_test"


class _FakeTenant:
    tenant_id = "org_test"
    auth = _FakeAuth()


class _FakeRequest:
    """Stands in for a Starlette Request (only `.app.state` is touched)."""

    class _App:
        class _State:
            pass

        state = _State()

    app = _App()


@pytest.fixture
def existing_policy_row():
    # Matches the SELECT column order in update_policy:
    # id, tenant_id, name, description, version, status, is_active
    return (
        "11111111-1111-1111-1111-111111111111",
        "org_test",
        "Launch",
        "Existing description",
        "v1",
        "active",
        True,
    )


@pytest.fixture
def patched_auth(monkeypatch):
    async def _fake_require_tenant_auth(request):
        return _FakeTenant()

    monkeypatch.setattr(
        "gateway.routes.policies.require_tenant_auth",
        _fake_require_tenant_auth,
    )


@pytest.mark.asyncio
async def test_update_policy_rejects_empty_guardrail_list(
    existing_policy_row, patched_auth
):
    """An empty guardrails list must 400 rather than wipe the policy."""
    db = _RecordingSession(existing_policy_row)

    with pytest.raises(HTTPException) as exc_info:
        await update_policy(
            policy_id="11111111-1111-1111-1111-111111111111",
            policy_data=PolicyUpdateRequest(guardrails=[]),
            request=_FakeRequest(),
            db=db,
        )

    assert exc_info.value.status_code == 400
    assert "at least one guardrail" in exc_info.value.detail

    # The critical assertion: the destructive DELETE must never have run.
    assert "DELETE FROM POLICY_GUARDRAILS" not in db.executed_sql()


@pytest.mark.asyncio
async def test_update_policy_does_not_touch_guardrails_when_omitted(
    existing_policy_row, patched_auth
):
    """A metadata-only update must not delete guardrails."""
    db = _RecordingSession(existing_policy_row)

    await update_policy(
        policy_id="11111111-1111-1111-1111-111111111111",
        policy_data=PolicyUpdateRequest(description="renamed only"),
        request=_FakeRequest(),
        db=db,
    )

    assert "DELETE FROM POLICY_GUARDRAILS" not in db.executed_sql()


@pytest.mark.asyncio
async def test_update_policy_accepts_non_empty_guardrail_list(
    existing_policy_row, patched_auth
):
    """A populated list is still allowed past the new guard.

    Reaching the DELETE/INSERT stage is the expected behaviour here; the guard
    must only block the empty-list case.
    """
    db = _RecordingSession(existing_policy_row)

    try:
        await update_policy(
            policy_id="11111111-1111-1111-1111-111111111111",
            policy_data=PolicyUpdateRequest(
                guardrails=[
                    GuardrailConfig(
                        guardrail_id="22222222-2222-2222-2222-222222222222",
                        phase="input",
                        order_index=0,
                    )
                ]
            ),
            request=_FakeRequest(),
            db=db,
        )
    except HTTPException as exc:
        # Must not be rejected by the empty-guardrail guard.
        assert exc.status_code != 400 or "at least one guardrail" not in exc.detail
    except Exception:
        # Downstream stages need a real database; irrelevant to this guard.
        pass

    assert "DELETE FROM POLICY_GUARDRAILS" in db.executed_sql()
