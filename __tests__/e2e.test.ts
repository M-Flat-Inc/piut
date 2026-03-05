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
      if (req.url === '/api/cli/validate') {
        const auth = req.headers.authorization
        if (auth === 'Bearer pb_valid_test_key') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              slug: 'testuser',
              displayName: 'Test User',
              serverUrl: 'https://piut.com/api/mcp/testuser',
            })
          )
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid or revoked API key' }))
        }
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
    const claudeDesktopDir = path.join(tmpHome, 'Library', 'Application Support', 'Claude')
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
