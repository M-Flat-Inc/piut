import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  writePiutConfig,
  readPiutConfig,
  writePiutSkill,
  ensureGitignored,
  removePiutDir,
  hasPiutDir,
} from '../src/lib/piut-dir.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-dir-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('writePiutConfig', () => {
  it('creates .piut/ directory and writes config.json', () => {
    writePiutConfig(tmpDir, { slug: 'brian', apiKey: 'pb_test123', serverUrl: 'https://piut.com/api/mcp/brian' })

    const configPath = path.join(tmpDir, '.piut', 'config.json')
    expect(fs.existsSync(configPath)).toBe(true)

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(config.slug).toBe('brian')
    expect(config.apiKey).toBe('pb_test123')
    expect(config.serverUrl).toBe('https://piut.com/api/mcp/brian')
  })

  it('overwrites existing config on re-run', () => {
    writePiutConfig(tmpDir, { slug: 'brian', apiKey: 'pb_old', serverUrl: 'https://piut.com/api/mcp/brian' })
    writePiutConfig(tmpDir, { slug: 'brian', apiKey: 'pb_new', serverUrl: 'https://piut.com/api/mcp/brian' })

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, '.piut', 'config.json'), 'utf-8'))
    expect(config.apiKey).toBe('pb_new')
  })
})

describe('readPiutConfig', () => {
  it('returns null for missing directory', () => {
    expect(readPiutConfig(tmpDir)).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    fs.mkdirSync(path.join(tmpDir, '.piut'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.piut', 'config.json'), 'not json', 'utf-8')
    expect(readPiutConfig(tmpDir)).toBeNull()
  })

  it('returns null for missing required fields', () => {
    fs.mkdirSync(path.join(tmpDir, '.piut'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.piut', 'config.json'), '{"slug":"brian"}', 'utf-8')
    expect(readPiutConfig(tmpDir)).toBeNull()
  })

  it('returns parsed config when valid', () => {
    writePiutConfig(tmpDir, { slug: 'brian', apiKey: 'pb_test', serverUrl: 'https://piut.com/api/mcp/brian' })
    const config = readPiutConfig(tmpDir)
    expect(config).toEqual({ slug: 'brian', apiKey: 'pb_test', serverUrl: 'https://piut.com/api/mcp/brian' })
  })
})

describe('writePiutSkill', () => {
  it('replaces {{slug}} and {{key}} placeholders', async () => {
    // Mock fetch to return test skill content
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('Endpoint: https://piut.com/api/mcp/{{slug}}\nAuth: Bearer {{key}}\nSlug: {{slug}}'),
    }))

    await writePiutSkill(tmpDir, 'brian', 'pb_test123')

    const content = fs.readFileSync(path.join(tmpDir, '.piut', 'skill.md'), 'utf-8')
    expect(content).toContain('https://piut.com/api/mcp/brian')
    expect(content).toContain('Bearer pb_test123')
    expect(content).toContain('Slug: brian')
    expect(content).not.toContain('{{slug}}')
    expect(content).not.toContain('{{key}}')
  })

  it('uses fallback content when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await writePiutSkill(tmpDir, 'brian', 'pb_test123')

    const content = fs.readFileSync(path.join(tmpDir, '.piut', 'skill.md'), 'utf-8')
    expect(content).toContain('get_context')
    expect(content).toContain('update_brain')
    expect(content).not.toContain('{{slug}}')
    expect(content).not.toContain('{{key}}')
  })

  it('uses fallback content when server returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    await writePiutSkill(tmpDir, 'brian', 'pb_test123')

    const skillPath = path.join(tmpDir, '.piut', 'skill.md')
    expect(fs.existsSync(skillPath)).toBe(true)
  })
})

describe('ensureGitignored', () => {
  it('creates .gitignore if missing', () => {
    ensureGitignored(tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
    expect(content).toContain('.piut/')
    expect(content).toContain('# piut')
  })

  it('appends to existing .gitignore', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/\n', 'utf-8')

    ensureGitignored(tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
    expect(content).toContain('node_modules/')
    expect(content).toContain('.piut/')
  })

  it('does nothing if .piut/ already in .gitignore', () => {
    const original = 'node_modules/\n.piut/\n'
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), original, 'utf-8')

    ensureGitignored(tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
    expect(content).toBe(original)
  })

  it('does nothing if .piut (no trailing slash) already in .gitignore', () => {
    const original = 'node_modules/\n.piut\n'
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), original, 'utf-8')

    ensureGitignored(tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
    expect(content).toBe(original)
  })

  it('handles .gitignore without trailing newline', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules/', 'utf-8')

    ensureGitignored(tmpDir)

    const content = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8')
    expect(content).toContain('node_modules/')
    expect(content).toContain('.piut/')
  })
})

describe('removePiutDir', () => {
  it('removes existing .piut/ directory and returns true', () => {
    writePiutConfig(tmpDir, { slug: 'brian', apiKey: 'pb_test', serverUrl: 'https://piut.com/api/mcp/brian' })
    expect(fs.existsSync(path.join(tmpDir, '.piut'))).toBe(true)

    const result = removePiutDir(tmpDir)
    expect(result).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.piut'))).toBe(false)
  })

  it('returns false if .piut/ does not exist', () => {
    expect(removePiutDir(tmpDir)).toBe(false)
  })
})

describe('hasPiutDir', () => {
  it('returns true when .piut/config.json exists', () => {
    writePiutConfig(tmpDir, { slug: 'brian', apiKey: 'pb_test', serverUrl: 'https://piut.com/api/mcp/brian' })
    expect(hasPiutDir(tmpDir)).toBe(true)
  })

  it('returns false when .piut/ does not exist', () => {
    expect(hasPiutDir(tmpDir)).toBe(false)
  })

  it('returns false when .piut/ exists but config.json is missing', () => {
    fs.mkdirSync(path.join(tmpDir, '.piut'), { recursive: true })
    expect(hasPiutDir(tmpDir)).toBe(false)
  })
})
