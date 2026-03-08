import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { syncStaleConfigs, getConfiguredToolNames, cycleProjectConfigs } from '../src/lib/sync.js'
import { writeConfig, readConfig, getPiutConfig, extractKeyFromConfig, extractSlugFromConfig } from '../src/lib/config.js'

let tmpDir: string
let originalCwd: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-sync-test-'))
  originalCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// Mock resolveConfigPaths to use tmp directory instead of real home paths
vi.mock('../src/lib/paths.js', () => ({
  expandPath: (p: string) => p.replace(/^~/, os.homedir()),
  resolveConfigPaths: (tool: { configPaths: Record<string, string[]>; configKey?: string; globalConfigKey?: string }) => {
    // Return paths relative to the test tmp directory
    const cwd = process.cwd()
    const configKey = tool.configKey || ''
    const paths: Array<{ filePath: string; configKey: string }> = []

    // Use project paths as our test paths
    const projectPaths = tool.configPaths.project || []
    for (const p of projectPaths) {
      paths.push({ filePath: path.resolve(cwd, p), configKey })
    }

    // Also check platform paths, but remap ~ to tmpDir
    const platformKey = process.platform as 'darwin' | 'win32' | 'linux'
    const globalPaths = tool.configPaths[platformKey] || []
    for (const p of globalPaths) {
      paths.push({
        filePath: path.resolve(cwd, 'fakehome', p.replace('~/', '')),
        configKey: tool.globalConfigKey || configKey,
      })
    }

    return paths
  },
}))

