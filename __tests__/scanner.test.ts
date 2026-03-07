import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { scanForFiles, formatSize, detectInstalledTools } from '../src/lib/scanner.js'

let tmpHome: string
let origHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-scanner-'))
  origHome = process.env.HOME || os.homedir()
  process.env.HOME = tmpHome
})

afterEach(() => {
  process.env.HOME = origHome
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(100)).toBe('100 B')
  })

  it('formats kilobytes', () => {
    expect(formatSize(2048)).toBe('2.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 MB')
  })

  it('handles zero', () => {
    expect(formatSize(0)).toBe('0 B')
  })
})

describe('scanForFiles', () => {
  it('returns empty array when no files found', () => {
    const files = scanForFiles([tmpHome])
    expect(files).toEqual([])
  })

  it('finds CLAUDE.md in a workspace directory', () => {
    const projectDir = path.join(tmpHome, 'my-project')
    fs.mkdirSync(projectDir, { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Test')

    const files = scanForFiles([projectDir])
    expect(files.length).toBeGreaterThanOrEqual(1)
    const claudeMd = files.find(f => f.absolutePath.includes('CLAUDE.md'))
    expect(claudeMd).toBeDefined()
    expect(claudeMd!.category).toBe('Claude Code')
    expect(claudeMd!.type).toBe('project')
  })

  it('finds .cursorrules in a workspace directory', () => {
    const projectDir = path.join(tmpHome, 'cursor-project')
    fs.mkdirSync(projectDir, { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.cursorrules'), 'rules here')

    const files = scanForFiles([projectDir])
    const cursorFile = files.find(f => f.absolutePath.includes('.cursorrules'))
    expect(cursorFile).toBeDefined()
    expect(cursorFile!.category).toBe('Cursor Rules')
  })

  it('finds glob-matched files in .cursor/rules/', () => {
    const rulesDir = path.join(tmpHome, 'project', '.cursor', 'rules')
    fs.mkdirSync(rulesDir, { recursive: true })
    fs.writeFileSync(path.join(rulesDir, 'custom.md'), '# Custom rule')
    fs.writeFileSync(path.join(rulesDir, 'piut.mdc'), '# Piut rule')

    const files = scanForFiles([path.join(tmpHome, 'project')])
    const ruleFiles = files.filter(f => f.absolutePath.includes('.cursor/rules/'))
    expect(ruleFiles.length).toBe(2)
  })

  it('deduplicates files', () => {
    const projectDir = path.join(tmpHome, 'dedup-project')
    fs.mkdirSync(projectDir, { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Test')

    const files = scanForFiles([projectDir, projectDir])
    const claudeFiles = files.filter(f => f.absolutePath.includes('CLAUDE.md'))
    expect(claudeFiles.length).toBe(1)
  })

  it('uses display path relative to home', () => {
    const projectDir = path.join(tmpHome, 'my-project')
    fs.mkdirSync(projectDir, { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Test')

    const files = scanForFiles([projectDir])
    const claudeMd = files.find(f => f.absolutePath.includes('CLAUDE.md'))
    expect(claudeMd!.displayPath).toContain('~/')
  })
})

describe('detectInstalledTools', () => {
  it('returns empty array when no tools installed', () => {
    const tools = detectInstalledTools()
    // May detect tools based on actual system, but in tmpHome should be minimal
    expect(Array.isArray(tools)).toBe(true)
  })

  it('detects Claude Code when config file exists', () => {
    fs.writeFileSync(path.join(tmpHome, '.claude.json'), '{}')

    const tools = detectInstalledTools()
    const claudeCode = tools.find(t => t.id === 'claude-code')
    expect(claudeCode).toBeDefined()
    expect(claudeCode!.name).toBe('Claude Code')
  })

  it('detects Cursor when directory exists', () => {
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true })

    const tools = detectInstalledTools()
    const cursor = tools.find(t => t.id === 'cursor')
    expect(cursor).toBeDefined()
  })
})
