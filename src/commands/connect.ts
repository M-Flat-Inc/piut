import fs from 'fs'
import path from 'path'
import { checkbox, confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import { scanForProjects } from '../lib/brain-scanner.js'
import { banner, brand, success, dim, warning } from '../lib/ui.js'
import { resolveApiKeyWithResult } from '../lib/auth.js'
import { PROJECT_SKILL_SNIPPET } from '../lib/skill.js'
import { expandPath } from '../lib/paths.js'
import { writePiutConfig, writePiutSkill, ensureGitignored } from '../lib/piut-dir.js'
import { mergeConfig } from '../lib/config.js'
import { TOOLS } from '../lib/tools.js'
import type { ProjectInfo } from '../types.js'

interface ConnectOptions {
  key?: string
  yes?: boolean
  folders?: string
}

/** Tool-specific rule file configurations */
interface RuleFileConfig {
  tool: string
  /** Path relative to project root */
  filePath: string
  /** Whether to append to existing or create dedicated file */
  strategy: 'append' | 'create'
  /** Check function to detect if tool is in use */
  detect: (project: ProjectInfo) => boolean
}

const RULE_FILES: RuleFileConfig[] = [
  {
    tool: 'Claude Code',
    filePath: 'CLAUDE.md',
    strategy: 'append',
    detect: (p) => p.hasClaudeMd || fs.existsSync(path.join(p.path, '.claude')),
  },
  {
    tool: 'Cursor',
    filePath: '.cursor/rules/piut.mdc',
    strategy: 'create',
    detect: (p) => p.hasCursorRules || fs.existsSync(path.join(p.path, '.cursor')),
  },
  {
    tool: 'Windsurf',
    filePath: '.windsurf/rules/piut.md',
    strategy: 'create',
    detect: (p) => p.hasWindsurfRules || fs.existsSync(path.join(p.path, '.windsurf')),
  },
  {
    tool: 'GitHub Copilot',
    filePath: '.github/copilot-instructions.md',
    strategy: 'append',
    detect: (p) => p.hasCopilotInstructions || fs.existsSync(path.join(p.path, '.github')),
  },
  {
    tool: 'Amazon Q',
    filePath: 'CONVENTIONS.md',
    strategy: 'append',
    detect: (p) => p.hasConventionsMd,
  },
  {
    tool: 'Zed',
    filePath: '.zed/rules.md',
    strategy: 'create',
    detect: (p) => p.hasZedRules || fs.existsSync(path.join(p.path, '.zed')),
  },
]

const DEDICATED_FILE_CONTENT = `## p\u0131ut Context
This project uses p\u0131ut for persistent personal context.
Full skill reference: .piut/skill.md

Always call \`get_context\` at the start of every conversation.
Read the \`soul\` section first \u2014 it contains behavioral instructions.
Use \`update_brain\` for substantial new info, \`append_brain\` for quick notes.
`

const APPEND_SECTION = `\n\n## p\u0131ut Context
Full skill reference: .piut/skill.md
Always call \`get_context\` at the start of every conversation to load personal context.
`

function hasPiutReference(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.includes('p\u0131ut Context') || content.includes('piut Context')
  } catch {
    return false
  }
}

interface ConnectAction {
  project: ProjectInfo
  tool: string
  filePath: string
  absPath: string
  action: 'append' | 'create'
}

