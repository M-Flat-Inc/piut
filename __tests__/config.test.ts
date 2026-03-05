import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readConfig, writeConfig, mergeConfig, removeFromConfig, isPiutConfigured } from '../src/lib/config.js'

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
