# Rate Limits & Errors

## Rate Limits

| Limit | Starter | Pro |
|-------|---------|-----|
| Requests per day (per user) | 100 | 1,000 |
| Requests per minute (per key) | 100 | 100 |
| AI requests per minute (per key) | 10 | 10 |

Daily limits reset at midnight UTC. Per-minute limits use a sliding window per API key.

AI tools (`update_brain`, `prompt_brain`) have a separate, lower per-minute limit because they invoke Claude to process your request.

## Content Limits

| Limit | Starter | Pro |
|-------|---------|-----|
| Tokens per section | 100,000 | 200,000 |
| Total context tokens | 500,000 | 1,000,000 |
| Max input tokens (AI tools) | 100,000 | 100,000 |

Token estimation: ~4 characters = 1 token.

## Rate Limit Headers

When a daily rate limit is exceeded, the response includes:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per day for your plan |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the limit resets (midnight UTC) |

## Error Codes

### Protocol Errors

Returned as JSON-RPC error objects (no `result` field):

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| -32700 | 400 | Parse error (invalid JSON) |
| -32600 | 400 | Invalid JSON-RPC 2.0 request |
| -32601 | 400 | Method not found |
| -32602 | 400 | Invalid params or unknown tool |
| -32001 | 404 | Context not found |
| -32002 | 401 | Missing Authorization header |
| -32003 | 401 | Invalid or revoked API key |
| -32004 | 429 | Per-minute rate limit exceeded |
| -32005 | 429 | AI per-minute rate limit exceeded |
| -32006 | 403 | Context server not published |
| -32007 | 403 | Subscription inactive |
| -32008 | 429 | Daily rate limit exceeded |
| -32009 | 400 | Bad prompt (too short or unclear) |
| -32010 | 400 | Section token limit exceeded |
| -32011 | 400 | Total context token limit exceeded |

### Tool Errors

Returned inside a successful JSON-RPC response with `isError: true`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "Error: invalid section name" }],
    "isError": true
  }
}
```

Common tool errors: invalid section name, empty content, token limit exceeded on write, prompt too short.
