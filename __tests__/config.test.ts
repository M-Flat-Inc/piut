import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readConfig, writeConfig, mergeConfig, removeFromConfig, isPiutConfigured, getPiutConfig, extractKeyFromConfig } from '../src/lib/config.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function tmpFile(name: string): string {
  return path.join(tmpDir, name)
}

describe('readConfig', () => {
  it('returns null for missing files', () => {
    expect(readConfig(tmpFile('nonexistent.json'))).toBeNull()
  })

  it('reads valid JSON', () => {
    const file = tmpFile('valid.json')
    fs.writeFileSync(file, '{"mcpServers": {"test": {"url": "http://example.com"}}}')
    const result = readConfig(file)
    expect(result).toEqual({ mcpServers: { test: { url: 'http://example.com' } } })
  })

  it('strips JS-style comments', () => {
    const file = tmpFile('comments.json')
    fs.writeFileSync(file, '{\n  // this is a comment\n  "key": "value"\n}')
    const result = readConfig(file)
    expect(result).toEqual({ key: 'value' })
  })

  it('returns null for unparseable JSON', () => {
    const file = tmpFile('bad.json')
    fs.writeFileSync(file, 'not json at all {{{')
    expect(readConfig(file)).toBeNull()
  })

  it('returns null for JSON with control characters', () => {
    const file = tmpFile('control.json')
    fs.writeFileSync(file, '{"key": "value\nwith\nnewlines"}')
    expect(readConfig(file)).toBeNull()
  })
})

describe('writeConfig', () => {
  it('writes formatted JSON', () => {
    const file = tmpFile('output.json')
    writeConfig(file, { key: 'value' })
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).toBe('{\n  "key": "value"\n}\n')
  })

  it('creates parent directories', () => {
    const file = path.join(tmpDir, 'deep', 'nested', 'config.json')
    writeConfig(file, { ok: true })
    expect(fs.existsSync(file)).toBe(true)
  })
})

describe('isPiutConfigured', () => {
  it('returns false for missing files', () => {
    expect(isPiutConfigured(tmpFile('missing.json'), 'mcpServers')).toBe(false)
  })

  it('returns false when piut-context is not present', () => {
    const file = tmpFile('nopiut.json')
    writeConfig(file, { mcpServers: { other: { url: 'http://example.com' } } })
    expect(isPiutConfigured(file, 'mcpServers')).toBe(false)
  })

  it('returns true when piut-context is present', () => {
    const file = tmpFile('haspiut.json')
    writeConfig(file, { mcpServers: { 'piut-context': { url: 'http://example.com' } } })
    expect(isPiutConfigured(file, 'mcpServers')).toBe(true)
  })

  it('handles different config keys', () => {
    const file = tmpFile('servers.json')
    writeConfig(file, { servers: { 'piut-context': { url: 'http://example.com' } } })
    expect(isPiutConfigured(file, 'servers')).toBe(true)
    expect(isPiutConfigured(file, 'mcpServers')).toBe(false)
  })
})

describe('mergeConfig', () => {
  it('creates a new config file if none exists', () => {
    const file = tmpFile('new.json')
    mergeConfig(file, 'mcpServers', { url: 'http://piut.com' })
    const result = readConfig(file)
    expect(result).toEqual({ mcpServers: { 'piut-context': { url: 'http://piut.com' } } })
  })

  it('merges into existing config without overwriting other servers', () => {
    const file = tmpFile('existing.json')
    writeConfig(file, {
      mcpServers: {
        other: { url: 'http://other.com' },
      },
    })

    mergeConfig(file, 'mcpServers', { url: 'http://piut.com' })
    const result = readConfig(file)
    expect(result).toEqual({
      mcpServers: {
        other: { url: 'http://other.com' },
        'piut-context': { url: 'http://piut.com' },
      },
    })
  })

  it('updates existing piut-context entry', () => {
    const file = tmpFile('update.json')
    writeConfig(file, {
      mcpServers: {
        'piut-context': { url: 'http://old.com' },
      },
    })

    mergeConfig(file, 'mcpServers', { url: 'http://new.com' })
    const result = readConfig(file)
    expect(result).toEqual({
      mcpServers: {
        'piut-context': { url: 'http://new.com' },
      },
    })
  })

  it('preserves non-server keys in the file', () => {
    const file = tmpFile('preserve.json')
    writeConfig(file, {
      someOtherSetting: true,
      mcpServers: {},
    })

    mergeConfig(file, 'mcpServers', { url: 'http://piut.com' })
    const result = readConfig(file)
    expect(result?.someOtherSetting).toBe(true)
  })
})

