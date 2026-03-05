import { describe, it, expect } from 'vitest'
import { TOOLS, getToolById } from '../src/lib/tools.js'

describe('TOOLS', () => {
  it('has 7 tool definitions', () => {
    expect(TOOLS).toHaveLength(7)
  })

  it('every tool has required fields', () => {
    for (const tool of TOOLS) {
      expect(tool.id).toBeTruthy()
      expect(tool.name).toBeTruthy()
      expect(tool.configKey).toBeTruthy()
      expect(tool.configPaths).toBeDefined()
      expect(typeof tool.generateConfig).toBe('function')
    }
  })

  it('every tool generates valid config with slug and key', () => {
    for (const tool of TOOLS) {
      const config = tool.generateConfig('testuser', 'pb_testkey123')
      expect(config).toBeDefined()
      expect(typeof config).toBe('object')
    }
  })

  const configKeyTests: [string, string][] = [
    ['claude-code', 'mcpServers'],
    ['claude-desktop', 'mcpServers'],
    ['cursor', 'mcpServers'],
    ['windsurf', 'mcpServers'],
    ['copilot', 'servers'],
    ['amazon-q', 'mcpServers'],
    ['zed', 'context_servers'],
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
    const config = getToolById('claude-code')!.generateConfig('test', 'pb_key')
    expect(config.type).toBe('http')
    expect(config.url).toContain('piut.com/api/mcp/test')
    expect(config.headers).toEqual({ Authorization: 'Bearer pb_key' })
  })

  it('cursor omits type field', () => {
    const config = getToolById('cursor')!.generateConfig('test', 'pb_key')
    expect(config.type).toBeUndefined()
    expect(config.url).toContain('piut.com/api/mcp/test')
  })

  it('windsurf uses serverUrl instead of url', () => {
    const config = getToolById('windsurf')!.generateConfig('test', 'pb_key')
    expect(config.serverUrl).toContain('piut.com/api/mcp/test')
    expect(config.url).toBeUndefined()
  })

  it('claude-desktop uses mcp-remote command', () => {
    const config = getToolById('claude-desktop')!.generateConfig('test', 'pb_key')
    expect(config.command).toBe('npx')
    expect(config.args).toContain('mcp-remote')
  })

  it('zed wraps in settings object', () => {
    const config = getToolById('zed')!.generateConfig('test', 'pb_key')
    expect(config.settings).toBeDefined()
    const settings = config.settings as Record<string, unknown>
    expect(settings.url).toContain('piut.com/api/mcp/test')
  })
})
