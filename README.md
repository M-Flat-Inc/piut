# pıut

**Give every AI tool persistent memory about you.**

pıut is a personal context service that works via [MCP (Model Context Protocol)](https://modelcontextprotocol.io). Connect once, and every AI tool you use — Claude, ChatGPT, Cursor, Copilot, and more — knows who you are, what you're working on, and how you like to work.

## Quick Start

```bash
npx piut
```

That's it. The CLI auto-detects your AI tools and configures them.

Or set up manually:

1. Sign up at [piut.com](https://piut.com)
2. Generate an API key at [piut.com/dashboard/keys](https://piut.com/dashboard/keys)
3. Add the MCP server to your AI tool:

```json
{
  "mcpServers": {
    "piut-context": {
      "type": "http",
      "url": "https://piut.com/api/mcp/YOUR_SLUG",
      "headers": {
        "Authorization": "Bearer YOUR_KEY"
      }
    }
  }
}
```

See [piut.com/docs](https://piut.com/docs#add-to-ai) for setup guides for 14+ AI tools.

## CLI

Install globally or run with `npx`:

```bash
npx piut              # Auto-detect and configure AI tools
npx piut status       # Show which tools are connected
npx piut remove       # Remove pıut from selected tools
```

**Options:**

```bash
npx piut --key pb_... # Pass API key non-interactively
npx piut --tool cursor # Configure a single tool
npx piut --skip-skill  # Skip skill.md file placement
```

**Supported tools:** Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot, Amazon Q, Zed

## How It Works

1. **Build your context** — Answer 5 questions or import existing files from your AI tools
2. **Connect your tools** — Run `npx piut` or add one config, and every connected AI knows your context
3. **Stay in sync** — Update your context once, and it's reflected everywhere

Your context is organized into 5 sections:

| Section | What it stores |
|---------|---------------|
| **About** | Bio, preferences, goals — the AI's mental model of you |
| **Soul** | Behavioral instructions for AI — tone, guardrails, priorities |
| **Areas** | Long-term life/work domains (Health, Finances, Marketing) |
| **Projects** | Active, time-bound work with goals and deadlines |
| **Memory** | Bookmarks, links, ideas, notes, reference material |

## Documentation

| Document | Description |
|----------|-------------|
| [**skill.md**](skill.md) | AI skill file — MCP tools, rate limits, error codes |
| [**Add to your AI**](https://piut.com/docs#add-to-ai) | Setup guides for Claude, ChatGPT, Cursor, Copilot, and more |
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
