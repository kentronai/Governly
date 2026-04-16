# ControlNet API Reference

OpenAI-compatible API for AI governance and guardrails.

## Base URL

- **Development**: `http://localhost/v1`
- **Production**: `https://your-domain.com/v1`

## Authentication

### BYOK Mode (Bring Your Own API Key)

**Headers:**

```
Authorization: Bearer <your-provider-key>
X-API-KEY: <controlnet-api-key>
X-Policy-ID: <policy-id>
```

Where:
- `your-provider-key`: Your OpenAI/Anthropic/etc API key
- `controlnet-api-key`: Your ControlNet API key (tenant auth)
- `policy-id`: UUID of policy to apply

### Playground Mode (Web UI)

**Headers:**

```
Authorization: Bearer <clerk-jwt>
X-Tenant-ID: <tenant-id>
X-Policy-ID: <policy-id>
```

## Chat Completions

### POST `/v1/chat/completions`

Create a chat completion with guard enforcement.

**Request:**

```bash
curl -X POST https://api.example.com/v1/chat/completions \
  -H "Authorization: Bearer sk-your-openai-key" \
  -H "X-API-KEY: cn_test_your-controlnet-key" \
  -H "X-Policy-ID: abc-123-def-456" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'
```

**Response (Success):**

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 8,
    "total_tokens": 18
  },
  "guardrails": {
    "input_guards": [
      {
        "guard_id": "pii.detect",
        "status": "passed",
        "execution_time_ms": 5.2
      }
    ],
    "output_guards": [
      {
        "guard_id": "toxicity.check",
        "status": "passed",
        "execution_time_ms": 12.5
      }
    ],
    "execution_time_ms": {
      "input": 5.2,
      "output": 12.5
    },
    "policy_id": "abc-123-def-456"
  }
}
```

**Response (Policy Violation):**

```json
{
  "error": {
    "type": "policy_violation",
    "message": "Input policy violation: Email detected in prompt",
    "policy_id": "abc-123-def-456",
    "policy_hash": "sha256:xyz...",
    "rule_id": "pii.email",
    "action": "refuse",
    "trace_id": "trace-abc-123"
  },
  "guardrails": {
    "input_guards": [
      {
        "guard_id": "pii.detect",
        "status": "failed",
        "violation": {
          "rule_id": "pii.email",
          "severity": "high",
          "message": "Email detected in prompt"
        },
        "execution_time_ms": 5.2
      }
    ],
    "output_guards": [],
    "execution_time_ms": {
      "input": 5.2,
      "output": 0
    }
  }
}
```

## Streaming

Enable streaming with `"stream": true`:

**Request:**

```bash
curl -X POST https://api.example.com/v1/chat/completions \
  -H "Authorization: Bearer sk-your-key" \
  -H "X-API-KEY: cn_test_your-key" \
  -H "X-Policy-ID: abc-123" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

**Response:**

```
data: {"guardrails": {...}}

data: {"choices": [{"delta": {"content": "Hello"}}]}

data: {"choices": [{"delta": {"content": "!"}}]}

data: {"choices": [{"delta": {"content": " How"}}]}

...

data: [DONE]
```

## Parameters

### Model ID

Specify model via header or body:

```bash
# Via header (priority)
X-Model-ID: gpt-4

# Via body (standard)
{"model": "gpt-4", ...}
```

### Policy Override

Override policy per request:

```bash
X-Policy-ID: <policy-uuid>
```

### Trace ID

For request correlation:

```bash
X-Trace-ID: <trace-id>
```

## Guards

### Input Guards

Execute before sending to provider:

```json
{
  "guardrails": {
    "input_guards": [
      {
        "guard_id": "pii.detect",
        "status": "passed",
        "execution_time_ms": 5.2
      }
    ]
  }
}
```

Common input guards:
- `pii.detect` - PII detection
- `jailbreak.detect` - Prompt injection
- `schema.validate` - JSON schema validation

### Output Guards

Execute on provider response:

```json
{
  "guardrails": {
    "output_guards": [
      {
        "guard_id": "toxicity.check",
        "status": "passed",
        "execution_time_ms": 12.5
      }
    ]
  }
}
```

Common output guards:
- `toxicity.check` - Toxicity detection
- `safety.onnx_detect` - ONNX safety models
- `politics.check` - Political content

## Response Headers

All responses include:

```
x-policy-id: abc-123-def-456
x-policy-hash: sha256:xyz...
x-tenant-id: tenant-123
x-trace-id: trace-abc-123
```

## Error Handling

### 400 Bad Request

```json
{
  "error": "Missing X-Policy-ID header. Specify which policy to apply."
}
```

### 401 Unauthorized

```json
{
  "error": "Invalid API key"
}
```

### 403 Forbidden

```json
{
  "error": "Access denied"
}
```

### 500 Internal Error

```json
{
  "error": "Internal server error"
}
```

## Examples

### Python

```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "https://api.example.com/v1/chat/completions",
        headers={
            "Authorization": "Bearer sk-your-key",
            "X-API-KEY": "cn_test_your-key",
            "X-Policy-ID": "abc-123",
        },
        json={
            "model": "gpt-4",
            "messages": [
                {"role": "user", "content": "Hello!"}
            ],
        },
    )
    print(response.json())
```

### JavaScript

```javascript
const response = await fetch('https://api.example.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk-your-key',
    'X-API-KEY': 'cn_test_your-key',
    'X-Policy-ID': 'abc-123',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
});

const data = await response.json();
console.log(data);
```

## Other Endpoints

### Health

```bash
GET /healthz  # Liveness probe
GET /readyz   # Readiness probe
```

### Policies

```bash
GET /v1/policies         # List policies
GET /v1/policies/:id      # Get policy
POST /v1/policies         # Create policy
```

### Guardrails

```bash
GET /v1/guardrails        # List guardrails
GET /v1/guardrails/:id    # Get guardrail
```

## Rate Limits

Rate limits are configurable per API key:

- Default: 1000 requests/minute
- Burst: 100 requests

Exceeded:

```json
{
  "error": {
    "type": "rate_limit_exceeded",
    "message": "Rate limit exceeded",
    "retry_after": 60
  }
}
```

## Webhooks (Coming Soon)

Configure webhooks for policy violations:

```bash
POST /v1/webhooks
{
  "url": "https://your-app.com/webhook",
  "events": ["policy_violation"],
  "secret": "whsec_..."
}
```

