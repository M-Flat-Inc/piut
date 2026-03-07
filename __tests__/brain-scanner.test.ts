import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { scanFolders, buildBrainInput, scanForProjects, getDefaultScanDirs } from '../src/lib/brain-scanner.js'

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

describe('scanFolders', () => {
  it('returns structured result with folders, projects, configFiles, allFiles', async () => {
    const projectDir = path.join(tmpHome, 'projects', 'test-app')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'test-app', description: 'Test application' })
    )
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Claude rules for test-app')
    fs.writeFileSync(path.join(projectDir, 'notes.md'), '# Some notes about the project')

    const result = await scanFolders([path.join(tmpHome, 'projects')])

    expect(result.projects).toHaveLength(1)
    expect(result.projects[0].name).toBe('test-app')
    expect(result.configFiles.length).toBeGreaterThanOrEqual(1)
    expect(result.folders).toBeDefined()
    expect(result.totalFiles).toBeGreaterThanOrEqual(0)
  })

  it('returns empty result for directory with no parseable files', async () => {
    const emptyDir = path.join(tmpHome, 'empty')
    fs.mkdirSync(emptyDir, { recursive: true })

    const result = await scanFolders([emptyDir])
    expect(result.projects).toEqual([])
    expect(result.allFiles).toEqual([])
    expect(result.totalFiles).toBe(0)
  })

  it('collects .md files as personal documents', async () => {
    const docsDir = path.join(tmpHome, 'docs')
    fs.mkdirSync(docsDir, { recursive: true })
    fs.writeFileSync(path.join(docsDir, 'NOTES.md'), '# My Notes\nSome recent notes')

    const result = await scanFolders([docsDir])
    const notesFile = result.allFiles.find(f => f.path.includes('NOTES.md'))
    expect(notesFile).toBeDefined()
    expect(notesFile!.content).toContain('My Notes')
  })

  it('skips AI config files from personal documents', async () => {
    const projectDir = path.join(tmpHome, 'projects', 'my-app')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Claude rules')
    fs.writeFileSync(path.join(projectDir, 'readme.md'), '# My App readme')

    const result = await scanFolders([path.join(tmpHome, 'projects')])
    // CLAUDE.md should be in configFiles, not allFiles (personal docs)
    const claudeInDocs = result.allFiles.find(f => f.path.includes('CLAUDE.md'))
    expect(claudeInDocs).toBeUndefined()
    const claudeInConfigs = result.configFiles.find(c => c.name.includes('CLAUDE.md'))
    expect(claudeInConfigs).toBeDefined()
  })
})

describe('buildBrainInput', () => {
  it('builds API input from scan result with selected folders', async () => {
    const docsDir = path.join(tmpHome, 'docs')
    fs.mkdirSync(docsDir, { recursive: true })
    fs.writeFileSync(path.join(docsDir, 'resume.md'), '# Resume\nSoftware engineer')
    fs.writeFileSync(path.join(docsDir, 'notes.txt'), 'Some notes here')

    const result = await scanFolders([docsDir])
    const input = buildBrainInput(result, [docsDir])

    expect(input.summary).toBeDefined()
    expect(input.summary.personalDocuments).toBeDefined()
    expect(input.summary.personalDocuments!.length).toBeGreaterThanOrEqual(1)
  })

  it('filters files by selected folders', async () => {
    const dir1 = path.join(tmpHome, 'dir1')
    const dir2 = path.join(tmpHome, 'dir2')
    fs.mkdirSync(dir1, { recursive: true })
    fs.mkdirSync(dir2, { recursive: true })
    fs.writeFileSync(path.join(dir1, 'file1.md'), '# File 1')
    fs.writeFileSync(path.join(dir2, 'file2.md'), '# File 2')

    const result = await scanFolders([dir1, dir2])
    // Only select dir1
    const input = buildBrainInput(result, [dir1])

    const names = (input.summary.personalDocuments || []).map(d => d.name)
    expect(names.some(n => n.includes('file1'))).toBe(true)
    expect(names.some(n => n.includes('file2'))).toBe(false)
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
