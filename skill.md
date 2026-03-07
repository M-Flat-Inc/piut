---
name: piut
description: Persistent personal context MCP server — your AI tools remember who you are.
---

# pıut Context Skill

You have access to a pıut context — a persistent personal context MCP server for this user. Use it whenever you need to:

- **Understand the user** — who they are, how they work, what they care about
- **Remember new information** — the user shares a new project, preference, or life update
- **Look up specific facts** — search for a name, topic, or detail in the context
- **Update user context** — integrate substantial new information into the right sections
- **Clean up outdated info** — delete, reorganize, or edit context on request

**At the start of every conversation, call `get_context`.** Read the `soul` section first — it contains instructions for how this user wants you to behave (tone, guardrails, priorities).

Replace `{{slug}}` with the user's MCP server slug and `{{key}}` with their context key before use.

## Connection

- **Endpoint:** `https://piut.com/api/mcp/{{slug}}`
- **Auth (URL):** `https://piut.com/api/mcp/{{slug}}?key={{key}}` (key in query param)
- **Auth (header):** `Authorization: Bearer {{key}}` (keys start with `pb_`)
- **Protocol:** JSON-RPC 2.0 (MCP)
- **Methods:** `initialize`, `tools/list`, `tools/call`, `ping`

If authentication fails, the user needs to generate a new key at https://piut.com/dashboard/setup.

## Context Sections

The context has 5 sections. Each stores a different type of personal context:

| Section | Contains | Write to it when... |
|---------|----------|---------------------|
| `about` | Bio, preferences, goals, common needs — the AI's mental model of the user | User shares personal info, preferences, or goals |
| `soul` | Identity, mission, behavioral principles, tone, guardrails — instructions FOR YOU, the AI | User wants to change how AI behaves or communicates |
| `areas` | Long-term, ongoing life/work domains (e.g., Health, Finances, Marketing) — no end date | User mentions a new area of responsibility or interest |
| `projects` | Active, time-bound work with goals and deadlines | User starts, updates, or completes a project |
| `memory` | Bookmarks, links, ideas, notes, summaries, reference material | User shares a link, idea, or note worth saving |

**The `soul` section is special.** It contains directives for you — the AI. Read it and follow its instructions on tone, behavior, and guardrails.

## Security & Data

- Brain content encrypted at rest with **AES-256-GCM** (per-user encryption keys)
- All connections over HTTPS (HSTS enforced)
- **Draft/Published model:** Dashboard edits are drafts until you publish. MCP write tools update published content immediately.
- Data stored in PostgreSQL with row-level security.

## Tools

### get_context

Get the full context (all 5 sections).

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `format` | string | no | `"markdown"` (default), `"json"` |

Call this at the start of every conversation.

### get_section

Get a single context section by name.

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `section` | string | yes | `"about"`, `"soul"`, `"areas"`, `"projects"`, `"memory"` |
| `format` | string | no | `"markdown"` (default), `"json"` |

### search_brain

Search across all context sections for matching text (case-insensitive substring).

| Param | Type | Required |
|-------|------|----------|
| `query` | string | yes |

Returns up to 50 matches in format: `[section:lineNumber] matching text`

### append_brain

Append content to a section. Direct concatenation, no AI processing.

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `section` | string | yes | `"about"`, `"soul"`, `"areas"`, `"projects"`, `"memory"` |
| `content` | string | yes | Non-empty text to append |

Writes take effect immediately (both draft and published).

### update_brain

AI-powered integration of new information into the context. Reads the full context, uses AI to decide which sections to update, and writes changes.

| Param | Type | Required |
|-------|------|----------|
| `content` | string | yes |

Rate-limited to 10 req/min.

### prompt_brain

Execute a natural language command against the context. AI reads the context, performs the requested operation, and writes changes.

| Param | Type | Required |
|-------|------|----------|
| `prompt` | string | yes (min 3 chars) |

Rate-limited to 10 req/min.

## Limits

### Rate Limits

| Limit | Value |
|-------|-------|
| Standard tools per minute (per key) | 100 |
| AI tools per minute (`update_brain`, `prompt_brain`) | 10 |
| Requests per day | 500 |

Daily limits reset at midnight UTC.

### Content Limits

| Limit | Value |
|-------|-------|
| Tokens per section | 200,000 |
| Total context tokens | 1,000,000 |
| Max input to AI tools | 100,000 tokens |

Token estimation: ~4 characters = 1 token.

## Error Handling

| Code | Meaning |
|------|---------|
| -32700 | Invalid JSON |
| -32600 | Invalid JSON-RPC request |
| -32601 | Method not found |
| -32602 | Invalid params / unknown tool |
| -32001 | Context not found |
| -32002 | Missing Authorization header |
| -32003 | Invalid or revoked API key |
| -32004 | Per-minute rate limit (standard) |
| -32005 | Per-minute rate limit (AI tools) |
| -32006 | Server not published |
| -32007 | Subscription inactive |
| -32008 | Daily rate limit exceeded |
| -32009 | Bad prompt (min 3 chars) |
| -32010 | Section token limit exceeded |
| -32011 | Total context token limit exceeded |

## Best Practices

1. **Always call `get_context` first.** Context changes between sessions — never rely on cached context.
2. **Read and follow `soul`.** It is the user's behavioral configuration for AI.
3. **Use `append_brain` for quick facts, `update_brain` for substantial context, `prompt_brain` for edits and deletions.**
