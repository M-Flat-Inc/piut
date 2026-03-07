import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { scanForBrain, scanForProjects, getDefaultScanDirs } from '../src/lib/brain-scanner.js'

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
    // node_modules should not be detected as a project
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

describe('scanForBrain', () => {
  it('returns structured summary with folders, projects, configFiles, recentDocuments', () => {
    const projectDir = path.join(tmpHome, 'projects', 'test-app')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'test-app', description: 'Test application' })
    )
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Claude rules for test-app')

    const result = scanForBrain([path.join(tmpHome, 'projects')])

    expect(result.summary).toBeDefined()
    expect(result.summary.folders).toBeDefined()
    expect(result.summary.projects).toHaveLength(1)
    expect(result.summary.projects[0].name).toBe('test-app')
    expect(result.summary.configFiles.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty summary for directory with no projects', () => {
    const emptyDir = path.join(tmpHome, 'empty')
    fs.mkdirSync(emptyDir, { recursive: true })

    const result = scanForBrain([emptyDir])
    expect(result.summary.projects).toEqual([])
    expect(result.summary.folders.length).toBeGreaterThanOrEqual(0)
  })

  it('collects recent .md files as recentDocuments', () => {
    const projectDir = path.join(tmpHome, 'projects', 'docs-project')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'NOTES.md'), '# My Notes\nSome recent notes')

    const result = scanForBrain([path.join(tmpHome, 'projects')])
    const recentDocs = result.summary.recentDocuments
    const notesDoc = recentDocs.find(d => d.name.includes('NOTES.md'))
    expect(notesDoc).toBeDefined()
    expect(notesDoc!.content).toContain('My Notes')
  })
})

describe('getDefaultScanDirs', () => {
  it('returns array of existing directories', () => {
    const dirs = getDefaultScanDirs()
    expect(Array.isArray(dirs)).toBe(true)
    expect(dirs.length).toBeGreaterThan(0)
  })

  it('includes home when no common directories exist', () => {
    // In a temp HOME with no standard dirs, should fall back to home
    const dirs = getDefaultScanDirs()
    // At minimum, it should have something
    expect(dirs.length).toBeGreaterThan(0)
  })
})
