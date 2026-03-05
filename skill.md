---
name: piut
description: Persistent personal context for AI — remember who users are, how they work, and what they care about across every conversation.
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
- **Auth header:** `Authorization: Bearer {{key}}` (keys start with `pb_`)
- **Protocol:** JSON-RPC 2.0 (MCP)
- **Methods:** `initialize`, `tools/list`, `tools/call`, `ping`

If authentication fails, the user needs to generate a new key at https://piut.com/dashboard/keys.

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

## Multiple Contexts

Pro users can create up to 5 independent MCP servers — each with its own brain, slug, and API key. Use this for per-project context isolation:

- **Personal** (`johndoe`) — default context for everyday AI use
- **Work** (`johndoe-work`) — work-specific context for Cursor/Claude Code
- **Client A** (`client-a`) — isolated context for a consulting engagement

Each server is fully independent: separate sections, separate API keys, separate publish state.

## How pıut works with CLAUDE.md

pıut complements per-repo context files (CLAUDE.md, .cursorrules, etc.) — it does not replace them.

| | CLAUDE.md / .cursorrules | pıut |
|---|---|---|
| **Scope** | Per-repo project rules | Personal context across all tools |
| **Contains** | Build instructions, coding conventions | Who you are, how you think, what matters to you |
| **Maintained by** | The team / project | You (the individual) |
| **Available in** | That repo only | Every AI tool you connect |

**Best practice:** Keep project-specific instructions in CLAUDE.md. Keep personal context in pıut. Reference `skill.md` in your CLAUDE.md to teach Claude Code how to use your pıut tools.

## Security & Data

- Brain content encrypted at rest with **AES-256-GCM** (per-user encryption keys)
- Encryption keys stored server-side, never exposed to API clients
- All connections over HTTPS (HSTS enforced)
- **Draft/Published model:** Dashboard edits are drafts until you publish. MCP write tools update published content immediately.
- **Export:** Download your full brain as JSON or Markdown from the dashboard at any time.
- Data stored in PostgreSQL (Supabase) with row-level security.

## Tools

### get_context

Get the full context (all 5 sections).

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `format` | string | no | `"markdown"` (default), `"json"` |

Call this at the start of every conversation.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "get_context", "arguments": {} }
}
```

Response: all sections as markdown (headers per section) or JSON array with `section`, `content`, and `updated_at` fields.

### get_section

Get a single context section by name.

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `section` | string | yes | `"about"`, `"soul"`, `"areas"`, `"projects"`, `"memory"` |
| `format` | string | no | `"markdown"` (default), `"json"` |

Use when you only need one section (saves tokens vs. get_context).

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": { "name": "get_section", "arguments": { "section": "projects" } }
}
```

### search_brain

Search across all context sections for matching text (case-insensitive substring).

| Param | Type | Required |
|-------|------|----------|
| `query` | string | yes |

Returns up to 50 matches in format: `[section:lineNumber] matching text`

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": { "name": "search_brain", "arguments": { "query": "machine learning" } }
}
```

Example response text:
```
[about:5] Interested in machine learning and NLP
[projects:12] ML pipeline for customer churn prediction
[memory:3] Link: intro to transformers — arxiv.org/abs/1706.03762
```

### append_brain

Append content to a section. Direct concatenation, no AI processing.

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `section` | string | yes | `"about"`, `"soul"`, `"areas"`, `"projects"`, `"memory"` |
| `content` | string | yes | Non-empty text to append |

Use for quick facts, links, or notes. Content is appended as-is. Writes take effect immediately (both draft and published).

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "append_brain",
    "arguments": {
      "section": "memory",
      "content": "Recommended book: Thinking, Fast and Slow by Daniel Kahneman"
    }
  }
}
```

### update_brain

AI-powered integration of new information into the context. Reads the full context, uses AI to decide which sections to update, and writes changes.

| Param | Type | Required |
|-------|------|----------|
| `content` | string | yes |

