# pıut

**Give every AI tool persistent memory about you.**

pıut is a personal context service that works via [MCP (Model Context Protocol)](https://modelcontextprotocol.io). Connect once, and every AI tool you use — Claude, ChatGPT, Cursor, Copilot, and more — knows who you are, what you're working on, and how you like to work.

## Quick Start

1. Sign up at [piut.com](https://piut.com)
2. Build your context (answer 5 questions or import existing files)
3. Generate an API key at [piut.com/dashboard/keys](https://piut.com/dashboard/keys)
4. Add the MCP server to your AI tool:

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

## Documentation

- **[skill.md](skill.md)** — Complete reference for AI tools to interact with your pıut context. Drop this into any project so your AI knows what tools are available.
- **[Full docs](https://piut.com/docs)** — Installation guides for 15+ AI tools, API examples, rate limits, and more.

## What's in this repo

This is the **public documentation and integration reference** for pıut. It contains files that AI tools and developers need to integrate with the pıut MCP server.

| File | Purpose |
|------|---------|
| `skill.md` | AI skill file — tells AI tools how to use pıut's 6 MCP tools |
| `README.md` | This file |

## Links

- [piut.com](https://piut.com) — Sign up and manage your context
- [Documentation](https://piut.com/docs) — Full setup and API docs
- [skill.md (raw)](https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md) — Direct link for AI tool configs

## License

Copyright (c) 2025 M-Flat Inc. All rights reserved.

The documentation in this repository is provided for reference and integration purposes. The pıut service is proprietary software.