describe('getPiutConfig', () => {
  it('returns null for missing files', () => {
    expect(getPiutConfig(tmpFile('missing.json'), 'mcpServers')).toBeNull()
  })

  it('returns null when piut-context is not present', () => {
    const file = tmpFile('nopiut.json')
    writeConfig(file, { mcpServers: { other: { url: 'http://example.com' } } })
    expect(getPiutConfig(file, 'mcpServers')).toBeNull()
  })

  it('extracts piut-context config object', () => {
    const file = tmpFile('haspiut.json')
    const piutConfig = { type: 'http', url: 'https://piut.com/api/mcp/test', headers: { Authorization: 'Bearer pb_abc123' } }
    writeConfig(file, { mcpServers: { 'piut-context': piutConfig, other: { url: 'http://other.com' } } })
    expect(getPiutConfig(file, 'mcpServers')).toEqual(piutConfig)
  })

  it('works with servers key (GitHub Copilot)', () => {
    const file = tmpFile('copilot.json')
    const piutConfig = { type: 'http', url: 'https://piut.com/api/mcp/test' }
    writeConfig(file, { servers: { 'piut-context': piutConfig } })
    expect(getPiutConfig(file, 'servers')).toEqual(piutConfig)
  })

  it('works with context_servers key (Zed)', () => {
    const file = tmpFile('zed.json')
    const piutConfig = { settings: { url: 'https://piut.com/api/mcp/test', headers: { Authorization: 'Bearer pb_xyz' } } }
    writeConfig(file, { context_servers: { 'piut-context': piutConfig } })
    expect(getPiutConfig(file, 'context_servers')).toEqual(piutConfig)
  })
})

describe('extractKeyFromConfig', () => {
  it('extracts key from standard headers (Claude Code, Cursor, Amazon Q)', () => {
    const config = { type: 'http', url: 'https://piut.com/api/mcp/test', headers: { Authorization: 'Bearer pb_abc123def456' } }
    expect(extractKeyFromConfig(config)).toBe('pb_abc123def456')
  })

  it('extracts key from Windsurf format (serverUrl)', () => {
    const config = { serverUrl: 'https://piut.com/api/mcp/test', headers: { Authorization: 'Bearer pb_wind123' } }
    expect(extractKeyFromConfig(config)).toBe('pb_wind123')
  })

  it('extracts key from Zed format (settings.headers)', () => {
    const config = { settings: { url: 'https://piut.com/api/mcp/test', headers: { Authorization: 'Bearer pb_zed456' } } }
    expect(extractKeyFromConfig(config)).toBe('pb_zed456')
  })

  it('extracts key from Claude Desktop format (args array)', () => {
    const config = { command: 'npx', args: ['-y', 'mcp-remote', 'https://piut.com/api/mcp/test', '--header', 'Authorization: Bearer pb_desktop789'] }
    expect(extractKeyFromConfig(config)).toBe('pb_desktop789')
  })

  it('returns null when no key found', () => {
    expect(extractKeyFromConfig({ url: 'https://piut.com' })).toBeNull()
  })

  it('returns null for empty config', () => {
    expect(extractKeyFromConfig({})).toBeNull()
  })

  it('returns null for non-pb_ bearer tokens', () => {
    const config = { headers: { Authorization: 'Bearer sk_other_key' } }
    expect(extractKeyFromConfig(config)).toBeNull()
  })
})

