import os from 'os'
import path from 'path'
import crypto from 'crypto'
import type { ToolDefinition } from '../types.js'

const MCP_URL = (slug: string) => `https://piut.com/api/mcp/${slug}`
const AUTH_HEADER = (key: string) => ({ Authorization: `Bearer ${key}` })

/** Machine identifier: truncated SHA-256 of hostname */
export function getMachineId(): string {
  return crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0, 16)
}

/** Headers that identify the machine and tool for connection tracking */
function machineHeaders(toolName: string): Record<string, string> {
  return {
    'X-Piut-Hostname': os.hostname(),
    'X-Piut-Machine-Id': getMachineId(),
    'X-Piut-Tool': toolName,
  }
}

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
      project: ['.mcp.json'],
    },
    skillFilePath: 'CLAUDE.md',
    quickCommand: (slug, key) =>
      `claude mcp add-json piut-context '${JSON.stringify({
        type: 'http',
        url: MCP_URL(slug),
        headers: { ...AUTH_HEADER(key), ...machineHeaders('Claude Code') },
      })}'`,
    generateConfig: (slug, key) => ({
      type: 'http',
      url: MCP_URL(slug),
      headers: { ...AUTH_HEADER(key), ...machineHeaders('Claude Code') },
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
      headers: { ...AUTH_HEADER(key), ...machineHeaders('Cursor') },
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
      headers: { ...AUTH_HEADER(key), ...machineHeaders('Windsurf') },
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
      headers: { ...AUTH_HEADER(key), ...machineHeaders('GitHub Copilot') },
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
      headers: { ...AUTH_HEADER(key), ...machineHeaders('Amazon Q') },
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
        headers: { ...AUTH_HEADER(key), ...machineHeaders('Zed') },
      },
    }),
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    configKey: 'mcpServers',
    configPaths: {
      darwin: ['~/.gemini/settings.json'],
      win32: ['~/.gemini/settings.json'],
      linux: ['~/.gemini/settings.json'],
      project: ['.gemini/settings.json'],
    },
    generateConfig: (slug, key) => ({
      httpUrl: MCP_URL(slug),
      headers: { ...AUTH_HEADER(key), ...machineHeaders('Gemini CLI') },
    }),
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    configKey: 'mcpServers',
    configPaths: {
      darwin: ['~/.mcporter/mcporter.json', '~/.openclaw/workspace/config/mcporter.json'],
      win32: ['~/.mcporter/mcporter.json', '~/.openclaw/workspace/config/mcporter.json'],
      linux: ['~/.mcporter/mcporter.json', '~/.openclaw/workspace/config/mcporter.json'],
    },
    quickCommand: (slug, key) =>
      `npx mcporter config add piut-context ${MCP_URL(slug)} --header "Authorization=Bearer ${key}"`,
    generateConfig: (slug, key) => ({
      url: MCP_URL(slug),
      headers: { ...AUTH_HEADER(key), ...machineHeaders('OpenClaw') },
    }),
  },
  {
    id: 'paperclip',
    name: 'Paperclip',
    skillOnly: true,
    configPaths: {
      darwin: ['~/.paperclip/config.json'],
      win32: ['~/.paperclip/config.json'],
      linux: ['~/.paperclip/config.json'],
    },
  },
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find(t => t.id === id)
}
