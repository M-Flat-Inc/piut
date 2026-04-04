import fs from 'fs'
import path from 'path'

const API_BASE = process.env.PIUT_API_BASE || 'https://piut.com'
if (!API_BASE.startsWith('https://') && !API_BASE.startsWith('http://localhost') && !API_BASE.startsWith('http://127.0.0.1')) {
  throw new Error('PIUT_API_BASE must use HTTPS (or http://localhost / http://127.0.0.1 for development)')
}

export interface PiutProjectConfig {
  slug: string
  apiKey: string
  serverUrl: string
}

const PIUT_DIR = '.piut'
const CONFIG_FILE = 'config.json'
const SKILL_FILE = 'skill.md'

/** Minimal fallback skill content when piut.com is unreachable */
const MINIMAL_SKILL_CONTENT = `# pıut Context Skill

## MCP Server

Endpoint: \`https://piut.com/api/mcp/{{slug}}\`
Auth: \`Authorization: Bearer {{key}}\`
Protocol: JSON-RPC 2.0 over HTTPS

## Brain Sections

| Section | Purpose |
|---------|---------|
| about | Who the user is — background, expertise, interests |
| soul | How the user wants AI to behave — tone, preferences, rules |
| areas | Ongoing areas of responsibility and focus |
| projects | Active projects with goals and status |
| memory | Running log of facts, decisions, and context |

## Tools

| Tool | Description |
|------|-------------|
| get_context | Fetch all 5 brain sections (call this FIRST) |
| get_section | Fetch a single section by name |
| search_brain | Search across all sections |
| append_brain | Append text to a section (no AI processing) |
| update_brain | AI-powered integration of new info into brain |
| prompt_brain | Execute natural language commands against context |

## Best Practices

1. Always call \`get_context\` at the start of every conversation
2. Read the \`soul\` section immediately — it contains behavioral instructions
3. Use \`update_brain\` for substantial new information
4. Use \`append_brain\` for quick notes and facts
`

function piutDir(projectPath: string): string {
  return path.join(projectPath, PIUT_DIR)
}

/** Write .piut/config.json with credentials. Creates dir if needed, overwrites if exists. */
export function writePiutConfig(projectPath: string, config: PiutProjectConfig): void {
  const dir = piutDir(projectPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, CONFIG_FILE),
    JSON.stringify(config, null, 2) + '\n',
    { encoding: 'utf-8', mode: 0o600 },
  )
}

/** Read .piut/config.json. Returns null if missing or invalid. */
export function readPiutConfig(projectPath: string): PiutProjectConfig | null {
  try {
    const raw = fs.readFileSync(path.join(piutDir(projectPath), CONFIG_FILE), 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.slug && parsed.apiKey && parsed.serverUrl) return parsed
    return null
  } catch {
    return null
  }
}

/** Fetch skill.md from piut.com, replace placeholders, write to .piut/skill.md */
export async function writePiutSkill(projectPath: string, slug: string, apiKey: string): Promise<void> {
  const dir = piutDir(projectPath)
  fs.mkdirSync(dir, { recursive: true })

  let content: string
  try {
    const res = await fetch(`${API_BASE}/skill.md`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    content = await res.text()
  } catch {
    // Offline fallback
    content = MINIMAL_SKILL_CONTENT
  }

  content = content.replaceAll('{{slug}}', slug).replaceAll('{{key}}', apiKey)

  fs.writeFileSync(path.join(dir, SKILL_FILE), content, 'utf-8')
}

/** Ensure .piut/ is in .gitignore */
export function ensureGitignored(projectPath: string): void {
  const gitignorePath = path.join(projectPath, '.gitignore')

  let content = ''
  try {
    content = fs.readFileSync(gitignorePath, 'utf-8')
  } catch {
    // No .gitignore — we'll create one
  }

  // Check if already ignored
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '.piut/' || trimmed === '.piut') return
  }

  // Append
  const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : ''
  fs.writeFileSync(
    gitignorePath,
    content + suffix + '\n# piut\n.piut/\n',
    'utf-8',
  )
}

/** Remove .piut/ directory entirely. Returns true if it existed. */
export function removePiutDir(projectPath: string): boolean {
  const dir = piutDir(projectPath)
  if (!fs.existsSync(dir)) return false
  fs.rmSync(dir, { recursive: true, force: true })
  return true
}

/** Check if .piut/config.json exists in a project */
export function hasPiutDir(projectPath: string): boolean {
  return fs.existsSync(path.join(piutDir(projectPath), CONFIG_FILE))
}
