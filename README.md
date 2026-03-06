# p&#x131;ut

**Your AI context, everywhere. Your config files, backed up.**

p&#x131;ut does three things that build on each other:

1. **Host your brain** — Centralized personal context as an MCP server. Connect once, and every AI tool you use knows who you are, how you work, and what matters to you.
2. **Keep it updated** — 6 MCP tools let your AI read, write, search, and organize your context automatically. Add a skill reference and it happens without you lifting a finger.
3. **Back up your files** — Cloud backup of all your agent config files (CLAUDE.md, .cursorrules, AGENTS.md, etc.) with version history, restore, and cross-machine sync.

## Quick Start

```bash
npx @piut/cli
```

The CLI does everything in one interactive flow:
- Configures your AI tools with your MCP server
- Adds skill.md references to your rules files
- Scans and backs up your agent config files to the cloud

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
# Setup & Configuration
npx @piut/cli              # Interactive setup: MCP + skill.md + cloud backup
npx @piut/cli status       # Show which tools are connected
npx @piut/cli remove       # Remove pıut from selected tools

# Cloud Backup
npx @piut/cli sync         # Show backup status for current workspace
npx @piut/cli sync --install  # Scan workspace, detect files, upload to cloud
npx @piut/cli sync --push  # Push local changes to cloud
npx @piut/cli sync --pull  # Pull cloud changes to local files
npx @piut/cli sync --history   # Show version history for a file
npx @piut/cli sync --diff  # Show diff between local and cloud
npx @piut/cli sync --restore   # Restore files from cloud backup
```

**Options:**

```bash
npx @piut/cli --key pb_... # Pass API key non-interactively
npx @piut/cli --tool cursor # Configure a single tool
npx @piut/cli --skip-skill  # Skip skill.md file placement
npx @piut/cli sync --install --yes  # Non-interactive backup setup
```

**Supported tools:** Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot, Amazon Q, Zed

## The Three Features

### 1. Host Your Brain (MCP Server)

Your brain is organized into 5 sections, accessible from every AI tool via MCP:

| Section | What it stores |
|---------|---------------|
| **About** | Bio, preferences, goals — the AI's mental model of you |
| **Soul** | Behavioral instructions for AI — tone, guardrails, priorities |
| **Areas** | Long-term life/work domains (Health, Finances, Marketing) |
| **Projects** | Active, time-bound work with goals and deadlines |
| **Memory** | Bookmarks, links, ideas, notes, reference material |

### 2. Keep It Updated (MCP Tools + Skill)

6 tools let your AI read and write your brain:

| Tool | Purpose |
|------|---------|
| `get_context` | Read all 5 context sections |
| `get_section` | Read a specific section |
| `search_brain` | Search across all sections |
| `append_brain` | Append content to a section |
| `update_brain` | AI-powered smart update across sections |
| `prompt_brain` | Natural language command (edit, delete, reorganize) |

Add the [skill reference](skill.md) to your rules file and your AI uses these tools automatically.

### 3. Back Up Your Files (Cloud Backup)

The CLI scans your workspace for agent config files and backs them up to the cloud:

| File | Tool |
|------|------|
| `CLAUDE.md` | Claude Code |
| `AGENTS.md` | Multi-agent |
| `.cursorrules` | Cursor |
| `.windsurfrules` | Windsurf |
| `copilot-instructions.md` | GitHub Copilot |
| `MEMORY.md` | Claude Code |
| `SOUL.md` | OpenClaw |
| `rules/*.md` | Various |

Files are encrypted at rest (AES-256-GCM), versioned, and syncable across machines.

## Documentation

| Document | Description |
|----------|-------------|
| [**skill.md**](skill.md) | AI skill file — MCP tools, rate limits, error codes |
| [**Add to your AI**](https://piut.com/docs#add-to-ai) | Setup guides for Claude, ChatGPT, Cursor, Copilot, and more |
| [**API Reference**](https://piut.com/docs#api-examples) | Code examples in cURL, Python, Node.js, Go, and Ruby |
| [**Cloud Backup**](https://piut.com/docs#cloud-backup) | Cloud backup setup, commands, and sync workflow |
| [**Rate Limits**](https://piut.com/docs#limits) | Limits by plan, error codes, and response headers |

All documentation is maintained at [piut.com/docs](https://piut.com/docs) — the interactive version with credential auto-fill and setup guides.

## Links

- [piut.com](https://piut.com) — Sign up and manage your context
- [piut.com/docs](https://piut.com/docs) — Interactive documentation with credential injection
- [skill.md (raw)](https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md) — Direct link for AI tool configs

## License

Copyright (c) 2025 M-Flat Inc. All rights reserved.

The documentation in this repository is provided for reference and integration purposes. The pıut service is proprietary software.
