import { describe, it, expect } from 'vitest'
import os from 'os'
import { expandPath, resolveConfigPaths } from '../src/lib/paths.js'

describe('expandPath', () => {
  it('expands ~ to home directory', () => {
    const result = expandPath('~/test/file.json')
    expect(result).toBe(`${os.homedir()}/test/file.json`)
  })

  it('does not modify paths without ~', () => {
    expect(expandPath('/absolute/path')).toBe('/absolute/path')
    expect(expandPath('relative/path')).toBe('relative/path')
  })
})

describe('resolveConfigPaths', () => {
  it('resolves platform-specific paths', () => {
    const paths = resolveConfigPaths({
      configPaths: {
        darwin: ['~/Library/test.json'],
        win32: ['~/AppData/test.json'],
        linux: ['~/.config/test.json'],
      },
      configKey: 'mcpServers',
    })

    // Should have at least one path for the current platform
    expect(paths.length).toBeGreaterThan(0)
    // Should be expanded (no ~)
    expect(paths[0].filePath).not.toContain('~')
    // Should use the tool's configKey
    expect(paths[0].configKey).toBe('mcpServers')
  })

  it('includes project-local paths', () => {
    const paths = resolveConfigPaths({
      configPaths: {
        project: ['.cursor/mcp.json'],
      },
      configKey: 'mcpServers',
    })

    expect(paths.length).toBe(1)
    expect(paths[0].filePath).toContain('.cursor/mcp.json')
    expect(paths[0].filePath).not.toContain('~')
  })

  it('returns empty array for unsupported platform', () => {
    const paths = resolveConfigPaths({
      configPaths: {},
      configKey: 'mcpServers',
    })
    expect(paths).toEqual([])
  })

  it('uses globalConfigKey for global paths when set', () => {
    const paths = resolveConfigPaths({
      configPaths: {
        darwin: ['~/Library/settings.json'],
        project: ['.vscode/mcp.json'],
      },
      configKey: 'servers',
      globalConfigKey: 'nested.servers',
    })

    // On macOS, should have 2 paths
    if (process.platform === 'darwin') {
      expect(paths.length).toBe(2)
      // Global path uses globalConfigKey
      expect(paths[0].configKey).toBe('nested.servers')
      // Project path uses regular configKey
      expect(paths[1].configKey).toBe('servers')
    }
  })
})
