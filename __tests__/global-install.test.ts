import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

// Mock store
vi.mock('../src/lib/store.js', () => ({
  readStore: vi.fn(() => ({})),
  updateStore: vi.fn(),
}))

import { execSync } from 'child_process'
import { readStore, updateStore } from '../src/lib/store.js'
import { offerGlobalInstall } from '../src/lib/global-install.js'

const mockExecSync = vi.mocked(execSync)
const mockReadStore = vi.mocked(readStore)
const mockUpdateStore = vi.mocked(updateStore)

beforeEach(() => {
  vi.clearAllMocks()
  // Default: piut not in PATH (which throws)
  mockExecSync.mockImplementation((cmd: string) => {
    if (typeof cmd === 'string' && (cmd.includes('which piut') || cmd.includes('where piut'))) {
      throw new Error('not found')
    }
    // npm install -g succeeds by default
    return Buffer.from('')
  })
  mockReadStore.mockReturnValue({})
  mockUpdateStore.mockReturnValue({})
})

describe('offerGlobalInstall', () => {
  it('does nothing if piut is already in PATH', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && (cmd.includes('which piut') || cmd.includes('where piut'))) {
        return Buffer.from('/usr/local/bin/piut')
      }
      return Buffer.from('')
    })

    await offerGlobalInstall()

    expect(mockUpdateStore).not.toHaveBeenCalled()
  })

  it('does nothing if already offered in a previous session', async () => {
    mockReadStore.mockReturnValue({ globalInstallOffered: true })

    await offerGlobalInstall()

    // Should not attempt npm install
    expect(mockExecSync).toHaveBeenCalledTimes(1) // only the `which piut` check
  })

  it('marks as offered after first attempt', async () => {
    let installCalled = false
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm install -g @piut/cli')) {
        installCalled = true
        return Buffer.from('')
      }
      if (typeof cmd === 'string' && (cmd.includes('which piut') || cmd.includes('where piut'))) {
        if (installCalled) return Buffer.from('/usr/local/bin/piut')
        throw new Error('not found')
      }
      return Buffer.from('')
    })

    await offerGlobalInstall()

    expect(mockUpdateStore).toHaveBeenCalledWith({ globalInstallOffered: true })
  })

  it('installs automatically via npm install -g with no prompt', async () => {
    let installCalled = false
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm install -g @piut/cli')) {
        installCalled = true
        return Buffer.from('')
      }
      if (typeof cmd === 'string' && (cmd.includes('which piut') || cmd.includes('where piut'))) {
        if (installCalled) return Buffer.from('/usr/local/bin/piut')
        throw new Error('not found')
      }
      return Buffer.from('')
    })

    await offerGlobalInstall()

    expect(installCalled).toBe(true)
  })

  it('falls back to shell alias when npm install fails', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm install -g')) {
        throw new Error('EACCES')
      }
      if (typeof cmd === 'string' && (cmd.includes('which piut') || cmd.includes('where piut'))) {
        throw new Error('not found')
      }
      return Buffer.from('')
    })

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-shell-'))
    const zshrc = path.join(tmpDir, '.zshrc')
    fs.writeFileSync(zshrc, '# existing config\n')

    const origShell = process.env.SHELL
    const origHome = os.homedir
    process.env.SHELL = '/bin/zsh'
    // @ts-expect-error — override for test
    os.homedir = () => tmpDir

    try {
      await offerGlobalInstall()

      const content = fs.readFileSync(zshrc, 'utf-8')
      expect(content).toContain('alias piut="npx @piut/cli"')
    } finally {
      process.env.SHELL = origShell
      // @ts-expect-error — restore
      os.homedir = origHome
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('does not duplicate alias if already present', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm install -g')) {
        throw new Error('EACCES')
      }
      if (typeof cmd === 'string' && (cmd.includes('which piut') || cmd.includes('where piut'))) {
        throw new Error('not found')
      }
      return Buffer.from('')
    })

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-shell-'))
    const zshrc = path.join(tmpDir, '.zshrc')
    fs.writeFileSync(zshrc, '# existing\nalias piut="npx @piut/cli"\n')

    const origShell = process.env.SHELL
    const origHome = os.homedir
    process.env.SHELL = '/bin/zsh'
    // @ts-expect-error — override for test
    os.homedir = () => tmpDir

    try {
      await offerGlobalInstall()

      const content = fs.readFileSync(zshrc, 'utf-8')
      const matches = content.match(/alias piut=/g)
      expect(matches).toHaveLength(1)
    } finally {
      process.env.SHELL = origShell
      // @ts-expect-error — restore
      os.homedir = origHome
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('skips silently when both npm install and alias fail', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm install -g')) {
        throw new Error('EACCES')
      }
      if (typeof cmd === 'string' && (cmd.includes('which piut') || cmd.includes('where piut'))) {
        throw new Error('not found')
      }
      return Buffer.from('')
    })

    // No SHELL env = can't detect profile
    const origShell = process.env.SHELL
    delete process.env.SHELL

    try {
      // Should not throw
      await offerGlobalInstall()
      expect(mockUpdateStore).toHaveBeenCalledWith({ globalInstallOffered: true })
    } finally {
      process.env.SHELL = origShell
    }
  })

  it('detects bash profile on macOS', async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm install -g')) {
        throw new Error('EACCES')
      }
      if (typeof cmd === 'string' && (cmd.includes('which piut') || cmd.includes('where piut'))) {
        throw new Error('not found')
      }
      return Buffer.from('')
    })

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-shell-'))
    const bashProfile = path.join(tmpDir, '.bash_profile')
    fs.writeFileSync(bashProfile, '# existing\n')

    const origShell = process.env.SHELL
    const origHome = os.homedir
    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    process.env.SHELL = '/bin/bash'
    // @ts-expect-error — override for test
    os.homedir = () => tmpDir
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    try {
      await offerGlobalInstall()

      const content = fs.readFileSync(bashProfile, 'utf-8')
      expect(content).toContain('alias piut="npx @piut/cli"')
    } finally {
      process.env.SHELL = origShell
      // @ts-expect-error — restore
      os.homedir = origHome
      if (origPlatform) Object.defineProperty(process, 'platform', origPlatform)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
