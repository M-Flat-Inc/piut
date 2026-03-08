import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { placeSkillFile, SKILL_SNIPPET, PROJECT_SKILL_SNIPPET } from '../src/lib/skill.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-skill-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('placeSkillFile', () => {
  it('creates a new file when it does not exist', () => {
    const file = path.join(tmpDir, 'CLAUDE.md')
    const result = placeSkillFile(file)

    expect(result).toEqual({ created: true, appended: false })
    expect(fs.existsSync(file)).toBe(true)
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).toContain('p\u0131ut Context')
    expect(content).toContain('get_context')
  })

  it('creates parent directories if needed', () => {
    const file = path.join(tmpDir, 'deep', 'nested', 'rules.md')
    const result = placeSkillFile(file)

    expect(result).toEqual({ created: true, appended: false })
    expect(fs.existsSync(file)).toBe(true)
  })

  it('appends to existing file without the snippet', () => {
    const file = path.join(tmpDir, 'existing.md')
    fs.writeFileSync(file, '# My Rules\n\nSome existing content.\n')

    const result = placeSkillFile(file)
    expect(result).toEqual({ created: false, appended: true })

    const content = fs.readFileSync(file, 'utf-8')
    expect(content).toContain('# My Rules')
    expect(content).toContain('p\u0131ut Context')
    expect(content).toContain('---')
  })

  it('skips if snippet is already present', () => {
    const file = path.join(tmpDir, 'already.md')
    fs.writeFileSync(file, SKILL_SNIPPET + '\n')

    const result = placeSkillFile(file)
    expect(result).toEqual({ created: false, appended: false })

    // Content should not be duplicated
    const content = fs.readFileSync(file, 'utf-8')
    const occurrences = content.split('p\u0131ut Context').length - 1
    expect(occurrences).toBe(1)
  })
})

describe('SKILL_SNIPPET', () => {
  it('contains expected content', () => {
    expect(SKILL_SNIPPET).toContain('p\u0131ut Context')
    expect(SKILL_SNIPPET).toContain('get_context')
    expect(SKILL_SNIPPET).toContain('soul')
    expect(SKILL_SNIPPET).toContain('update_brain')
    expect(SKILL_SNIPPET).toContain('append_brain')
    expect(SKILL_SNIPPET).toContain('githubusercontent.com/M-Flat-Inc/piut')
  })

  it('mentions MCP explicitly so AI tools understand the protocol', () => {
    expect(SKILL_SNIPPET).toContain('MCP')
    expect(SKILL_SNIPPET).toContain('Model Context Protocol')
    expect(SKILL_SNIPPET).toContain('MCP Server: piut')
  })

  it('lists all 6 MCP tool names', () => {
    expect(SKILL_SNIPPET).toContain('get_context')
    expect(SKILL_SNIPPET).toContain('get_section')
    expect(SKILL_SNIPPET).toContain('search_brain')
    expect(SKILL_SNIPPET).toContain('append_brain')
    expect(SKILL_SNIPPET).toContain('update_brain')
    expect(SKILL_SNIPPET).toContain('prompt_brain')
  })

  it('instructs AI not to read local files', () => {
    expect(SKILL_SNIPPET).toMatch(/[Nn]ever read .piut\/config.json/)
    expect(SKILL_SNIPPET).toMatch(/[Dd]o NOT read local/)
  })
})

describe('PROJECT_SKILL_SNIPPET', () => {
  it('references local .piut/skill.md instead of GitHub URL', () => {
    expect(PROJECT_SKILL_SNIPPET).toContain('p\u0131ut Context')
    expect(PROJECT_SKILL_SNIPPET).toContain('.piut/skill.md')
    expect(PROJECT_SKILL_SNIPPET).toContain('get_context')
    expect(PROJECT_SKILL_SNIPPET).toContain('soul')
    expect(PROJECT_SKILL_SNIPPET).toContain('update_brain')
    expect(PROJECT_SKILL_SNIPPET).toContain('append_brain')
    expect(PROJECT_SKILL_SNIPPET).not.toContain('githubusercontent.com')
  })

  it('mentions MCP explicitly', () => {
    expect(PROJECT_SKILL_SNIPPET).toContain('MCP')
    expect(PROJECT_SKILL_SNIPPET).toContain('MCP Server: piut')
  })

  it('lists all 6 MCP tool names', () => {
    expect(PROJECT_SKILL_SNIPPET).toContain('get_context')
    expect(PROJECT_SKILL_SNIPPET).toContain('get_section')
    expect(PROJECT_SKILL_SNIPPET).toContain('search_brain')
    expect(PROJECT_SKILL_SNIPPET).toContain('append_brain')
    expect(PROJECT_SKILL_SNIPPET).toContain('update_brain')
    expect(PROJECT_SKILL_SNIPPET).toContain('prompt_brain')
  })
})