describe('nested key paths (VS Code settings.json)', () => {
  it('isPiutConfigured works with dot-separated key path', () => {
    const file = tmpFile('settings.json')
    writeConfig(file, {
      'editor.fontSize': 14,
      mcp: {
        servers: {
          'piut-context': { type: 'http', url: 'https://piut.com/api/mcp/test' },
        },
      },
    })
    expect(isPiutConfigured(file, 'mcp.servers')).toBe(true)
    expect(isPiutConfigured(file, 'servers')).toBe(false)
  })

  it('getPiutConfig works with dot-separated key path', () => {
    const file = tmpFile('settings.json')
    const piutConfig = { type: 'http', url: 'https://piut.com/api/mcp/test' }
    writeConfig(file, {
      mcp: { servers: { 'piut-context': piutConfig } },
    })
    expect(getPiutConfig(file, 'mcp.servers')).toEqual(piutConfig)
  })

  it('mergeConfig creates nested structure from dot-separated key', () => {
    const file = tmpFile('settings.json')
    writeConfig(file, { 'editor.fontSize': 14 })
    mergeConfig(file, 'mcp.servers', { type: 'http', url: 'https://piut.com/api/mcp/test' })
    const result = readConfig(file)
    expect(result).toEqual({
      'editor.fontSize': 14,
      mcp: {
        servers: {
          'piut-context': { type: 'http', url: 'https://piut.com/api/mcp/test' },
        },
      },
    })
  })

  it('mergeConfig preserves existing servers in nested structure', () => {
    const file = tmpFile('settings.json')
    writeConfig(file, {
      mcp: {
        servers: {
          'other-server': { type: 'http', url: 'https://other.com' },
        },
      },
    })
    mergeConfig(file, 'mcp.servers', { type: 'http', url: 'https://piut.com/api/mcp/test' })
    const result = readConfig(file)
    expect(result?.mcp).toEqual({
      servers: {
        'other-server': { type: 'http', url: 'https://other.com' },
        'piut-context': { type: 'http', url: 'https://piut.com/api/mcp/test' },
      },
    })
  })

  it('removeFromConfig works with dot-separated key path', () => {
    const file = tmpFile('settings.json')
    writeConfig(file, {
      'editor.fontSize': 14,
      mcp: {
        servers: {
          'piut-context': { type: 'http', url: 'https://piut.com/api/mcp/test' },
          'other-server': { type: 'http', url: 'https://other.com' },
        },
      },
    })
    expect(removeFromConfig(file, 'mcp.servers')).toBe(true)
    const result = readConfig(file)
    // Other settings preserved, piut-context removed, other-server kept
    expect(result?.['editor.fontSize']).toBe(14)
    expect((result?.mcp as Record<string, unknown>)?.servers).toEqual({
      'other-server': { type: 'http', url: 'https://other.com' },
    })
  })
})

describe('removeFromConfig', () => {
  it('returns false for missing files', () => {
    expect(removeFromConfig(tmpFile('missing.json'), 'mcpServers')).toBe(false)
  })

  it('returns false when piut-context is not configured', () => {
    const file = tmpFile('nopiut.json')
    writeConfig(file, { mcpServers: { other: { url: 'http://other.com' } } })
    expect(removeFromConfig(file, 'mcpServers')).toBe(false)
  })

  it('removes piut-context and preserves other servers', () => {
    const file = tmpFile('remove.json')
    writeConfig(file, {
      mcpServers: {
        other: { url: 'http://other.com' },
        'piut-context': { url: 'http://piut.com' },
      },
    })

    expect(removeFromConfig(file, 'mcpServers')).toBe(true)
    const result = readConfig(file)
    expect(result).toEqual({
      mcpServers: {
        other: { url: 'http://other.com' },
      },
    })
  })

  it('removes empty configKey after removing last server', () => {
    const file = tmpFile('lastserver.json')
    writeConfig(file, {
      mcpServers: {
        'piut-context': { url: 'http://piut.com' },
      },
    })

    expect(removeFromConfig(file, 'mcpServers')).toBe(true)
    const result = readConfig(file)
    expect(result).toEqual({})
  })
})
