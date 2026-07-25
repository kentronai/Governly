import httpx

from gateway.llm_client import _build_provider_error


def _response(status_code: int, payload: dict) -> httpx.Response:
    return httpx.Response(
        status_code,
        json=payload,
        request=httpx.Request("POST", "https://api.openai.com/v1/chat/completions"),
    )


def test_insufficient_quota_is_mapped_to_safe_actionable_error():
    error = _build_provider_error(
        _response(
            429,
            {
                "error": {
                    "type": "insufficient_quota",
                    "code": "insufficient_quota",
                    "message": "raw provider message",
                }
            },
        )
    )

    assert error.status_code == 429
    assert error.code == "insufficient_quota"
    assert "billing/credits" in str(error)
    assert "raw provider message" not in str(error)


def test_invalid_credentials_are_mapped_without_provider_body():
    error = _build_provider_error(
        _response(
            401,
            {"error": {"code": "invalid_api_key", "message": "secret details"}},
        )
    )

    assert error.status_code == 401
    assert error.code == "invalid_api_key"
    assert str(error) == "The provider rejected the configured credentials."