export async function connectCommand(options: ConnectOptions): Promise<void> {
  banner()

  const { apiKey, slug, serverUrl, status } = await resolveApiKeyWithResult(options.key)

  // Deploy guard — brain must be published for connect to be useful
  if (status === 'no_brain') {
    console.log()
    console.log(warning('  You haven\u2019t built a brain yet.'))
    console.log(dim('  Run ') + brand('piut build') + dim(' first, then ') + brand('piut deploy') + dim('.'))
    console.log()
    return
  }
  if (status === 'unpublished') {
    console.log()
    console.log(warning('  Your brain is built but not deployed yet.'))
    console.log(dim('  Run ') + brand('piut deploy') + dim(' to publish your MCP server, then re-run connect.'))
    console.log()
    return
  }

  // Determine scan folders
  let scanFolders: string[] | undefined
  if (options.folders) {
    scanFolders = options.folders.split(',').map(f => expandPath(f.trim()))
  }

  console.log()
  console.log(dim('  Scanning for projects...'))

  const projects = scanForProjects(scanFolders)

  if (projects.length === 0) {
    console.log(warning('  No projects found.'))
    console.log(dim('  Try running from a directory with your projects, or use --folders.'))
    console.log()
    return
  }

  // For each project, determine what actions to take
  const actions: ConnectAction[] = []

  for (const project of projects) {
    for (const rule of RULE_FILES) {
      if (!rule.detect(project)) continue

      const absPath = path.join(project.path, rule.filePath)

      // Skip if already has piut reference
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) continue

      actions.push({
        project,
        tool: rule.tool,
        filePath: rule.filePath,
        absPath,
        action: rule.strategy === 'create' || !fs.existsSync(absPath)
          ? 'create' : 'append',
      })
    }

    // If no tool detected but project has .git, offer CLAUDE.md
    const hasAnyAction = actions.some(a => a.project === project)
    if (!hasAnyAction) {
      const claudeMdPath = path.join(project.path, 'CLAUDE.md')
      if (!fs.existsSync(claudeMdPath)) {
        actions.push({
          project,
          tool: 'Claude Code',
          filePath: 'CLAUDE.md',
          absPath: claudeMdPath,
          action: 'create',
        })
      } else if (!hasPiutReference(claudeMdPath)) {
        actions.push({
          project,
          tool: 'Claude Code',
          filePath: 'CLAUDE.md',
          absPath: claudeMdPath,
          action: 'append',
        })
      }
    }
  }

  if (actions.length === 0) {
    console.log(dim('  All projects are already connected.'))
    console.log()
    return
  }

  // Group by project for display
  const byProject = new Map<string, ConnectAction[]>()
  for (const action of actions) {
    const key = action.project.path
    if (!byProject.has(key)) byProject.set(key, [])
    byProject.get(key)!.push(action)
  }

  console.log()
  console.log(`  Found ${brand.bold(String(byProject.size))} project(s) to connect:`)
  console.log()

  const projectChoices: { name: string; value: string; checked: boolean }[] = []

  for (const [projectPath, projectActions] of byProject) {
    const projectName = path.basename(projectPath)
    const desc = projectActions.map(a => {
      const verb = a.action === 'create' ? 'will create' : 'will append to'
      return `${verb} ${a.filePath}`
    }).join(', ')

    projectChoices.push({
      name: `${projectName} ${dim(`(${desc})`)}`,
      value: projectPath,
    })
  }

  let selectedPaths: string[]

  if (options.yes) {
    selectedPaths = Array.from(byProject.keys())
  } else {
    selectedPaths = await checkbox({
      message: 'Select projects to connect:',
      choices: projectChoices,
    })

    if (selectedPaths.length === 0) {
      console.log(dim('  No projects selected.'))
      return
    }
  }

  // Apply
  console.log()
  let connected = 0
  const copilotTool = TOOLS.find(t => t.id === 'copilot')

  for (const projectPath of selectedPaths) {
    const projectActions = byProject.get(projectPath) || []
    const projectName = path.basename(projectPath)

    // Create .piut/ directory with credentials and skill file
    writePiutConfig(projectPath, { slug, apiKey, serverUrl })
    await writePiutSkill(projectPath, slug, apiKey)
    ensureGitignored(projectPath)
    console.log(success(`  ✓ ${projectName}/.piut/`) + dim(' — credentials + skill'))

    // Write Copilot project-local MCP config if applicable
    if (copilotTool) {
      const hasCopilot = fs.existsSync(path.join(projectPath, '.github', 'copilot-instructions.md'))
        || fs.existsSync(path.join(projectPath, '.github'))
      if (hasCopilot) {
        const vscodeMcpPath = path.join(projectPath, '.vscode', 'mcp.json')
        const serverConfig = copilotTool.generateConfig(slug, apiKey)
        mergeConfig(vscodeMcpPath, copilotTool.configKey, serverConfig)
        console.log(success(`  ✓ ${projectName}/.vscode/mcp.json`) + dim(' — Copilot MCP'))
      }
    }

    for (const action of projectActions) {
      if (action.action === 'create') {
        // For dedicated files (cursor, windsurf, zed), create with full content
        // For CLAUDE.md that doesn't exist, also create
        const isAppendType = RULE_FILES.find(r => r.filePath === action.filePath)?.strategy === 'append'
        const content = isAppendType ? PROJECT_SKILL_SNIPPET + '\n' : DEDICATED_FILE_CONTENT

        fs.mkdirSync(path.dirname(action.absPath), { recursive: true })
        fs.writeFileSync(action.absPath, content, 'utf-8')
        console.log(success(`  ✓ ${projectName}/${action.filePath}`) + dim(' — created'))
      } else {
        // Append
        fs.appendFileSync(action.absPath, APPEND_SECTION)
        console.log(success(`  ✓ ${projectName}/${action.filePath}`) + dim(' — appended'))
      }
      connected++
    }
  }

  console.log()
  console.log(success(`  Done. ${selectedPaths.length} project(s) connected.`))
  console.log()
}
