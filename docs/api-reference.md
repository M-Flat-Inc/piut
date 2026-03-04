# API Reference

pıut uses the [MCP (Model Context Protocol)](https://modelcontextprotocol.io) over HTTP. All requests use JSON-RPC 2.0.

**Endpoint:** `https://piut.com/api/mcp/YOUR_SLUG`
**Auth:** `Authorization: Bearer YOUR_KEY`
**Content-Type:** `application/json`

---

## Read Full Context (Markdown)

Get all context sections as a single markdown document.

```bash
curl -X POST https://piut.com/api/mcp/YOUR_SLUG \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_context",
      "arguments": {}
    }
  }'
```

```python
import requests

res = requests.post(
    "https://piut.com/api/mcp/YOUR_SLUG",
    headers={
        "Authorization": "Bearer YOUR_KEY",
        "Content-Type": "application/json",
    },
    json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "get_context", "arguments": {}},
    },
)

brain = res.json()
print(brain["result"]["content"][0]["text"])
```

```javascript
const res = await fetch("https://piut.com/api/mcp/YOUR_SLUG", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "get_context", arguments: {} },
  }),
});

const brain = await res.json();
console.log(brain.result.content[0].text);
```

---

## Read Full Context (JSON)

Get all context sections as structured JSON.

```bash
curl -X POST https://piut.com/api/mcp/YOUR_SLUG \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_context",
      "arguments": { "format": "json" }
    }
  }'
```

```python
import requests, json

res = requests.post(
    "https://piut.com/api/mcp/YOUR_SLUG",
    headers={
        "Authorization": "Bearer YOUR_KEY",
        "Content-Type": "application/json",
    },
    json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "get_context", "arguments": {"format": "json"}},
    },
)

sections = json.loads(res.json()["result"]["content"][0]["text"])
for s in sections:
    print(f"--- {s['section']} ---")
    print(s["content"][:100])
```

---

## Read a Single Section

Get a specific context section by name.

Sections: `about`, `soul`, `areas`, `projects`, `memory`

```bash
curl -X POST https://piut.com/api/mcp/YOUR_SLUG \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_section",
      "arguments": { "section": "soul" }
    }
  }'
```

---

## Append to a Section

Add content to the end of a context section. Direct append, no AI processing.

```bash
curl -X POST https://piut.com/api/mcp/YOUR_SLUG \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "add_memory",
      "arguments": {
        "section": "memory",
        "content": "Learned about quantum computing today - key insight: qubits can exist in superposition."
      }
    }
  }'
```

---

## Smart Update (AI-Powered)

AI reads your input and intelligently integrates it into the right sections.

Rate-limited to 10 requests/minute.

```bash
curl -X POST https://piut.com/api/mcp/YOUR_SLUG \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "update_brain",
      "arguments": {
        "content": "I just started a new role as VP of Engineering at Acme Corp. We are building a real-time data pipeline using Kafka and Flink."
      }
    }
  }'
```

Response: `"Updated 2 section(s): about, projects"`

---

## Prompt (AI Command)

Execute a natural language command to modify, delete, or reorganize context.

Rate-limited to 10 requests/minute.

```bash
curl -X POST https://piut.com/api/mcp/YOUR_SLUG \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "prompt_brain",
      "arguments": {
        "prompt": "Delete all references to project ABC and move my gym routine from projects to areas."
      }
    }
  }'
```

Example prompts:
- `"Update my job title to Senior Staff Engineer"`
- `"Reorganize the areas section alphabetically"`
- `"Summarize my technical skills into a concise list"`
- `"Delete the memory entry about the old apartment lease"`

---

## Response Format

All tool responses use this JSON-RPC envelope:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "..." }]
  }
}
```

The `text` field contains the tool's output (markdown, JSON, or a status message).

Errors are returned with `isError: true`:

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
