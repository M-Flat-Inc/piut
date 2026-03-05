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
      darwin: ['~/Library/test.json'],
      win32: ['~/AppData/test.json'],
      linux: ['~/.config/test.json'],
    })

    // Should have at least one path for the current platform
    expect(paths.length).toBeGreaterThan(0)
    // Should be expanded (no ~)
    expect(paths[0]).not.toContain('~')
  })

  it('includes project-local paths', () => {
    const paths = resolveConfigPaths({
      project: ['.cursor/mcp.json'],
    })

    expect(paths.length).toBe(1)
    expect(paths[0]).toContain('.cursor/mcp.json')
    expect(paths[0]).not.toContain('~')
  })

  it('returns empty array for unsupported platform', () => {
    const paths = resolveConfigPaths({
      // No paths for any platform
    })
    expect(paths).toEqual([])
  })
})
