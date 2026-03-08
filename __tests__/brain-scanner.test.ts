import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  scanForProjects,
  getDefaultScanDirs,
  detectProjects,
  collectGlobalConfigFiles,
  collectProjectConfigFiles,
  formatSize,
  MAX_BRAIN_INPUT_BYTES,
} from '../src/lib/brain-scanner.js'

let tmpHome: string
let origHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-brain-scanner-'))
  origHome = process.env.HOME || os.homedir()
  process.env.HOME = tmpHome
})

afterEach(() => {
  process.env.HOME = origHome
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('scanForProjects', () => {
  it('returns empty array when no projects found', () => {
    const emptyDir = path.join(tmpHome, 'empty')
    fs.mkdirSync(emptyDir, { recursive: true })

    const projects = scanForProjects([emptyDir])
    expect(projects).toEqual([])
  })

  it('detects a project with .git directory', () => {
    const projectDir = path.join(tmpHome, 'projects', 'my-app')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })

    const projects = scanForProjects([path.join(tmpHome, 'projects')])
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('my-app')
    expect(projects[0].path).toBe(projectDir)
  })

  it('detects a project with package.json and reads description', () => {
    const projectDir = path.join(tmpHome, 'projects', 'npm-project')
    fs.mkdirSync(projectDir, { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'npm-project', description: 'A test npm project' })
    )

    const projects = scanForProjects([path.join(tmpHome, 'projects')])
    expect(projects).toHaveLength(1)
    expect(projects[0].description).toBe('A test npm project')
  })

  it('detects project with Cargo.toml', () => {
    const projectDir = path.join(tmpHome, 'projects', 'rust-app')
    fs.mkdirSync(projectDir, { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'Cargo.toml'), '[package]\nname = "rust-app"')

    const projects = scanForProjects([path.join(tmpHome, 'projects')])
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('rust-app')
  })

  it('detects tool-specific rule files', () => {
    const projectDir = path.join(tmpHome, 'projects', 'tool-project')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Rules')
    fs.writeFileSync(path.join(projectDir, '.cursorrules'), 'cursor rules')
    fs.mkdirSync(path.join(projectDir, '.github'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.github', 'copilot-instructions.md'), 'copilot')

    const projects = scanForProjects([path.join(tmpHome, 'projects')])
    expect(projects).toHaveLength(1)
    expect(projects[0].hasClaudeMd).toBe(true)
    expect(projects[0].hasCursorRules).toBe(true)
    expect(projects[0].hasCopilotInstructions).toBe(true)
  })

  it('skips node_modules and .git directories', () => {
    const projectDir = path.join(tmpHome, 'projects')
    fs.mkdirSync(path.join(projectDir, 'node_modules', 'fake-pkg', '.git'), { recursive: true })
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })

    const projects = scanForProjects([projectDir])
    expect(projects.every(p => !p.name.includes('node_modules'))).toBe(true)
  })

  it('reads description from README when no package.json description', () => {
    const projectDir = path.join(tmpHome, 'projects', 'readme-project')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, 'README.md'),
      '# My Project\n\nThis is a cool project for testing.'
    )

    const projects = scanForProjects([path.join(tmpHome, 'projects')])
    expect(projects).toHaveLength(1)
    expect(projects[0].description).toContain('cool project')
  })
})

describe('detectProjects (exported)', () => {
  it('can be called directly', () => {
    const projectDir = path.join(tmpHome, 'my-project')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })

    const projects = detectProjects([tmpHome])
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('my-project')
  })
})

describe('collectGlobalConfigFiles', () => {
  it('returns array without errors', () => {
    const configs = collectGlobalConfigFiles()
    expect(Array.isArray(configs)).toBe(true)
  })

  it('each config has name and content', () => {
    const configs = collectGlobalConfigFiles()
    for (const config of configs) {
      expect(config).toHaveProperty('name')
      expect(config).toHaveProperty('content')
      expect(typeof config.name).toBe('string')
      expect(typeof config.content).toBe('string')
    }
  })
})

describe('collectProjectConfigFiles', () => {
  it('collects CLAUDE.md from projects', () => {
    const projectDir = path.join(tmpHome, 'my-project')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Project rules')

    const projects = detectProjects([tmpHome])
    const configs = collectProjectConfigFiles(projects)
    const claudeConfig = configs.find(c => c.name.includes('CLAUDE.md'))
    expect(claudeConfig).toBeDefined()
    expect(claudeConfig!.content).toContain('Project rules')
  })
})

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(512)).toBe('512 B')
  })

  it('formats kilobytes', () => {
    expect(formatSize(2048)).toBe('2.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatSize(1_500_000)).toBe('1.4 MB')
  })
})

describe('MAX_BRAIN_INPUT_BYTES', () => {
  it('is 1MB', () => {
    expect(MAX_BRAIN_INPUT_BYTES).toBe(1_000_000)
  })
})

describe('getDefaultScanDirs', () => {
  it('returns array of existing directories', () => {
    const dirs = getDefaultScanDirs()
    expect(Array.isArray(dirs)).toBe(true)
    expect(dirs.length).toBeGreaterThan(0)
  })

  it('includes home when no common directories exist', () => {
    const dirs = getDefaultScanDirs()
    expect(dirs.length).toBeGreaterThan(0)
  })
})
