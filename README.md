# p&#x131;ut

**Your AI brain, everywhere.**

p&#x131;ut builds your personal AI context, deploys it as an MCP server, and connects it to every tool you use. One brain, one API key — Claude, Cursor, Copilot, ChatGPT, and more.

## Quick Start

```bash
npm install -g @piut/cli
piut
```

The interactive menu walks you through building your brain, deploying your MCP server, and connecting your AI tools. Or use `npx @piut/cli` to run without installing.

---

## 1. Install

Sign up at [piut.com](https://piut.com) (14-day free trial, no credit card required), then install the CLI:

```bash
npm install -g @piut/cli    # Install globally
piut                        # Interactive menu
```

### CLI Reference

| Command | Description |
|---------|-------------|
| `piut` | Interactive menu — build, deploy, and connect in one flow |
| `piut build` | Build or rebuild your brain from your files |
| `piut deploy` | Publish your MCP server (requires paid account) |
| `piut connect` | Add brain references to project config files |
| `piut disconnect` | Remove brain references from project config files |
| `piut setup` | Auto-detect and configure AI tools (MCP config + skill.md) |
| `piut status` | Show brain, deployment, and connected projects |
| `piut remove` | Remove all p&#x131;ut configurations |
| `piut sync` | Sync agent config files to the cloud |
| `piut sync config` | Configure sync settings |

#### piut build options

```bash
piut build                        # Scan current directory
piut build --folders src,docs     # Scan specific folders
piut build --key pb_YOUR_KEY      # Non-interactive
```

#### piut deploy options

```bash
piut deploy                       # Deploy with confirmation
piut deploy --yes                 # Skip confirmation
piut deploy --key pb_YOUR_KEY     # Non-interactive
```

#### piut connect / disconnect options

```bash
piut connect                      # Add brain refs to project configs
piut connect --folders src,docs   # Scan specific folders
piut disconnect                   # Remove brain refs
piut disconnect --yes             # Skip confirmation
```

#### piut setup options

```bash
piut setup                        # Auto-detect and configure all tools
piut setup --tool cursor          # Configure a single tool
piut setup --key pb_KEY --yes     # Non-interactive (all tools)
piut setup --project              # Prefer project-local config files
piut setup --skip-skill           # Skip skill.md file placement
```

#### piut sync options

```bash
piut sync                         # Show backup status
piut sync --install               # Guided sync setup
piut sync --push                  # Push local changes to cloud
piut sync --pull                  # Pull cloud changes to local
piut sync --watch                 # Watch for changes and auto-push
piut sync --history <file>        # Show version history
piut sync --diff <file>           # Diff local vs cloud
piut sync --restore <file>        # Restore from cloud backup
piut sync --prefer-local          # Resolve conflicts keeping local
piut sync --prefer-cloud          # Resolve conflicts keeping cloud
piut sync --install-daemon        # Set up auto-sync via cron/launchd
```

#### piut sync config options

```bash
piut sync config --show                     # View current settings
piut sync config --files                    # Change which files are synced
piut sync config --auto-discover on         # Auto-sync new files
piut sync config --keep-brain-updated on    # Keep brain updated from synced files
piut sync config --use-brain on             # Reference centralized brain
```

All commands accept `-k, --key <key>` for non-interactive API key input and `-y, --yes` to skip prompts (where applicable).

---

## 2. Build Your Brain

Your brain has 5 sections that give AI tools a complete picture of who you are:

| Section | What it stores |
|---------|---------------|
| **about** | Bio, preferences, goals — the AI's mental model of you |
| **soul** | Behavioral instructions for AI — tone, guardrails, priorities |
| **areas** | Long-term life/work domains (Health, Finances, Marketing) |
| **projects** | Active, time-bound work with goals and deadlines |
| **memory** | Bookmarks, links, ideas, notes, reference material |

Three ways to build your brain:

- **CLI:** `piut build` scans your files (CLAUDE.md, .cursorrules, etc.) and builds automatically
- **Dashboard:** Use the [brain editor](https://piut.com/dashboard/build) to import files, answer questions, or write each section directly
- **API:** Use `update_brain` or `append_brain` to build programmatically

Edits are saved as drafts. When you publish, every connected AI tool sees your updates instantly.

---

## 3. Deploy Your Brain

Publishing turns your brain into a live MCP server. Requires an active subscription ($10/month after 14-day trial).

```bash
piut deploy                       # Deploy with confirmation
piut deploy --yes                 # Skip confirmation
```

### Connection Details

- **URL:** `https://piut.com/api/mcp/YOUR_SLUG`
- **Auth (header):** `Authorization: Bearer YOUR_KEY`
- **Protocol:** JSON-RPC 2.0 (MCP)

Standard config for most tools:

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

---

## 4. Connect Your Brain

Three ways to connect your brain to your AI tools:

1. **Via CLI** (easiest): `piut setup` auto-detects tools and configures everything. `piut connect` adds brain references to project configs.
2. **Via skill.md**: Add a skill reference to your rules file so your AI knows *when* and *how* to use your brain. The CLI adds this automatically.
3. **Manually**: Edit config files directly for each tool.

For scripting: `piut setup --key pb_YOUR_KEY --yes`

**Supported tools:** Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, Amazon Q, Zed, ChatGPT, OpenClaw, Msty, OpenAI Agents SDK, Claude Agent SDK, and any MCP client.

### skill.md Reference

Add a reference to [skill.md](skill.md) in your tool's rules file so your AI knows *when* and *how* to use your brain:

| Tool | Add skill.md reference to |
|------|--------------------------|
| Claude Code | CLAUDE.md or ~/.claude/CLAUDE.md |
| Cursor | .cursor/rules/piut.mdc |
| Windsurf | .windsurf/rules/piut.md |
| VS Code | .github/copilot-instructions.md |
| Claude Desktop | Project Knowledge (upload file) |
| ChatGPT | Settings > Custom Instructions |
| Zed | .zed/rules.md |
| Amazon Q | CONVENTIONS.md |
| Any other tool | System prompt or rules file |

---

## 5. Use Your Brain

### MCP Tools

6 MCP tools let your AI read and write your brain automatically:

| Tool | Purpose | Rate Limit |
|------|---------|-----------|
| `get_context` | Read all 5 context sections | 100/min |
| `get_section` | Read a specific section | 100/min |
| `search_brain` | Search across all sections | 100/min |
| `append_brain` | Append content to a section | 10/min |
| `update_brain` | AI-powered smart update across sections | 10/min |
| `prompt_brain` | Natural language command (edit, delete, reorganize) | 10/min |

`get_context`, `get_section`, and `search_brain` are read-only (100 req/min). `update_brain`, `append_brain`, and `prompt_brain` use AI processing (10 req/min).

### Config Sync

Sync your agent config files to the cloud with version history and cross-machine sync:

```bash
piut sync --install    # Guided setup
piut sync --push       # Push local changes
piut sync --pull       # Pull cloud changes
```

#### Supported files for sync

| File | Tool | Typical location |
|------|------|-----------------|
| `CLAUDE.md` | Claude Code | Repo root, .claude/ |
| `AGENTS.md` | Multi-agent | Repo root |
| `.cursorrules` | Cursor | Repo root |
| `.windsurfrules` | Windsurf | Repo root |
| `copilot-instructions.md` | VS Code | .github/ |
| `MEMORY.md` | Claude Code | ~/.claude/ |
| `SOUL.md` | OpenClaw | ~/.openclaw/workspace/ |
| `rules/*.md` | Various | .cursor/rules/, .claude/rules/ |

---

## Documentation

| Document | Description |
|----------|-------------|
| [**skill.md**](skill.md) | AI skill file — MCP tools, rate limits, error codes |
| [**piut.com/docs**](https://piut.com/docs) | Interactive docs with setup guides and credential auto-fill |
| [**API Examples**](https://piut.com/docs#api-examples) | Code examples in cURL, Python, Node.js, Go, and Ruby |
| [**Rate Limits**](https://piut.com/docs#limits) | Limits by plan, error codes, and response headers |

## Links

- [piut.com](https://piut.com) — Sign up and manage your context
- [piut.com/docs](https://piut.com/docs) — Interactive documentation
- [skill.md (raw)](https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md) — Direct link for AI tool configs

## License

Copyright (c) 2025 M-Flat Inc. All rights reserved.

The documentation in this repository is provided for reference and integration purposes. The p&#x131;ut service is proprietary software.
