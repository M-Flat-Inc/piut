# Installation

Connect pıut to your AI tools. Each tool needs your MCP server URL and API key.

**Before you start:**
1. Sign up at [piut.com](https://piut.com)
2. Generate an API key at [piut.com/dashboard/keys](https://piut.com/dashboard/keys)
3. Find your server slug in the dashboard (it's in the MCP URL)

Your MCP server URL: `https://piut.com/api/mcp/YOUR_SLUG`

---

## Claude Code

**Config:** `~/.claude.json`

1. Copy your context key from Dashboard > Keys
2. Open your terminal
3. Edit `~/.claude.json` (create if it doesn't exist)
4. Add the MCP server config:
5. Restart Claude Code

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

**Verify:** Ask Claude Code: "What do you know about me from my context?"

---

## Claude Desktop

**Config:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

1. Copy your context key from Dashboard > Keys
2. Open Claude Desktop settings
3. Go to Developer > Edit Config
4. Add the MCP server config:
5. Restart Claude Desktop

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

**Verify:** Ask Claude: "What are my current projects?"

---

## ChatGPT

**Config:** ChatGPT Settings > Connectors

1. Copy your context key from Dashboard > Keys
2. Open ChatGPT > Settings > Connectors
3. Click "Add connector"
4. Enter your MCP server URL and key:
5. Enable the connector in your chat

```
Server URL: https://piut.com/api/mcp/YOUR_SLUG
Auth Header: Authorization: Bearer YOUR_KEY
```

**Verify:** Ask ChatGPT: "Use my context to tell me about my projects"

---

## Cursor

**Config:** `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)

1. Copy your context key from Dashboard > Keys
2. Create or edit `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global)
3. Add the MCP server config:
4. Reload the Cursor window (Cmd+Shift+P > Reload)

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

**Verify:** Ask Cursor: "What do you know about my preferences?"

---

## Windsurf

**Config:** `~/.codeium/windsurf/mcp_config.json`

1. Copy your context key from Dashboard > Keys
2. Open `~/.codeium/windsurf/mcp_config.json` (create if needed)
3. Add the MCP server config:
4. Restart Windsurf

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

**Verify:** Ask Windsurf: "What are my areas of responsibility?"

---

## GitHub Copilot

**Config:** VS Code Settings > GitHub Copilot > MCP Servers

1. Copy your context key from Dashboard > Keys
2. Open VS Code Settings (Cmd+,)
3. Search for "GitHub Copilot MCP"
4. Add a new MCP server:
5. Restart VS Code

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

**Verify:** Ask Copilot Chat: "What projects am I working on?"

---

## OpenAI Agents SDK

**Config:** In your Python/Node.js code

1. Copy your context key from Dashboard > Keys
2. Install the OpenAI Agents SDK
3. Add the MCP server to your agent configuration:

```python
from agents import Agent
from agents.mcp import MCPServerHTTP

context = MCPServerHTTP(
    url="https://piut.com/api/mcp/YOUR_SLUG",
    headers={"Authorization": "Bearer YOUR_KEY"}
)

agent = Agent(
    name="my-agent",
    mcp_servers=[context]
)
```

**Verify:** Run your agent and ask: "What do you know about me?"

---

## Claude Agent SDK

**Config:** In your Python/TypeScript code

1. Copy your context key from Dashboard > Keys
2. Install the Claude Agent SDK
3. Add the MCP server to your agent configuration:

```typescript
import { Agent } from "claude-agent-sdk";

const agent = new Agent({
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
4. Restart OpenClaw

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

**Verify:** Ask OpenClaw: "What context do you have about me?"

---

## Msty

**Config:** Msty Settings > MCP Servers

1. Copy your context key from Dashboard > Keys
2. Open Msty > Settings > MCP Servers
3. Click "Add Server"
4. Enter your MCP server URL and authorization header:
5. Save and restart Msty

```
Server URL: https://piut.com/api/mcp/YOUR_SLUG
Authorization: Bearer YOUR_KEY
```

**Verify:** Ask Msty: "Tell me about my context"

---

## Amazon Q

**Config:** `~/.aws/amazonq/mcp.json`

1. Copy your context key from Dashboard > Keys
2. Edit `~/.aws/amazonq/mcp.json` (create the directory if needed)
3. Add the MCP server config:
4. Restart your IDE or Amazon Q CLI

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

**Verify:** Ask Amazon Q: "What are my current projects?"

---

## Zed

**Config:** `~/.config/zed/settings.json`

1. Copy your context key from Dashboard > Keys
2. Open Zed settings (Cmd+,)
3. Add the MCP server to `context_servers`:
4. Save and restart Zed

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

**Verify:** Open the assistant panel and ask: "What's in my context?"

---

## Any MCP Client

**Config:** Varies by client

1. Copy your context key from Dashboard > Keys
2. Open your MCP client's configuration
3. Add a new HTTP MCP server:
4. Restart the client

```
URL: https://piut.com/api/mcp/YOUR_SLUG
Header: Authorization: Bearer YOUR_KEY

Available tools:
  - get_context: Returns all context sections
  - get_section: Returns a specific section (about, soul, areas, projects, memory)
  - add_memory: Appends content to a section
  - search_brain: Searches across all sections
```

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

**Verify:** Start a new Gemini chat and ask: "What do you know about me?"
