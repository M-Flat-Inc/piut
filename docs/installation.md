# Installation

Connect pıut to your AI tools. Each tool needs your MCP server URL and API key.

**Before you start:**
1. Sign up at [piut.com](https://piut.com)
2. Generate an API key at [piut.com/dashboard/keys](https://piut.com/dashboard/keys)
3. Find your server slug in the dashboard (it's in the MCP URL)

Your MCP server URL: `https://piut.com/api/mcp/YOUR_SLUG`

## Why skill.md matters

Connecting the MCP server gives your AI tool access to your context, but **[skill.md](../skill.md) teaches it how to use that context well** — when to call `get_context`, how to read your `soul` section first, when to use `update_brain` vs `add_memory`, and more.

Each setup guide below includes a step to add the skill.md reference. Without it, your AI tool will see the MCP tools but won't know the best practices for using them.

**skill.md URL:** `https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md`

---

## Claude Code

**Config:** `~/.claude.json`

1. Copy your context key from Dashboard > Keys
2. Edit `~/.claude.json` (create if it doesn't exist)
3. Add the MCP server config:

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

4. Add the skill.md reference to your project's `CLAUDE.md` (or `~/.claude/CLAUDE.md` for global):

```markdown
## pıut Context

This project uses pıut for persistent personal context.
Skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md

Always call `get_context` at the start of a conversation to understand the user.
Read the `soul` section first — it contains behavioral instructions for how to interact.
Use `update_brain` for substantial new information, `add_memory` for quick notes.
```

5. Restart Claude Code

**Verify:** Ask Claude Code: "What do you know about me from my context?"

---

## Claude Desktop

**Config:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

1. Copy your context key from Dashboard > Keys
2. Open Claude Desktop settings
3. Go to Developer > Edit Config
4. Add the MCP server config:

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

5. Add the skill.md as a Project Knowledge file:
   - Create or open a Project in Claude Desktop
   - Click the gear icon > Add Knowledge
   - Upload `skill.md` (download from [here](https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md))
6. Restart Claude Desktop

**Verify:** Ask Claude: "What are my current projects?"

---

## ChatGPT

**Config:** ChatGPT Settings > Connectors

1. Copy your context key from Dashboard > Keys
2. Open ChatGPT > Settings > Connectors
3. Click "Add connector"
4. Enter your MCP server URL and key:

```
Server URL: https://piut.com/api/mcp/YOUR_SLUG
Auth Header: Authorization: Bearer YOUR_KEY
```

5. Enable the connector in your chat
6. Add skill.md guidance to your Custom Instructions (Settings > Personalization > Customize ChatGPT):

```
I use pıut for persistent context. When my pıut MCP tools are available:
- Call get_context at the start of conversations to understand me
- Read my "soul" section first — it has instructions for how I want you to respond
- Use update_brain for substantial new info, add_memory for quick notes
- Full reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md
```

**Verify:** Ask ChatGPT: "Use my context to tell me about my projects"

---

## Cursor

**Config:** `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)

1. Copy your context key from Dashboard > Keys
2. Create or edit `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global)
3. Add the MCP server config:

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

4. Add the skill.md reference to your project rules. Create `.cursor/rules/piut.mdc`:

```markdown
---
description: pıut personal context — how to use MCP tools
alwaysApply: true
---

This project uses pıut for persistent personal context via MCP.
Full skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md

Key behaviors:
- Call `get_context` at the start of every conversation to understand the user
- Read the `soul` section first — it contains behavioral instructions
- Use `update_brain` for substantial new information (AI-powered merge)
- Use `add_memory` for quick notes and bookmarks
- Use `prompt_brain` for edits, deletions, and reorganization
- Use `search_brain` to find specific facts before asking the user
```

5. Reload the Cursor window (Cmd+Shift+P > Reload)

**Verify:** Ask Cursor: "What do you know about my preferences?"

---

## Windsurf

**Config:** `~/.codeium/windsurf/mcp_config.json`

1. Copy your context key from Dashboard > Keys
2. Open `~/.codeium/windsurf/mcp_config.json` (create if needed)
3. Add the MCP server config:

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

4. Add the skill.md reference. Create `.windsurf/rules/piut.md`:

```markdown
# pıut Context

This project uses pıut for persistent personal context via MCP.
Full skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md

- Call `get_context` at the start of every conversation to understand the user
- Read the `soul` section first — it contains behavioral instructions
- Use `update_brain` for substantial new information, `add_memory` for quick notes
- Use `prompt_brain` for edits, deletions, and reorganization
```

5. Restart Windsurf

**Verify:** Ask Windsurf: "What are my areas of responsibility?"

---

## GitHub Copilot

**Config:** VS Code Settings > GitHub Copilot > MCP Servers

1. Copy your context key from Dashboard > Keys
2. Open VS Code Settings (Cmd+,)
3. Search for "GitHub Copilot MCP"
4. Add a new MCP server:

```json
{
  "github.copilot.chat.mcpServers": {
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

5. Add the skill.md reference to `.github/copilot-instructions.md` in your repo:

```markdown
## pıut Context

This project uses pıut for persistent personal context via MCP.
Full skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md

- Call `get_context` at the start of conversations to understand the user
- Read the `soul` section first — it contains behavioral instructions
- Use `update_brain` for substantial new info, `add_memory` for quick notes
```

6. Restart VS Code

**Verify:** Ask Copilot Chat: "What projects am I working on?"

---

## OpenAI Agents SDK

**Config:** In your Python/Node.js code

1. Copy your context key from Dashboard > Keys
2. Install the OpenAI Agents SDK
3. Add the MCP server and skill.md to your agent configuration:

```python
from agents import Agent
from agents.mcp import MCPServerHTTP
import urllib.request

# Load the skill reference so the agent knows how to use pıut tools
skill_md = urllib.request.urlopen(
    "https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md"
).read().decode()

context = MCPServerHTTP(
    url="https://piut.com/api/mcp/YOUR_SLUG",
    headers={"Authorization": "Bearer YOUR_KEY"}
)

agent = Agent(
    name="my-agent",
    instructions=f"You are a helpful assistant.\n\n{skill_md}",
    mcp_servers=[context]
)
```

**Verify:** Run your agent and ask: "What do you know about me?"

---

## Claude Agent SDK

**Config:** In your Python/TypeScript code

1. Copy your context key from Dashboard > Keys
2. Install the Claude Agent SDK
3. Add the MCP server and skill.md reference to your agent configuration:

```typescript
import { Agent } from "claude-agent-sdk";

// Fetch skill.md at startup so the agent knows how to use pıut tools
const skillMd = await fetch(
  "https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md"
).then(r => r.text());

const agent = new Agent({
  system: `You are a helpful assistant.\n\n${skillMd}`,
  mcpServers: [{
    name: "piut-context",
    type: "url",
    url: "https://piut.com/api/mcp/YOUR_SLUG",
    headers: {
      "Authorization": "Bearer YOUR_KEY"
    }
  }]
});
```

**Verify:** Run your agent and ask: "List my current projects"

---

## OpenClaw

**Config:** `~/.openclaw/config.json`

1. Copy your context key from Dashboard > Keys
2. Edit `~/.openclaw/config.json`
3. Add the MCP server config:

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

4. Add the skill.md reference to your project rules or system prompt. Download and include [skill.md](https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md), or add this summary:

```
This project uses pıut for persistent personal context via MCP.
Skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md
Call get_context at conversation start. Read soul first. Use update_brain for big updates, add_memory for quick notes.
```

5. Restart OpenClaw

**Verify:** Ask OpenClaw: "What context do you have about me?"

---

## Msty

**Config:** Msty Settings > MCP Servers

1. Copy your context key from Dashboard > Keys
2. Open Msty > Settings > MCP Servers
3. Click "Add Server"
4. Enter your MCP server URL and authorization header:

```
Server URL: https://piut.com/api/mcp/YOUR_SLUG
Authorization: Bearer YOUR_KEY
```

5. Add the skill.md guidance to your system prompt in Msty's settings:

```
I use pıut for persistent context. When pıut MCP tools are available:
- Call get_context at the start of conversations to understand me
- Read my "soul" section first — it has instructions for how to respond
- Use update_brain for substantial new info, add_memory for quick notes
- Full reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md
```

6. Save and restart Msty

**Verify:** Ask Msty: "Tell me about my context"

---

## Amazon Q

**Config:** `~/.aws/amazonq/mcp.json`

1. Copy your context key from Dashboard > Keys
2. Edit `~/.aws/amazonq/mcp.json` (create the directory if needed)
3. Add the MCP server config:

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

4. Add the skill.md reference to your project's instruction files (e.g., `CONVENTIONS.md` or project README):

```markdown
## pıut Context

This project uses pıut for persistent personal context via MCP.
Full skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md

- Call `get_context` at the start of conversations to understand the user
- Read the `soul` section first — it contains behavioral instructions
- Use `update_brain` for substantial new info, `add_memory` for quick notes
```

5. Restart your IDE or Amazon Q CLI

**Verify:** Ask Amazon Q: "What are my current projects?"

---

## Zed

**Config:** `~/.config/zed/settings.json`

1. Copy your context key from Dashboard > Keys
2. Open Zed settings (Cmd+,)
3. Add the MCP server to `context_servers`:

```json
{
  "context_servers": {
    "piut-context": {
      "type": "url",
      "url": "https://piut.com/api/mcp/YOUR_SLUG",
      "settings": {
        "headers": {
          "Authorization": "Bearer YOUR_KEY"
        }
      }
    }
  }
}
```

4. Add the skill.md reference to your project rules or `.zed/rules.md`:

```markdown
# pıut Context

This project uses pıut for persistent personal context via MCP.
Full skill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md

- Call `get_context` at the start of every conversation to understand the user
- Read the `soul` section first — it contains behavioral instructions
- Use `update_brain` for substantial new info, `add_memory` for quick notes
```

5. Save and restart Zed

**Verify:** Open the assistant panel and ask: "What's in my context?"

---

## Any MCP Client

**Config:** Varies by client

1. Copy your context key from Dashboard > Keys
2. Open your MCP client's configuration
3. Add a new HTTP MCP server:

```
URL: https://piut.com/api/mcp/YOUR_SLUG
Header: Authorization: Bearer YOUR_KEY

Available tools:
  - get_context: Returns all context sections
  - get_section: Returns a specific section (about, soul, areas, projects, memory)
  - add_memory: Appends content to a section
  - search_brain: Searches across all sections
  - update_brain: AI-powered smart update across sections
  - prompt_brain: Natural language command (edit, delete, reorganize)
```

4. Add the [skill.md](https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md) reference to your tool's project rules or system prompt. This teaches the AI when and how to use each tool effectively — call `get_context` at the start of every conversation, read `soul` first for behavioral instructions, use `update_brain` for substantial updates, etc.

**Verify:** Ask your AI: "What do you know about me from my context?"

---

## Google Gemini

> **Note:** Google Gemini does not support MCP yet. Use the export workaround below.

**Config:** Gemini > Settings > Custom Instructions

1. Go to your pıut dashboard > Connect page
2. Click "Export for Gemini" on the Gemini card
3. Copy the formatted context text
4. Open Gemini > Settings (gear icon)
5. Find "Custom Instructions" or "About you"
6. Paste your context text there
7. Save and start a new chat

> Since Gemini can't connect to MCP, the exported context includes your full brain content inline. You'll need to re-export when your context changes. Once Gemini adds MCP support, you can switch to the standard setup with skill.md.

**Verify:** Start a new Gemini chat and ask: "What do you know about me?"
