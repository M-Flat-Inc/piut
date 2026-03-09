import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock modules before importing
vi.mock('fs')
vi.mock('child_process')
vi.mock('@inquirer/prompts')
vi.mock('../src/lib/api.js', () => ({
  pingMcp: vi.fn().mockResolvedValue(undefined),
}))

import fs from 'fs'
import { execSync } from 'child_process'
import { confirm } from '@inquirer/prompts'
import { detectTools, connectAll } from '../src/lib/discovery.js'

const mockFs = vi.mocked(fs)
const mockExecSync = vi.mocked(execSync)
const mockConfirm = vi.mocked(confirm)

describe('detectTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFs.existsSync.mockReturnValue(false)
  })

  it('detects tools when config file exists', () => {
    mockFs.existsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.claude.json')
    })

    const detected = detectTools()
    expect(detected.length).toBeGreaterThan(0)
    expect(detected[0].tool.id).toBe('claude-code')
    expect(detected[0].exists).toBe(true)
  })

  it('detects tools when parent directory exists', () => {
    mockFs.existsSync.mockImplementation((p: unknown) => {
      const s = String(p)
      // Parent dir exists but not the file itself
      return s.endsWith('.cursor') || s.endsWith('.codeium/windsurf')
    })

    const detected = detectTools()
    expect(detected.length).toBeGreaterThan(0)
  })

  it('returns empty array when no tools found', () => {
    mockFs.existsSync.mockReturnValue(false)
    const detected = detectTools()
    expect(detected).toEqual([])
  })

  it('marks already configured tools', () => {
    mockFs.existsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.claude.json')
    })
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      mcpServers: { piut: { url: 'https://piut.com/api/mcp/test' } }
    }))

    const detected = detectTools()
    expect(detected[0].alreadyConfigured).toBe(true)
  })

  it('skips skill-only tools in MCP detection', () => {
    mockFs.existsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.paperclip')
    })

    const detected = detectTools()
    const paperclip = detected.find(d => d.tool.id === 'paperclip')
    expect(paperclip?.tool.skillOnly).toBe(true)
  })
})

describe('connectAll', () => {
  const mockValidation = {
    slug: 'test-user',
    displayName: 'Test User',
    serverUrl: 'https://piut.com/api/mcp/test-user',
    planType: 'pro',
    status: 'active' as const,
    _contractVersion: '2.0.0',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFs.existsSync.mockReturnValue(false)
    mockFs.readFileSync.mockReturnValue('{}')
    mockFs.writeFileSync.mockReturnValue(undefined)
    mockFs.mkdirSync.mockReturnValue(undefined)
  })

  it('returns 0 connected when no tools detected', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const result = await connectAll('test-user', 'pb_test', mockValidation, { nonInteractive: true })
    expect(result.connected).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('connects all unconfigured tools in non-interactive mode', async () => {
    mockFs.existsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.claude.json')
    })
    mockFs.readFileSync.mockReturnValue('{}')
    mockExecSync.mockReturnValue(Buffer.from(''))

    const result = await connectAll('test-user', 'pb_test', mockValidation, { nonInteractive: true })
    expect(result.connected).toBeGreaterThan(0)
  })

  it('skips when user declines', async () => {
    mockFs.existsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.claude.json')
    })
    mockFs.readFileSync.mockReturnValue('{}')
    mockConfirm.mockResolvedValue(false)

    const result = await connectAll('test-user', 'pb_test', mockValidation)
    expect(result.connected).toBe(0)
  })

  it('reports all-connected when tools already configured', async () => {
    mockFs.existsSync.mockImplementation((p: unknown) => {
      return String(p).includes('.claude.json')
    })
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      mcpServers: { piut: { url: 'https://piut.com/api/mcp/test-user' } }
    }))

    const result = await connectAll('test-user', 'pb_test', mockValidation, { nonInteractive: true })
    expect(result.connected).toBe(0)
    expect(result.skipped).toBeGreaterThan(0)
  })
})
