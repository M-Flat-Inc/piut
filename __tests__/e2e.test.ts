import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { execFile, execFileSync } from 'child_process'
import http from 'http'
import fs from 'fs'
import path from 'path'
import os from 'os'

const CLI = path.resolve(__dirname, '../dist/cli.js')
const NODE = process.execPath

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-e2e-'))
})

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

/** Run the CLI binary synchronously (for commands that don't need mock API) */
function runSync(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(NODE, [CLI, ...args], {
      env: { ...process.env, HOME: tmpHome, FORCE_COLOR: '0' },
      cwd: tmpHome,
      encoding: 'utf-8',
      timeout: 10000,
    })
    return { stdout, stderr: '', exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 }
  }
}

/** Run the CLI binary asynchronously (for commands that need mock API server) */
function runAsync(
  args: string[],
  opts?: { env?: Record<string, string>; cwd?: string }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      NODE,
      [CLI, ...args],
      {
        env: { ...process.env, HOME: tmpHome, FORCE_COLOR: '0', ...(opts?.env || {}) },
        cwd: opts?.cwd || tmpHome,
        encoding: 'utf-8',
        timeout: 15000,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: (error as { code?: number }).code || 1,
          })
        } else {
          resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 })
        }
      }
    )
  })
}

// ─── Mock API server ────────────────────────────────────────────────

let mockServer: http.Server
let mockPort: number

beforeAll(async () => {
  return new Promise<void>((resolve) => {
    mockServer = http.createServer((req, res) => {
      const auth = req.headers.authorization

      if (req.url === '/api/cli/validate') {
        if (auth === 'Bearer pb_valid_test_key') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              slug: 'testuser',
              displayName: 'Test User',
              serverUrl: 'https://piut.com/api/mcp/testuser',
              planType: 'starter',
              status: 'active',
              _contractVersion: '2.1.0',
            })
          )
        } else if (auth === 'Bearer pb_no_brain_key') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              slug: '',
              displayName: 'No Brain User',
              serverUrl: '',
              planType: 'starter',
              status: 'no_brain',
              _contractVersion: '2.1.0',
            })
          )
        } else if (auth === 'Bearer pb_unpublished_key') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              slug: 'unpubuser',
              displayName: 'Unpublished User',
              serverUrl: 'https://piut.com/api/mcp/unpubuser',
              planType: 'starter',
              status: 'unpublished',
              _contractVersion: '2.1.0',
            })
          )
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid or revoked API key' }))
        }
      } else if (req.url === '/skill.md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown' })
        res.end('# pıut Skill\n\nEndpoint: https://piut.com/api/mcp/{{slug}}\nAuth: Bearer {{key}}\n\nAlways call `get_context` first.\n')
      } else if (req.url === '/api/cli/build-brain' && req.method === 'POST') {
        if (auth !== 'Bearer pb_valid_test_key') {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid or revoked API key' }))
          return
        }
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            sections: {
              about: 'Test user is a developer.',
              soul: 'This section is yours to write.',
              areas: 'Engineering',
              projects: '- TestProject: Active',
              memory: 'Uses TypeScript.',
            },
          }))
        })
      } else if (req.url === '/api/mcp/publish' && req.method === 'POST') {
        if (auth !== 'Bearer pb_valid_test_key') {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid or revoked API key' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ published: true }))
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = (mockServer.address() as { port: number }).port
      resolve()
    })
  })
})

afterAll(() => {
  mockServer?.close()
})

function apiEnv(): Record<string, string> {
  return { PIUT_API_BASE: `http://127.0.0.1:${mockPort}` }
}

// ─── Binary basics ──────────────────────────────────────────────────