function writeToolConfig(relativePath: string, configKey: string, slug: string, apiKey: string): string {
  const filePath = path.resolve(tmpDir, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const config: Record<string, unknown> = {}
  config[configKey] = {
    'piut-context': {
      type: 'http',
      url: `https://piut.com/api/mcp/${slug}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Piut-Hostname': 'test-host',
        'X-Piut-Machine-Id': 'test-machine-id',
        'X-Piut-Tool': 'Test',
      },
    },
  }
  writeConfig(filePath, config)
  return filePath
}

describe('syncStaleConfigs', () => {
  it('returns empty array when no configs exist', () => {
    const result = syncStaleConfigs('myslug', 'pb_newkey', 'https://piut.com/api/mcp/myslug')
    expect(result).toEqual([])
  })

  it('does not update configs that already match', () => {
    // Create a Claude Code project config that matches
    writeToolConfig('.mcp.json', 'mcpServers', 'myslug', 'pb_currentkey')

    const result = syncStaleConfigs('myslug', 'pb_currentkey', 'https://piut.com/api/mcp/myslug')
    expect(result).toEqual([])
  })

  it('updates tool config with stale API key', () => {
    const configPath = writeToolConfig('.mcp.json', 'mcpServers', 'myslug', 'pb_oldkey')

    const result = syncStaleConfigs('myslug', 'pb_newkey', 'https://piut.com/api/mcp/myslug')
    expect(result).toContain('Claude Code')

    // Verify the config was actually updated
    const piutConfig = getPiutConfig(configPath, 'mcpServers')
    expect(piutConfig).not.toBeNull()
    const newKey = extractKeyFromConfig(piutConfig!)
    expect(newKey).toBe('pb_newkey')
  })

  it('updates tool config with stale slug', () => {
    const configPath = writeToolConfig('.mcp.json', 'mcpServers', 'oldslug', 'pb_currentkey')

    const result = syncStaleConfigs('newslug', 'pb_currentkey', 'https://piut.com/api/mcp/newslug')
    expect(result).toContain('Claude Code')

    // Verify the URL was updated
    const piutConfig = getPiutConfig(configPath, 'mcpServers')
    const slug = extractSlugFromConfig(piutConfig!)
    expect(slug).toBe('newslug')
  })

  it('updates tool config when both key and slug are stale', () => {
    const configPath = writeToolConfig('.mcp.json', 'mcpServers', 'oldslug', 'pb_oldkey')

    const result = syncStaleConfigs('newslug', 'pb_newkey', 'https://piut.com/api/mcp/newslug')
    expect(result).toContain('Claude Code')

    const piutConfig = getPiutConfig(configPath, 'mcpServers')
    expect(extractKeyFromConfig(piutConfig!)).toBe('pb_newkey')
    expect(extractSlugFromConfig(piutConfig!)).toBe('newslug')
  })

  it('preserves other servers when updating stale config', () => {
    const configPath = path.resolve(tmpDir, '.mcp.json')
    writeConfig(configPath, {
      mcpServers: {
        'other-server': { type: 'http', url: 'https://other.com/mcp' },
        'piut-context': {
          type: 'http',
          url: 'https://piut.com/api/mcp/oldslug',
          headers: { Authorization: 'Bearer pb_oldkey' },
        },
      },
    })

    syncStaleConfigs('newslug', 'pb_newkey', 'https://piut.com/api/mcp/newslug')

    const config = readConfig(configPath)
    const servers = config?.mcpServers as Record<string, unknown>
    expect(servers['other-server']).toEqual({ type: 'http', url: 'https://other.com/mcp' })
    // Legacy key should be migrated to new key
    expect(servers['piut']).toBeDefined()
    expect(servers['piut-context']).toBeUndefined()
  })

  it('updates .piut/config.json in current directory when stale', () => {
    // Create a .piut/config.json with old credentials
    const piutDir = path.join(tmpDir, '.piut')
    fs.mkdirSync(piutDir, { recursive: true })
    fs.writeFileSync(
      path.join(piutDir, 'config.json'),
      JSON.stringify({ slug: 'oldslug', apiKey: 'pb_oldkey', serverUrl: 'https://piut.com/api/mcp/oldslug' }),
    )

    const result = syncStaleConfigs('newslug', 'pb_newkey', 'https://piut.com/api/mcp/newslug')
    expect(result).toContain('.piut/config.json')

    // Verify it was updated
    const updated = JSON.parse(fs.readFileSync(path.join(piutDir, 'config.json'), 'utf-8'))
    expect(updated.slug).toBe('newslug')
    expect(updated.apiKey).toBe('pb_newkey')
    expect(updated.serverUrl).toBe('https://piut.com/api/mcp/newslug')
  })

  it('does not update .piut/config.json when it matches', () => {
    const piutDir = path.join(tmpDir, '.piut')
    fs.mkdirSync(piutDir, { recursive: true })
    fs.writeFileSync(
      path.join(piutDir, 'config.json'),
      JSON.stringify({ slug: 'myslug', apiKey: 'pb_mykey', serverUrl: 'https://piut.com/api/mcp/myslug' }),
    )

    const result = syncStaleConfigs('myslug', 'pb_mykey', 'https://piut.com/api/mcp/myslug')
    expect(result).toEqual([])
  })

  it('skips tools without piut configured', () => {
    // Create a config file without piut
    const configPath = path.resolve(tmpDir, '.mcp.json')
    writeConfig(configPath, {
      mcpServers: {
        'other-server': { type: 'http', url: 'https://other.com' },
      },
    })

    const result = syncStaleConfigs('myslug', 'pb_newkey', 'https://piut.com/api/mcp/myslug')
    expect(result).toEqual([])
  })

  it('handles Cursor project-local config', () => {
    // Create a Cursor project-local config with stale key
    const cursorDir = path.join(tmpDir, '.cursor')
    fs.mkdirSync(cursorDir, { recursive: true })
    const configPath = path.join(cursorDir, 'mcp.json')
    writeConfig(configPath, {
      mcpServers: {
        'piut-context': {
          url: 'https://piut.com/api/mcp/oldslug',
          headers: { Authorization: 'Bearer pb_oldkey' },
        },
      },
    })

    const result = syncStaleConfigs('newslug', 'pb_newkey', 'https://piut.com/api/mcp/newslug')
    expect(result).toContain('Cursor')

    const piutConfig = getPiutConfig(configPath, 'mcpServers')
    expect(extractKeyFromConfig(piutConfig!)).toBe('pb_newkey')
    expect(extractSlugFromConfig(piutConfig!)).toBe('newslug')
  })

  it('updates multiple stale configs at once', () => {
    // Stale Claude Code config
    writeToolConfig('.mcp.json', 'mcpServers', 'oldslug', 'pb_oldkey')
    // Stale Cursor config
    const cursorDir = path.join(tmpDir, '.cursor')
    fs.mkdirSync(cursorDir, { recursive: true })
    writeConfig(path.join(cursorDir, 'mcp.json'), {
      mcpServers: {
        'piut-context': {
          url: 'https://piut.com/api/mcp/oldslug',
          headers: { Authorization: 'Bearer pb_oldkey' },
        },
      },
    })
    // Stale .piut/config.json
    const piutDir = path.join(tmpDir, '.piut')
    fs.mkdirSync(piutDir, { recursive: true })
    fs.writeFileSync(
      path.join(piutDir, 'config.json'),
      JSON.stringify({ slug: 'oldslug', apiKey: 'pb_oldkey', serverUrl: 'https://piut.com/api/mcp/oldslug' }),
    )

    const result = syncStaleConfigs('newslug', 'pb_newkey', 'https://piut.com/api/mcp/newslug')
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result).toContain('.piut/config.json')
  })
})

describe('getConfiguredToolNames', () => {
  it('returns empty array when no tools configured', () => {
    const result = getConfiguredToolNames()
    expect(result).toEqual([])
  })

  it('returns tool names when configured', () => {
    writeToolConfig('.mcp.json', 'mcpServers', 'myslug', 'pb_key')
    const result = getConfiguredToolNames()
    expect(result).toContain('Claude Code')
  })

  it('returns multiple tools when configured', () => {
    writeToolConfig('.mcp.json', 'mcpServers', 'myslug', 'pb_key')
    const cursorDir = path.join(tmpDir, '.cursor')
    fs.mkdirSync(cursorDir, { recursive: true })
    writeConfig(path.join(cursorDir, 'mcp.json'), {
      mcpServers: {
        piut: {
          url: 'https://piut.com/api/mcp/myslug',
          headers: { Authorization: 'Bearer pb_key' },
        },
      },
    })
    const result = getConfiguredToolNames()
    expect(result).toContain('Claude Code')
    expect(result).toContain('Cursor')
  })
})

// Mock scanForProjects and writePiutSkill for cycleProjectConfigs tests
vi.mock('../src/lib/brain-scanner.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>
  return {
    ...original,
    scanForProjects: vi.fn(() => []),
  }
})

vi.mock('../src/lib/piut-dir.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>
  return {
    ...original,
    writePiutSkill: vi.fn(async () => {}),
  }
})

describe('cycleProjectConfigs', () => {
  it('returns empty array when no connected projects', async () => {
    const { scanForProjects } = await import('../src/lib/brain-scanner.js')
    vi.mocked(scanForProjects).mockReturnValue([])

    const result = await cycleProjectConfigs('myslug', 'pb_key', 'https://piut.com/api/mcp/myslug')
    expect(result).toEqual([])
  })

  it('refreshes projects that have .piut/config.json', async () => {
    // Create a fake project with .piut dir
    const projectDir = path.join(tmpDir, 'my-project')
    fs.mkdirSync(path.join(projectDir, '.piut'), { recursive: true })
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, '.piut', 'config.json'),
      JSON.stringify({ slug: 'oldslug', apiKey: 'pb_old', serverUrl: 'https://piut.com/api/mcp/oldslug' }),
    )

    const { scanForProjects } = await import('../src/lib/brain-scanner.js')
    vi.mocked(scanForProjects).mockReturnValue([{
      name: 'my-project',
      path: projectDir,
      description: '',
      hasClaudeMd: false,
      hasCursorRules: false,
      hasWindsurfRules: false,
      hasCopilotInstructions: false,
      hasConventionsMd: false,
      hasZedRules: false,
    }])

    const result = await cycleProjectConfigs('newslug', 'pb_new', 'https://piut.com/api/mcp/newslug')
    expect(result).toContain('my-project')

    // Verify config.json was updated
    const updated = JSON.parse(fs.readFileSync(path.join(projectDir, '.piut', 'config.json'), 'utf-8'))
    expect(updated.slug).toBe('newslug')
    expect(updated.apiKey).toBe('pb_new')
  })

  it('skips projects without .piut dir', async () => {
    const projectDir = path.join(tmpDir, 'no-piut-project')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })

    const { scanForProjects } = await import('../src/lib/brain-scanner.js')
    vi.mocked(scanForProjects).mockReturnValue([{
      name: 'no-piut-project',
      path: projectDir,
      description: '',
      hasClaudeMd: false,
      hasCursorRules: false,
      hasWindsurfRules: false,
      hasCopilotInstructions: false,
      hasConventionsMd: false,
      hasZedRules: false,
    }])

    const result = await cycleProjectConfigs('myslug', 'pb_key', 'https://piut.com/api/mcp/myslug')
    expect(result).toEqual([])
  })
})
