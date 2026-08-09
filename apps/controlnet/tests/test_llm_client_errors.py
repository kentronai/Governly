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


def test_provider_message_is_captured_for_operators_but_not_for_callers():
    # The caller-facing message stays generic; the provider's own explanation is
    # what makes a 400 diagnosable in the dashboard, so it must survive.
    error = _build_provider_error(
        _response(
            400,
            {
                "error": {
                    "message": "The model `gemini-2.0-flash` does not exist",
                    "type": "invalid_request_error",
                }
            },
        )
    )

    assert error.status_code == 400
    assert "does not exist" not in str(error)
    assert error.provider_message == "The model `gemini-2.0-flash` does not exist"


def test_provider_message_redacts_echoed_credentials():
    error = _build_provider_error(
        _response(
            401,
            {
                "error": {
                    "message": "Incorrect API key provided: sk-proj-AbCdEf123456789.",
                    "code": "invalid_api_key",
                }
            },
        )
    )

    assert "sk-proj-AbCdEf123456789" not in (error.provider_message or "")
    assert "[redacted]" in (error.provider_message or "")


def test_non_json_provider_body_is_still_captured():
    response = httpx.Response(
        400,
        text="<html>Bad Request</html>",
        request=httpx.Request("POST", "https://example.invalid/v1/chat/completions"),
    )
    error = _build_provider_error(response)

    assert error.code == "provider_request_failed"
    assert error.provider_message == "<html>Bad Request</html>"