Use when the user shares substantial context (new role, life update, project details) that should be woven into existing sections intelligently. Rate-limited to 10 req/min.

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "update_brain",
    "arguments": {
      "content": "I just accepted a new role as VP of Engineering at Acme Corp. Starting March 15. I'll be leading a team of 40 engineers across 3 product lines."
    }
  }
}
```

Response: summary of which sections were updated (e.g., "Successfully updated 2 sections (about, projects).").

### prompt_brain

Execute a natural language command against the context. AI reads the context, performs the requested operation, and writes changes.

| Param | Type | Required |
|-------|------|----------|
| `prompt` | string | yes (min 3 chars) |

Use for deletions, reorganization, targeted edits, or any operation best expressed in plain language. Rate-limited to 10 req/min.

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "prompt_brain",
    "arguments": {
      "prompt": "Remove all references to Project Atlas — it was cancelled. Move any useful notes about it to the memory section."
    }
  }
}
```

Other example prompts:
- "Update my job title to Senior Staff Engineer"
- "Reorganize the areas section alphabetically"
- "Summarize my technical skills into a concise list"
- "Delete the memory entry about the old apartment lease"

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

## Limits

### Rate Limits

| Limit | Value |
|-------|-------|
| Standard tools per minute (per key) | 100 |
| AI tools per minute (`update_brain`, `prompt_brain`) | 10 |
| Requests per day — Starter plan | 100 |
| Requests per day — Pro plan | 1,000 |

Daily limits reset at midnight UTC. When exceeded, response includes headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix timestamp).

### Content Limits

| Limit | Starter | Pro |
|-------|---------|-----|
| Tokens per section | 100,000 | 200,000 |
| Total context tokens | 500,000 | 1,000,000 |
| Max input to AI tools | 100,000 tokens | 100,000 tokens |

Token estimation: ~4 characters = 1 token.

## Error Handling

### Protocol Errors

Returned as JSON-RPC error objects (no `result` field):

| Code | Meaning | Action |
|------|---------|--------|
| -32700 | Invalid JSON | Fix request body |
| -32600 | Invalid JSON-RPC request | Ensure `jsonrpc`, `id`, `method` fields are present |
| -32601 | Method not found | Use: `initialize`, `tools/list`, `tools/call`, `ping` |
| -32602 | Invalid params / unknown tool | Check tool name and argument types |
| -32001 | Context not found | User has no context yet |
| -32002 | Missing Authorization header | Add `Authorization: Bearer {{key}}` header |
| -32003 | Invalid or revoked API key | User needs a new key from dashboard |
| -32004 | Per-minute rate limit (standard) | Wait and retry after a few seconds |
| -32005 | Per-minute rate limit (AI tools) | Wait and retry; max 10/min for AI tools |
| -32006 | Server not published | User needs to publish their context from dashboard |
| -32007 | Subscription inactive | User's subscription expired — inform them |
| -32008 | Daily rate limit exceeded | Wait until midnight UTC or inform user |
| -32009 | Bad prompt | Prompt must be at least 3 characters |
| -32010 | Section token limit exceeded | Content too large for this section |
| -32011 | Total context token limit exceeded | Context is full — user may need to clean up or upgrade |

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

## Best Practices

1. **Always call `get_context` first.** Context changes between sessions — never rely on cached context.
2. **Read and follow `soul`.** It is the user's behavioral configuration for AI. Respect its directives on tone, guardrails, and priorities.
3. **Use `append_brain` for quick facts.** Use `update_brain` for context that needs intelligent organization across sections.
4. **Use `prompt_brain` for deletions and edits.** It can remove outdated info, reorganize, or make targeted changes.
5. **Write to the correct section.** New project? `projects`. Preference change? `about`. Behavioral directive? `soul`. Bookmark or note? `memory`.
6. **Be specific and factual when writing.** Context persists across all of the user's AI tools — vague entries are unhelpful.
7. **Reference context naturally.** Don't recite it back verbatim. Weave it into your responses.
8. **Prefer `get_section` when you only need one section.** It saves tokens and is faster.
9. **Don't retry rate-limited requests immediately.** Wait a few seconds for per-minute limits, or inform the user for daily limits.
10. **Tell the user about auth or subscription errors.** They need to fix these from their pıut dashboard — you can't resolve them.