describe('CLI binary', () => {
  beforeAll(() => {
    expect(fs.existsSync(CLI)).toBe(true)
  })

  it('--version outputs version number', () => {
    const { stdout, exitCode } = runSync(['--version'])
    expect(exitCode).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('--help shows all commands', () => {
    const { stdout, exitCode } = runSync(['--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('setup')
    expect(stdout).toContain('status')
    expect(stdout).toContain('remove')
  })

  it('setup --help shows all options', () => {
    const { stdout, exitCode } = runSync(['setup', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--key')
    expect(stdout).toContain('--tool')
    expect(stdout).toContain('--yes')
    expect(stdout).toContain('--skip-skill')
    expect(stdout).toContain('--project')
  })
})

// ─── Status command ────────────────────────────────────────────────

describe('status command', () => {
  it('shows no tools when HOME is empty', () => {
    const { stdout, exitCode } = runSync(['status'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('No supported AI tools detected')
  })

  it('detects installed but unconfigured tool', () => {
    fs.writeFileSync(
      path.join(tmpHome, '.claude.json'),
      JSON.stringify({ mcpServers: {} })
    )

    const { stdout, exitCode } = runSync(['status'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Claude Code')
    expect(stdout).toContain('installed')
  })

  it('detects configured tool as connected', () => {
    fs.writeFileSync(
      path.join(tmpHome, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          'piut-context': {
            type: 'http',
            url: 'https://piut.com/api/mcp/testuser',
            headers: { Authorization: 'Bearer pb_test' },
          },
        },
      })
    )

    const { stdout, exitCode } = runSync(['status'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Claude Code')
    expect(stdout).toContain('connected')
  })

  it('detects multiple tools with different statuses', () => {
    // Claude Code: connected
    fs.writeFileSync(
      path.join(tmpHome, '.claude.json'),
      JSON.stringify({
        mcpServers: { 'piut-context': { url: 'https://piut.com/api/mcp/test' } },
      })
    )
    // Cursor: installed, not connected
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpHome, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: {} })
    )

    const { stdout, exitCode } = runSync(['status'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Claude Code')
    expect(stdout).toContain('connected')
    expect(stdout).toContain('Cursor')
    expect(stdout).toContain('installed')
  })

  it('detects Windsurf config', () => {
    const windsurfDir = path.join(tmpHome, '.codeium', 'windsurf')
    fs.mkdirSync(windsurfDir, { recursive: true })
    fs.writeFileSync(
      path.join(windsurfDir, 'mcp_config.json'),
      JSON.stringify({
        mcpServers: { 'piut-context': { serverUrl: 'https://piut.com/api/mcp/test' } },
      })
    )

    const { stdout, exitCode } = runSync(['status'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Windsurf')
    expect(stdout).toContain('connected')
  })

  it('detects Amazon Q config', () => {
    const aqDir = path.join(tmpHome, '.aws', 'amazonq')
    fs.mkdirSync(aqDir, { recursive: true })
    fs.writeFileSync(
      path.join(aqDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { other: { url: 'http://example.com' } } })
    )

    const { stdout, exitCode } = runSync(['status'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Amazon Q')
    expect(stdout).toContain('installed')
  })
})

// ─── Setup command ─────────────────────────────────────────────────

describe('setup command', () => {
  it('requires --key when using --yes', async () => {
    const { stdout, exitCode } = await runAsync(['setup', '--yes'], { env: apiEnv() })
    expect(exitCode).not.toBe(0)
    expect(stdout).toContain('--key is required')
  })

  it('fails with invalid API key', async () => {
    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_invalid_key', '--tool', 'cursor', '--yes'],
      { env: apiEnv() }
    )
    expect(exitCode).not.toBe(0)
    expect(stdout).toContain('Invalid or revoked API key')
  })

  it('reports no tools when none detected', async () => {
    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'cursor', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Authenticated as Test User')
    expect(stdout).toContain('No supported AI tools detected')
  })

  it('configures a detected tool', async () => {
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'cursor', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Authenticated as Test User')
    expect(stdout).toContain('Cursor')
    expect(stdout).toContain('configured')
    expect(stdout).toContain('Setup complete')

    // Verify config file was written
    const configPath = path.join(tmpHome, '.cursor', 'mcp.json')
    expect(fs.existsSync(configPath)).toBe(true)

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(config.mcpServers['piut-context']).toBeDefined()
    expect(config.mcpServers['piut-context'].url).toBe('https://piut.com/api/mcp/testuser')
    expect(config.mcpServers['piut-context'].headers.Authorization).toBe(
      'Bearer pb_valid_test_key'
    )
  })

  it('configures Windsurf with serverUrl field', async () => {
    const windsurfDir = path.join(tmpHome, '.codeium', 'windsurf')
    fs.mkdirSync(windsurfDir, { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'windsurf', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Windsurf')
    expect(stdout).toContain('configured')

    const config = JSON.parse(
      fs.readFileSync(path.join(windsurfDir, 'mcp_config.json'), 'utf-8')
    )
    expect(config.mcpServers['piut-context'].serverUrl).toContain('piut.com/api/mcp/testuser')
    expect(config.mcpServers['piut-context'].url).toBeUndefined()
  })

  it('preserves existing config entries', async () => {
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpHome, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'other-server': { url: 'http://other.com' } } })
    )

    const { exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'cursor', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpHome, '.cursor', 'mcp.json'), 'utf-8')
    )
    expect(config.mcpServers['other-server']).toEqual({ url: 'http://other.com' })
    expect(config.mcpServers['piut-context']).toBeDefined()
  })

  it('skips already-configured tools in --yes mode', async () => {
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpHome, '.cursor', 'mcp.json'),
      JSON.stringify({
        mcpServers: { 'piut-context': { url: 'https://piut.com/api/mcp/olduser' } },
      })
    )

    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'cursor', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('All detected tools are already configured')
  })

  it('creates skill files when not using --skip-skill', async () => {
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'cursor', '--yes'],
      { env: apiEnv(), cwd: tmpHome }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('configured')

    // Skill file should be created at .cursor/rules/piut.mdc relative to CWD
    const skillPath = path.join(tmpHome, '.cursor', 'rules', 'piut.mdc')
    expect(fs.existsSync(skillPath)).toBe(true)
    const content = fs.readFileSync(skillPath, 'utf-8')
    expect(content).toContain('p\u0131ut Context')
    expect(content).toContain('get_context')
  })

  it('configures Claude Desktop with mcp-remote', async () => {
    const claudeDesktopDir = process.platform === 'darwin'
      ? path.join(tmpHome, 'Library', 'Application Support', 'Claude')
      : path.join(tmpHome, '.config', 'Claude')
    fs.mkdirSync(claudeDesktopDir, { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'claude-desktop', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Claude Desktop')
    expect(stdout).toContain('configured')

    const configPath = path.join(claudeDesktopDir, 'claude_desktop_config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(config.mcpServers['piut-context'].command).toBe('npx')
    expect(config.mcpServers['piut-context'].args).toContain('mcp-remote')
  })

  it('configures Amazon Q with standard config', async () => {
    const aqDir = path.join(tmpHome, '.aws', 'amazonq')
    fs.mkdirSync(aqDir, { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'amazon-q', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Amazon Q')

    const config = JSON.parse(fs.readFileSync(path.join(aqDir, 'mcp.json'), 'utf-8'))
    expect(config.mcpServers['piut-context'].type).toBe('http')
    expect(config.mcpServers['piut-context'].url).toContain('piut.com/api/mcp/testuser')
  })

  it('configures Zed with context_servers key', async () => {
    const zedDir = path.join(tmpHome, '.config', 'zed')
    fs.mkdirSync(zedDir, { recursive: true })
    fs.writeFileSync(
      path.join(zedDir, 'settings.json'),
      JSON.stringify({ theme: 'One Dark', vim_mode: true })
    )

    const { stdout, exitCode } = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'zed', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Zed')

    const config = JSON.parse(
      fs.readFileSync(path.join(zedDir, 'settings.json'), 'utf-8')
    )
    expect(config.theme).toBe('One Dark')
    expect(config.vim_mode).toBe(true)
    expect(config.context_servers['piut-context']).toBeDefined()
    expect(config.context_servers['piut-context'].settings.url).toContain(
      'piut.com/api/mcp/testuser'
    )
  })
})

// ─── Remove command ────────────────────────────────────────────────

describe('remove command', () => {
  it('shows nothing to remove when no tools configured', () => {
    const { stdout, exitCode } = runSync(['remove'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('not configured')
  })

  it('shows nothing to remove when tool installed but piut not configured', () => {
    fs.writeFileSync(
      path.join(tmpHome, '.claude.json'),
      JSON.stringify({ mcpServers: { other: { url: 'http://other.com' } } })
    )

    const { stdout, exitCode } = runSync(['remove'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('not configured')
  })
})

// ─── End-to-end flow ───────────────────────────────────────────────

describe('full setup → status → verify flow', () => {
  it('setup then status shows connected', async () => {
    // Pre-create Cursor directory
    fs.mkdirSync(path.join(tmpHome, '.cursor'), { recursive: true })

    // Run setup
    const setupResult = await runAsync(
      ['setup', '--key', 'pb_valid_test_key', '--tool', 'cursor', '--yes', '--skip-skill'],
      { env: apiEnv() }
    )
    expect(setupResult.exitCode).toBe(0)
    expect(setupResult.stdout).toContain('Setup complete')

    // Run status — should show Cursor as connected
    const statusResult = runSync(['status'])
    expect(statusResult.exitCode).toBe(0)
    expect(statusResult.stdout).toContain('Cursor')
    expect(statusResult.stdout).toContain('connected')
  })
})

// ─── Build command ──────────────────────────────────────────────────

describe('build command', () => {
  it('build --help shows all options', () => {
    const { stdout, exitCode } = runSync(['build', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--key')
    expect(stdout).toContain('--folders')
  })

  it('builds brain from scanned projects', async () => {
    // Create a project directory with enough content
    const projectDir = path.join(tmpHome, 'Projects', 'my-app')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'my-app', description: 'A test application' })
    )
    fs.writeFileSync(
      path.join(projectDir, 'CLAUDE.md'),
      '# CLAUDE.md\n\nThis is a test project with some rules and guidelines for AI tools.'
    )

    const { stdout, exitCode } = await runAsync(
      ['build', '--key', 'pb_valid_test_key', '--no-publish', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Brain built')
    expect(stdout).toContain('About')
    expect(stdout).toContain('Soul')
  })

  it('warns when no projects found', async () => {
    const emptyDir = path.join(tmpHome, 'empty-dir')
    fs.mkdirSync(emptyDir, { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['build', '--key', 'pb_valid_test_key', '--folders', emptyDir],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('No parseable files found')
  })
})

// ─── Deploy command ─────────────────────────────────────────────────

describe('deploy command', () => {
  it('deploy --help shows all options', () => {
    const { stdout, exitCode } = runSync(['deploy', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--key')
  })

  it('deploys brain', async () => {
    const { stdout, exitCode } = await runAsync(
      ['deploy', '--key', 'pb_valid_test_key'],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Brain deployed')
    expect(stdout).toContain('MCP server live')
  })

  it('fails with invalid key', async () => {
    const { stdout, exitCode } = await runAsync(
      ['deploy', '--key', 'pb_invalid_key'],
      { env: apiEnv() }
    )
    expect(exitCode).not.toBe(0)
    expect(stdout).toContain('Invalid or revoked API key')
  })
})

// ─── Connect command ────────────────────────────────────────────────

describe('connect command', () => {
  it('connect --help shows all options', () => {
    const { stdout, exitCode } = runSync(['connect', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--key')
    expect(stdout).toContain('--yes')
    expect(stdout).toContain('--folders')
  })

  it('connects a project with CLAUDE.md and .piut/', async () => {
    // Create a project with .git
    const projectDir = path.join(tmpHome, 'Projects', 'connect-test')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'connect-test' }))

    const { stdout, exitCode } = await runAsync(
      ['connect', '--key', 'pb_valid_test_key', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('project(s) connected')

    // CLAUDE.md should have been created with local skill reference
    const claudeMd = path.join(projectDir, 'CLAUDE.md')
    expect(fs.existsSync(claudeMd)).toBe(true)
    const content = fs.readFileSync(claudeMd, 'utf-8')
    expect(content).toContain('get_context')
    expect(content).toContain('.piut/skill.md')

    // .piut/ should have been created with config and skill
    const piutConfig = path.join(projectDir, '.piut', 'config.json')
    expect(fs.existsSync(piutConfig)).toBe(true)
    const config = JSON.parse(fs.readFileSync(piutConfig, 'utf-8'))
    expect(config.slug).toBe('testuser')
    expect(config.apiKey).toBe('pb_valid_test_key')

    const piutSkill = path.join(projectDir, '.piut', 'skill.md')
    expect(fs.existsSync(piutSkill)).toBe(true)
    const skillContent = fs.readFileSync(piutSkill, 'utf-8')
    expect(skillContent).toContain('testuser')
    expect(skillContent).not.toContain('{{slug}}')

    // .gitignore should include .piut/
    const gitignore = path.join(projectDir, '.gitignore')
    expect(fs.existsSync(gitignore)).toBe(true)
    const gitignoreContent = fs.readFileSync(gitignore, 'utf-8')
    expect(gitignoreContent).toContain('.piut/')
  })

  it('connects a project with .cursor directory', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'cursor-project')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.mkdirSync(path.join(projectDir, '.cursor'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'cursor-project' }))

    const { stdout, exitCode } = await runAsync(
      ['connect', '--key', 'pb_valid_test_key', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)

    // .cursor/rules/piut.mdc should exist
    const piutMdc = path.join(projectDir, '.cursor', 'rules', 'piut.mdc')
    expect(fs.existsSync(piutMdc)).toBe(true)
    const content = fs.readFileSync(piutMdc, 'utf-8')
    expect(content).toContain('get_context')
  })

  it('skips already connected projects', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'already-connected')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'already-connected' }))
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '## p\u0131ut Context\nalready here')

    const { stdout, exitCode } = await runAsync(
      ['connect', '--key', 'pb_valid_test_key', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('already connected')
  })

  it('warns when no projects found', async () => {
    const emptyDir = path.join(tmpHome, 'empty')
    fs.mkdirSync(emptyDir, { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['connect', '--key', 'pb_valid_test_key', '--yes', '--folders', emptyDir],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('No projects found')
  })

  it('blocks connect when brain not built', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'guard-test')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['connect', '--key', 'pb_no_brain_key', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('haven\u2019t built a brain')

    // No CLAUDE.md should have been created
    expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(false)
  })

  it('blocks connect when brain not deployed', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'unpub-test')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })

    const { stdout, exitCode } = await runAsync(
      ['connect', '--key', 'pb_unpublished_key', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('not deployed yet')

    expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(false)
  })

  it('writes Copilot .vscode/mcp.json for projects with .github/', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'copilot-test')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.mkdirSync(path.join(projectDir, '.github'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'copilot-test' }))

    const { stdout, exitCode } = await runAsync(
      ['connect', '--key', 'pb_valid_test_key', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: apiEnv() }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Copilot MCP')

    const vscodeMcp = path.join(projectDir, '.vscode', 'mcp.json')
    expect(fs.existsSync(vscodeMcp)).toBe(true)
    const config = JSON.parse(fs.readFileSync(vscodeMcp, 'utf-8'))
    expect(config.servers['piut-context']).toBeDefined()
    expect(config.servers['piut-context'].url).toContain('testuser')
  })
})

// ─── Disconnect command ─────────────────────────────────────────────

describe('disconnect command', () => {
  it('disconnect --help shows all options', () => {
    const { stdout, exitCode } = runSync(['disconnect', '--help'])
    expect(exitCode).toBe(0)
    expect(stdout).toContain('--yes')
    expect(stdout).toContain('--folders')
  })

  it('disconnects a project by removing dedicated files', async () => {
    // Create a project with piut connected
    const projectDir = path.join(tmpHome, 'Projects', 'disconnect-test')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.mkdirSync(path.join(projectDir, '.cursor', 'rules'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'disconnect-test' }))
    fs.writeFileSync(
      path.join(projectDir, '.cursor', 'rules', 'piut.mdc'),
      '## p\u0131ut Context\nSkill reference'
    )

    const { stdout, exitCode } = await runAsync(
      ['disconnect', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: {} }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('file(s) updated')

    // piut.mdc should be deleted
    expect(fs.existsSync(path.join(projectDir, '.cursor', 'rules', 'piut.mdc'))).toBe(false)
  })

  it('disconnects a project by removing section from CLAUDE.md', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'section-test')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'section-test' }))
    fs.writeFileSync(
      path.join(projectDir, 'CLAUDE.md'),
      '# Rules\n\nSome rules.\n\n## p\u0131ut Context\nSkill reference: https://raw.githubusercontent.com/M-Flat-Inc/piut/main/skill.md\nAlways call `get_context`.\n'
    )

    const { stdout, exitCode } = await runAsync(
      ['disconnect', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: {} }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('section removed')

    // CLAUDE.md should still exist but without piut section
    const content = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8')
    expect(content).toContain('Some rules')
    expect(content).not.toContain('p\u0131ut Context')
  })

  it('shows nothing to disconnect when no piut references found', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'clean-project')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'clean-project' }))
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# Rules\n\nNo piut here.')

    const { stdout, exitCode } = await runAsync(
      ['disconnect', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: {} }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('No connected projects')
  })

  it('removes .piut/ directory on disconnect', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'piut-dir-test')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'piut-dir-test' }))

    // Create .piut/ directory as connect would
    fs.mkdirSync(path.join(projectDir, '.piut'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, '.piut', 'config.json'),
      JSON.stringify({ slug: 'testuser', apiKey: 'pb_test', serverUrl: 'https://piut.com/api/mcp/testuser' })
    )
    fs.writeFileSync(path.join(projectDir, '.piut', 'skill.md'), '# skill')

    const { stdout, exitCode } = await runAsync(
      ['disconnect', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: {} }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('.piut/')
    expect(stdout).toContain('removed')

    expect(fs.existsSync(path.join(projectDir, '.piut'))).toBe(false)
  })

  it('removes Copilot piut-context from .vscode/mcp.json on disconnect', async () => {
    const projectDir = path.join(tmpHome, 'Projects', 'copilot-disconnect')
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'copilot-disconnect' }))

    // Create .vscode/mcp.json with piut-context
    fs.mkdirSync(path.join(projectDir, '.vscode'), { recursive: true })
    fs.writeFileSync(
      path.join(projectDir, '.vscode', 'mcp.json'),
      JSON.stringify({
        servers: {
          'piut-context': { type: 'http', url: 'https://piut.com/api/mcp/testuser' },
          'other-server': { url: 'http://other.com' },
        },
      })
    )

    const { stdout, exitCode } = await runAsync(
      ['disconnect', '--yes', '--folders', path.join(tmpHome, 'Projects')],
      { env: {} }
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('piut-context removed')

    // other-server should still be there
    const config = JSON.parse(fs.readFileSync(path.join(projectDir, '.vscode', 'mcp.json'), 'utf-8'))
    expect(config.servers['piut-context']).toBeUndefined()
    expect(config.servers['other-server']).toBeDefined()
  })
})
