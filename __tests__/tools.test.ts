import { describe, it, expect } from 'vitest'
import { TOOLS, getToolById } from '../src/lib/tools.js'

describe('TOOLS', () => {
  it('has 10 tool definitions', () => {
    expect(TOOLS).toHaveLength(10)
  })

  it('every tool has required fields', () => {
    for (const tool of TOOLS) {
      expect(tool.id).toBeTruthy()
      expect(tool.name).toBeTruthy()
      expect(tool.configPaths).toBeDefined()
    }
  })

  it('every MCP tool has configKey and generateConfig', () => {
    const mcpTools = TOOLS.filter(t => !t.skillOnly)
    for (const tool of mcpTools) {
      expect(tool.configKey).toBeTruthy()
      expect(typeof tool.generateConfig).toBe('function')
    }
  })

  it('every MCP tool generates valid config with slug and key', () => {
    const mcpTools = TOOLS.filter(t => !t.skillOnly)
    for (const tool of mcpTools) {
      const config = tool.generateConfig!('testuser', 'pb_testkey123')
      expect(config).toBeDefined()
      expect(typeof config).toBe('object')
    }
  })

  it('skill-only tools do not have generateConfig', () => {
    const skillOnly = TOOLS.filter(t => t.skillOnly)
    expect(skillOnly.length).toBeGreaterThan(0)
    for (const tool of skillOnly) {
      expect(tool.generateConfig).toBeUndefined()
    }
  })

  const configKeyTests: [string, string][] = [
    ['claude-code', 'mcpServers'],
    ['claude-desktop', 'mcpServers'],
    ['cursor', 'mcpServers'],
    ['windsurf', 'mcpServers'],
    ['vscode', 'servers'],
    ['amazon-q', 'mcpServers'],
    ['zed', 'context_servers'],
    ['gemini-cli', 'mcpServers'],
    ['openclaw', 'mcpServers'],
  ]

  it.each(configKeyTests)('%s uses configKey "%s"', (toolId, expectedKey) => {
    const tool = getToolById(toolId)
    expect(tool?.configKey).toBe(expectedKey)
  })
})

describe('getToolById', () => {
  it('returns the correct tool', () => {
    expect(getToolById('cursor')?.name).toBe('Cursor')
  })

  it('returns undefined for unknown id', () => {
    expect(getToolById('nonexistent')).toBeUndefined()
  })
})

describe('tool config shapes', () => {
  it('claude-code includes type: http', () => {
    const config = getToolById('claude-code')!.generateConfig!('test', 'pb_key')
    expect(config.type).toBe('http')
    expect(config.url).toContain('piut.com/api/mcp/test')
    const headers = config.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer pb_key')
    expect(headers['X-Piut-Tool']).toBe('Claude Code')
    expect(headers['X-Piut-Hostname']).toBeTruthy()
    expect(headers['X-Piut-Machine-Id']).toBeTruthy()
  })

  it('cursor omits type field', () => {
    const config = getToolById('cursor')!.generateConfig!('test', 'pb_key')
    expect(config.type).toBeUndefined()
    expect(config.url).toContain('piut.com/api/mcp/test')
  })

  it('windsurf uses serverUrl instead of url', () => {
    const config = getToolById('windsurf')!.generateConfig!('test', 'pb_key')
    expect(config.serverUrl).toContain('piut.com/api/mcp/test')
    expect(config.url).toBeUndefined()
  })

  it('claude-desktop uses mcp-remote command', () => {
    const config = getToolById('claude-desktop')!.generateConfig!('test', 'pb_key')
    expect(config.command).toBe('npx')
    expect(config.args).toContain('mcp-remote')
  })

  it('zed wraps in settings object', () => {
    const config = getToolById('zed')!.generateConfig!('test', 'pb_key')
    expect(config.settings).toBeDefined()
    const settings = config.settings as Record<string, unknown>
    expect(settings.url).toContain('piut.com/api/mcp/test')
  })

  it('gemini-cli uses httpUrl for HTTP transport', () => {
    const config = getToolById('gemini-cli')!.generateConfig!('test', 'pb_key')
    expect(config.httpUrl).toContain('piut.com/api/mcp/test')
    expect(config.url).toBeUndefined()
    const headers = config.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer pb_key')
  })

  it('openclaw uses standard url field', () => {
    const config = getToolById('openclaw')!.generateConfig!('test', 'pb_key')
    expect(config.url).toContain('piut.com/api/mcp/test')
    const headers = config.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer pb_key')
  })

  it('paperclip is skill-only', () => {
    const tool = getToolById('paperclip')
    expect(tool?.skillOnly).toBe(true)
    expect(tool?.generateConfig).toBeUndefined()
    expect(tool?.configKey).toBeUndefined()
  })
})
