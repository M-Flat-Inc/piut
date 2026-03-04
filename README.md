# pıut

**Give every AI tool persistent memory about you.**

pıut is a personal context service that works via [MCP (Model Context Protocol)](https://modelcontextprotocol.io). Connect once, and every AI tool you use — Claude, ChatGPT, Cursor, Copilot, and more — knows who you are, what you're working on, and how you like to work.

## How It Works

1. **Build your context** — Answer 5 questions or import existing files from your AI tools
2. **Connect your tools** — Add one MCP server config, and every connected AI knows your context
3. **Stay in sync** — Update your context once, and it's reflected everywhere

Your context is organized into 5 sections:

| Section | What it stores |
|---------|---------------|
| **About** | Bio, preferences, goals — the AI's mental model of you |
| **Soul** | Behavioral instructions for AI — tone, guardrails, priorities |
| **Areas** | Long-term life/work domains (Health, Finances, Marketing) |
| **Projects** | Active, time-bound work with goals and deadlines |
| **Memory** | Bookmarks, links, ideas, notes, reference material |

## Quick Start

```bash
# 1. Sign up at piut.com
# 2. Generate an API key at piut.com/dashboard/keys
# 3. Add the MCP server to your AI tool:
```

```json
{
  "mcpServers": {
    "piut-context": {
      "type": "url",
      "url": "https://piut.com/api/mcp/YOUR_SLUG",
      "headers": {
        "Authorization": "Bearer YOUR_KEY"
      }
    }
  }
}
```

See [piut.com/docs](https://piut.com/docs#installation) for setup guides for 15+ AI tools.

## Documentation

| Document | Description |
|----------|-------------|
| [**skill.md**](skill.md) | AI skill file — MCP tools, rate limits, error codes |
| [**Installation**](https://piut.com/docs#installation) | Setup guides for Claude, ChatGPT, Cursor, Copilot, and more |
| [**API Reference**](https://piut.com/docs#api-examples) | Code examples in cURL, Python, Node.js, Go, and Ruby |
| [**Rate Limits**](https://piut.com/docs#limits) | Limits by plan, error codes, and response headers |
| [**Context Files**](https://piut.com/docs#context-files) | Where to find your existing context in 14 AI platforms |

All documentation is maintained at [piut.com/docs](https://piut.com/docs) — the interactive version with credential auto-fill and setup guides.

## MCP Tools

pıut provides 6 tools via MCP:

| Tool | Purpose |
|------|---------|
| `get_context` | Read all 5 context sections |
| `get_section` | Read a specific section |
| `search_brain` | Search across all sections |
| `add_memory` | Append content to a section |
| `update_brain` | AI-powered smart update across sections |
| `prompt_brain` | Natural language command (edit, delete, reorganize) |

Full tool documentation: [skill.md](skill.md)

## Links

- [piut.com](https://piut.com) — Sign up and manage your context
- [piut.com/docs](https://piut.com/docs) — Interactive documentation with credential injection
- [skill.md (raw)](https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md) — Direct link for AI tool configs

## License

Copyright (c) 2025 M-Flat Inc. All rights reserved.

The documentation in this repository is provided for reference and integration purposes. The pıut service is proprietary software.
