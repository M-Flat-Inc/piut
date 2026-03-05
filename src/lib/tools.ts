import os from 'os'
import path from 'path'
import type { ToolDefinition } from '../types.js'

const MCP_URL = (slug: string) => `https://piut.com/api/mcp/${slug}`
const AUTH_HEADER = (key: string) => ({ Authorization: `Bearer ${key}` })

function appData(): string {
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
}

export const TOOLS: ToolDefinition[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    configKey: 'mcpServers',
    configPaths: {
      darwin: ['~/.claude.json'],
      win32: ['~/.claude.json'],
      linux: ['~/.claude.json'],
    },
    skillFilePath: 'CLAUDE.md',
    quickCommand: (slug, key) =>
      `claude mcp add-json piut-context '${JSON.stringify({
        type: 'http',
        url: MCP_URL(slug),
        headers: AUTH_HEADER(key),
      })}'`,
    generateConfig: (slug, key) => ({
      type: 'http',
      url: MCP_URL(slug),
      headers: AUTH_HEADER(key),
    }),
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    configKey: 'mcpServers',
    configPaths: {
      darwin: ['~/Library/Application Support/Claude/claude_desktop_config.json'],
      win32: [path.join(appData(), 'Claude', 'claude_desktop_config.json')],
      linux: ['~/.config/Claude/claude_desktop_config.json'],
    },
    generateConfig: (slug, key) => ({
      command: 'npx',
      args: [
        '-y', 'mcp-remote',
        MCP_URL(slug),
        '--header', `Authorization: Bearer ${key}`,
      ],
    }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    configKey: 'mcpServers',
    configPaths: {
      darwin: ['~/.cursor/mcp.json'],
      win32: ['~/.cursor/mcp.json'],
      linux: ['~/.cursor/mcp.json'],
      project: ['.cursor/mcp.json'],
    },
    skillFilePath: '.cursor/rules/piut.mdc',
    generateConfig: (slug, key) => ({
      url: MCP_URL(slug),
      headers: AUTH_HEADER(key),
    }),
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    configKey: 'mcpServers',
    configPaths: {
      darwin: ['~/.codeium/windsurf/mcp_config.json'],
      win32: ['~/.codeium/windsurf/mcp_config.json'],
      linux: ['~/.codeium/windsurf/mcp_config.json'],
    },
    skillFilePath: '.windsurf/rules/piut.md',
    generateConfig: (slug, key) => ({
      serverUrl: MCP_URL(slug),
      headers: AUTH_HEADER(key),
    }),
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    configKey: 'servers',
    configPaths: {
      project: ['.vscode/mcp.json'],
    },
    skillFilePath: '.github/copilot-instructions.md',
    generateConfig: (slug, key) => ({
      type: 'http',
      url: MCP_URL(slug),
      headers: AUTH_HEADER(key),
    }),
  },
  {
    id: 'amazon-q',
    name: 'Amazon Q',
    configKey: 'mcpServers',
    configPaths: {
      darwin: ['~/.aws/amazonq/mcp.json'],
      win32: ['~/.aws/amazonq/mcp.json'],
      linux: ['~/.aws/amazonq/mcp.json'],
    },
    skillFilePath: 'CONVENTIONS.md',
    generateConfig: (slug, key) => ({
      type: 'http',
      url: MCP_URL(slug),
      headers: AUTH_HEADER(key),
    }),
  },
  {
    id: 'zed',
    name: 'Zed',
    configKey: 'context_servers',
    configPaths: {
      darwin: ['~/.config/zed/settings.json'],
      linux: ['~/.config/zed/settings.json'],
    },
    skillFilePath: '.zed/rules.md',
    generateConfig: (slug, key) => ({
      settings: {
        url: MCP_URL(slug),
        headers: AUTH_HEADER(key),
      },
    }),
  },
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find(t => t.id === id)
}
