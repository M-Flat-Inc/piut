import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally before importing the module
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock confirm from @inquirer/prompts
vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

// Mock child_process.execFile
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { checkForUpdate } from '../src/lib/update-check.js'
import { confirm } from '@inquirer/prompts'
import { execFile } from 'child_process'

describe('update-check', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('does nothing when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    await checkForUpdate('3.0.0')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does nothing when registry returns non-ok', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    await checkForUpdate('3.0.0')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does nothing when already on latest', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '3.0.0' }),
    })
    await checkForUpdate('3.0.0')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('does nothing when current is newer than registry', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.9.0' }),
    })
    await checkForUpdate('3.0.0')
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('prompts when a newer version is available', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '3.1.0' }),
    })
    vi.mocked(confirm).mockResolvedValue(false)

    await checkForUpdate('3.0.0')

    expect(consoleSpy).toHaveBeenCalled()
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('Update available')
    expect(output).toContain('3.0.0')
    expect(output).toContain('3.1.0')
    expect(confirm).toHaveBeenCalled()
  })

  it('runs npm install when user accepts update', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '4.0.0' }),
    })
    vi.mocked(confirm).mockResolvedValue(true)
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as Function)(null)
      return {} as ReturnType<typeof execFile>
    })

    await checkForUpdate('3.0.0')

    expect(execFile).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '@piut/cli@latest'],
      expect.any(Object),
      expect.any(Function)
    )
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('Updated to v4.0.0')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('shows manual instructions when npm install fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '3.2.0' }),
    })
    vi.mocked(confirm).mockResolvedValue(true)
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as Function)(new Error('permission denied'))
      return {} as ReturnType<typeof execFile>
    })

    await checkForUpdate('3.0.0')

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(output).toContain('Could not auto-update')
    expect(output).toContain('npm install -g')
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('continues silently when user cancels prompt (Ctrl+C)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '5.0.0' }),
    })
    vi.mocked(confirm).mockRejectedValue(new Error('ExitPromptError'))

    await checkForUpdate('3.0.0')

    // Should not crash — just continue
    expect(exitSpy).not.toHaveBeenCalled()
  })

  describe('npx detection', () => {
    it('skips auto-update prompt when running via npx', async () => {
      const origNpmCommand = process.env.npm_command
      process.env.npm_command = 'exec'

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '4.0.0' }),
      })

      await checkForUpdate('3.0.0')

      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
      expect(output).toContain('Update available')
      expect(output).toContain('npx @piut/cli@latest')
      expect(confirm).not.toHaveBeenCalled()

      process.env.npm_command = origNpmCommand
    })

    it('shows npm install -g when not running via npx', async () => {
      const origNpmCommand = process.env.npm_command
      const origUnderscore = process.env._
      delete process.env.npm_command
      process.env._ = '/usr/local/bin/node'

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '4.0.0' }),
      })
      vi.mocked(confirm).mockResolvedValue(false)

      await checkForUpdate('3.0.0')

      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
      expect(output).toContain('npm install -g @piut/cli@latest')
      expect(confirm).toHaveBeenCalled()

      process.env.npm_command = origNpmCommand
      process.env._ = origUnderscore
    })
  })

  describe('semver comparison', () => {
    it('detects major version bump', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '4.0.0' }),
      })
      vi.mocked(confirm).mockResolvedValue(false)
      await checkForUpdate('3.0.0')
      expect(confirm).toHaveBeenCalled()
    })

    it('detects minor version bump', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '3.1.0' }),
      })
      vi.mocked(confirm).mockResolvedValue(false)
      await checkForUpdate('3.0.0')
      expect(confirm).toHaveBeenCalled()
    })

    it('detects patch version bump', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '3.0.1' }),
      })
      vi.mocked(confirm).mockResolvedValue(false)
      await checkForUpdate('3.0.0')
      expect(confirm).toHaveBeenCalled()
    })
  })
})
