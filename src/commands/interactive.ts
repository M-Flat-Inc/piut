import { select, confirm, checkbox, Separator } from '@inquirer/prompts'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import os from 'os'
import chalk from 'chalk'
import { validateKey, unpublishServer, pingMcp, getBrain, publishServer, deleteConnections, resyncBrain, registerProject, unregisterProject, getMachineId } from '../lib/api.js'
import { readStore, updateStore } from '../lib/store.js'
import { promptLogin } from '../lib/auth.js'
import { banner, brand, success, dim, warning, toolLine, Spinner } from '../lib/ui.js'
import { buildCommand } from './build.js'
import { deployCommand } from './deploy.js'
import { statusCommand } from './status.js'
import { logoutCommand } from './logout.js'
import { RULE_FILES, hasPiutReference, DEDICATED_FILE_CONTENT, APPEND_SECTION } from './connect.js'
import { DEDICATED_FILES, APPEND_FILES, removePiutSection } from './disconnect.js'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { isPiutConfigured, mergeConfig, removeFromConfig } from '../lib/config.js'
import { scanForProjects, scanFolders, buildBrainInput } from '../lib/brain-scanner.js'
import { writePiutConfig, writePiutSkill, ensureGitignored, hasPiutDir, removePiutDir } from '../lib/piut-dir.js'
import { PROJECT_SKILL_SNIPPET } from '../lib/skill.js'
import { CliError } from '../types.js'
import type { ValidateResponse, ProjectInfo } from '../types.js'

interface AuthResult {
  apiKey: string
  validation: ValidateResponse
}

async function authenticate(): Promise<AuthResult> {
  const config = readStore()
  const apiKey = config.apiKey

  if (apiKey) {
    // Validate saved key still works
    try {
      const result = await validateKey(apiKey)
      console.log(success(`  Connected as ${result.displayName}`))
      return { apiKey, validation: result }
    } catch {
      console.log(dim('  Saved key expired. Please re-authenticate.'))
    }
  }

  // No saved key or it expired — prompt for auth method
  const { apiKey: newKey, validation } = await promptLogin()
  const label = validation.slug
    ? `${validation.displayName} (${validation.slug})`
    : validation.displayName
  console.log(success(`  ✓ Connected as ${label}`))
  updateStore({ apiKey: newKey })

  return { apiKey: newKey, validation }
}

/** Check if an error is from the user pressing Ctrl+C in a prompt */
function isPromptCancellation(err: unknown): boolean {
  return !!(err && typeof err === 'object' && 'name' in err && (err as Error).name === 'ExitPromptError')
}

/** Open a URL in the default browser */
function openInBrowser(url: string): void {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open'
  exec(`${cmd} ${url}`)
}

export async function interactiveMenu(): Promise<void> {
  banner()

  let apiKey: string
  let currentValidation: ValidateResponse

  const auth = await authenticate()
  apiKey = auth.apiKey
  currentValidation = auth.validation
  console.log()

  // Guide user through onboarding if brain isn't set up yet
  if (currentValidation.status === 'no_brain') {
    console.log(warning('  You haven\u2019t built a brain yet.'))
    console.log(dim('  Your brain is how AI tools learn about you \u2014 your projects, preferences, and context.'))
    console.log()

    const wantBuild = await confirm({
      message: 'Build your brain now?',
      default: true,
    })

    if (wantBuild) {
      await buildCommand({ key: apiKey })
    } else {
      console.log()
      console.log(dim('  You can build your brain anytime with: ') + brand('piut build'))
      console.log()
    }
  }

  if (currentValidation.status === 'unpublished') {
    console.log(warning('  Your brain is built but not deployed yet.'))
    console.log(dim('  Deploy it to make your MCP server live so AI tools can read your brain.'))
    console.log()

    const wantDeploy = await confirm({
      message: 'Deploy your brain now?',
      default: true,
    })

    if (wantDeploy) {
      await deployCommand({ key: apiKey })
    } else {
      console.log()
      console.log(dim('  You can deploy anytime with: ') + brand('piut deploy'))
      console.log()
    }
  }

  // Main menu loop — returns to menu after each action
  while (true) {
    const hasBrain = currentValidation.status !== 'no_brain'
    const isDeployed = currentValidation.status === 'active'

    // If user presses Ctrl+C on the main menu, exit the CLI
    let action: string
    try {
      action = await select({
        message: 'What would you like to do?',
        loop: false,
        choices: [
          {
            name: hasBrain ? 'Resync Brain' : 'Build Brain',
            value: 'build' as const,
            description: hasBrain ? 'Rescan your files and merge updates into your brain' : 'Build your brain from your files',
          },
          {
            name: isDeployed ? 'Undeploy Brain' : 'Deploy Brain',
            value: 'deploy' as const,
            description: isDeployed
              ? 'Take your MCP server offline'
              : 'Publish your MCP server (requires paid account)',
          },
          new Separator(),
          {
            name: 'Connect Tools',
            value: 'connect-tools' as const,
            description: 'Manage which AI tools use your MCP server',
            disabled: !isDeployed && '(deploy brain first)',
          },
          {
            name: 'Connect Projects',
            value: 'connect-projects' as const,
            description: 'Manage brain references in project config files',
            disabled: !isDeployed && '(deploy brain first)',
          },
          new Separator(),
          {
            name: 'Edit Brain',
            value: 'edit-brain' as const,
            description: 'Open piut.com to edit your brain',
            disabled: !hasBrain && '(build brain first)',
          },
          {
            name: 'View Brain',
            value: 'view-brain' as const,
            description: 'View all 5 brain sections',
            disabled: !hasBrain && '(build brain first)',
          },
          {
            name: 'Status',
            value: 'status' as const,
            description: 'Show brain, deployment, and connected tools/projects',
          },
          new Separator(),
          {
            name: 'Logout',
            value: 'logout' as const,
            description: 'Remove saved API key',
          },
          {
            name: 'Exit',
            value: 'exit' as const,
            description: 'Quit p\u0131ut CLI',
          },
        ],
      })
    } catch {
      // Ctrl+C on main menu — exit cleanly
      return
    }

    if (action === 'exit') return

    // Wrap command dispatch in try/catch so errors always return to menu
    try {
      switch (action) {
        case 'build':
          if (hasBrain) {
            await handleResyncBrain(apiKey, currentValidation)
          } else {
            await buildCommand({ key: apiKey })
          }
          break
        case 'deploy':
          if (isDeployed) {
            await handleUndeploy(apiKey)
          } else {
            await deployCommand({ key: apiKey })
          }
          break
        case 'connect-tools':
          await handleConnectTools(apiKey, currentValidation)
          break
        case 'connect-projects':
          await handleManageProjects(apiKey, currentValidation)
          break
        case 'edit-brain':
          handleEditBrain()
          break
        case 'view-brain':
          await handleViewBrain(apiKey)
          break
        case 'status':
          statusCommand()
          break
        case 'logout':
          await logoutCommand()
          // Re-authenticate after logout
          console.log()
          try {
            const newAuth = await authenticate()
            apiKey = newAuth.apiKey
            currentValidation = newAuth.validation
          } catch {
            // If re-auth fails (Ctrl+C), exit
            return
          }
          break
      }
    } catch (err: unknown) {
      if (isPromptCancellation(err)) {
        // User pressed Ctrl+C on a sub-prompt — return to menu
        console.log()
      } else if (err instanceof CliError) {
        // Expected error — already logged by the command, just return to menu
        console.log()
      } else {
        // Unexpected error — log it, then return to menu
        console.log(chalk.red(`  Error: ${(err as Error).message}`))
        console.log()
      }
    }

    // Refresh validation to pick up status changes (e.g., after deploy/undeploy/build)
    try {
      currentValidation = await validateKey(apiKey)
    } catch {
      // If validation fails, keep the previous state
    }
  }
}

async function handleUndeploy(apiKey: string): Promise<void> {
  const confirmed = await confirm({
    message: 'Undeploy your brain? AI tools will lose access to your MCP server.',
    default: false,
  })
  if (!confirmed) return

  try {
    await unpublishServer(apiKey)
    console.log()
    console.log(success('  \u2713 Brain undeployed. MCP server is offline.'))
    console.log(dim('  Run ') + brand('piut deploy') + dim(' to re-deploy anytime.'))
    console.log()
  } catch (err: unknown) {
    console.log(chalk.red(`  \u2717 ${(err as Error).message}`))
  }
}

// ---------------------------------------------------------------------------
// Connect Tools — unified view (connect + disconnect in one)
// ---------------------------------------------------------------------------

async function handleConnectTools(apiKey: string, validation: ValidateResponse): Promise<void> {
  const { slug } = validation

  type DetectedItem = { tool: (typeof TOOLS)[0]; configPath: string; connected: boolean }
  const detected: DetectedItem[] = []

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool.configPaths)
    for (const configPath of paths) {
      const exists = fs.existsSync(configPath)
      const parentExists = fs.existsSync(path.dirname(configPath))
      if (exists || parentExists) {
        const connected = exists && isPiutConfigured(configPath, tool.configKey)
        detected.push({ tool, configPath, connected })
        break
      }
    }
  }

  if (detected.length === 0) {
    console.log(warning('  No supported AI tools detected.'))
    console.log(dim('  Supported: Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot, Amazon Q, Zed'))
    console.log()
    return
  }

  const connectedCount = detected.filter(d => d.connected).length
  const availableCount = detected.length - connectedCount
  if (connectedCount > 0 || availableCount > 0) {
    const parts: string[] = []
    if (connectedCount > 0) parts.push(`${connectedCount} connected`)
    if (availableCount > 0) parts.push(`${availableCount} available`)
    console.log(dim(`  ${parts.join(', ')}`))
  }
  console.log()

  const choices = detected.map(d => ({
    name: `${d.tool.name}${d.connected ? dim(' (connected)') : ''}`,
    value: d,
    checked: d.connected,
  }))

  const selected = await checkbox({
    message: 'Select tools to keep connected (toggle with space):',
    choices,
  })

  // Determine what changed
  const toConnect = selected.filter(s => !s.connected)
  const toDisconnect = detected.filter(d => d.connected && !selected.includes(d))

  if (toConnect.length === 0 && toDisconnect.length === 0) {
    console.log(dim('  No changes.'))
    console.log()
    return
  }

  console.log()

  // Connect new tools
  for (const { tool, configPath } of toConnect) {
    const serverConfig = tool.generateConfig(slug, apiKey)
    mergeConfig(configPath, tool.configKey, serverConfig)
    toolLine(tool.name, success('connected'), '\u2714')
  }

  // Disconnect removed tools
  const removedNames: string[] = []
  for (const { tool, configPath } of toDisconnect) {
    const removed = removeFromConfig(configPath, tool.configKey)
    if (removed) {
      removedNames.push(tool.name)
      toolLine(tool.name, warning('disconnected'), '\u2714')
    }
  }

  // Register tool connections (fire-and-forget)
  if (toConnect.length > 0 && validation.serverUrl) {
    await Promise.all(
      toConnect.map(({ tool }) => pingMcp(validation.serverUrl, apiKey, tool.name))
    )
  }

  // Clear server-side disconnections (best-effort)
  if (removedNames.length > 0) {
    deleteConnections(apiKey, removedNames).catch(() => {})
  }

  console.log()
  console.log(dim('  Restart your AI tools for changes to take effect.'))
  console.log()
}

// ---------------------------------------------------------------------------
// Connect Projects — unified view (connect + disconnect in one)
// ---------------------------------------------------------------------------

async function handleManageProjects(apiKey: string, validation: ValidateResponse): Promise<void> {
  const { slug, serverUrl } = validation

  console.log(dim('  Scanning for projects...'))

  const projects = scanForProjects()

  if (projects.length === 0) {
    console.log(warning('  No projects found.'))
    console.log(dim('  Try running from a directory with your projects.'))
    console.log()
    return
  }

  // Determine connected status for each project
  type ProjectItem = { project: ProjectInfo; connected: boolean }
  const items: ProjectItem[] = projects.map(p => ({
    project: p,
    connected: hasPiutDir(p.path),
  }))

  const connectedCount = items.filter(i => i.connected).length
  const availableCount = items.length - connectedCount
  const parts: string[] = []
  if (connectedCount > 0) parts.push(`${connectedCount} connected`)
  if (availableCount > 0) parts.push(`${availableCount} available`)
  console.log(dim(`  ${parts.join(', ')}`))
  console.log()

  const choices = items.map(i => ({
    name: `${i.project.name}${i.connected ? dim(' (connected)') : ''}`,
    value: i,
    checked: i.connected,
  }))

  const selected = await checkbox({
    message: 'Select projects to keep connected (toggle with space):',
    choices,
  })

  const toConnect = selected.filter(s => !s.connected)
  const toDisconnect = items.filter(i => i.connected && !selected.includes(i))

  if (toConnect.length === 0 && toDisconnect.length === 0) {
    console.log(dim('  No changes.'))
    console.log()
    return
  }

  console.log()

  // --- Connect new projects ---
  const copilotTool = TOOLS.find(t => t.id === 'copilot')

  for (const { project } of toConnect) {
    const projectName = path.basename(project.path)

    // Create .piut/ directory with credentials and skill file
    writePiutConfig(project.path, { slug, apiKey, serverUrl })
    await writePiutSkill(project.path, slug, apiKey)
    ensureGitignored(project.path)

    // Write Copilot project-local MCP config if applicable
    if (copilotTool) {
      const hasCopilot = fs.existsSync(path.join(project.path, '.github', 'copilot-instructions.md'))
        || fs.existsSync(path.join(project.path, '.github'))
      if (hasCopilot) {
        const vscodeMcpPath = path.join(project.path, '.vscode', 'mcp.json')
        const serverConfig = copilotTool.generateConfig(slug, apiKey)
        mergeConfig(vscodeMcpPath, copilotTool.configKey, serverConfig)
      }
    }

    // Write rule files
    for (const rule of RULE_FILES) {
      if (!rule.detect(project)) continue
      const absPath = path.join(project.path, rule.filePath)
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) continue

      if (rule.strategy === 'create' || !fs.existsSync(absPath)) {
        const isAppendType = rule.strategy === 'append'
        const content = isAppendType ? PROJECT_SKILL_SNIPPET + '\n' : DEDICATED_FILE_CONTENT
        fs.mkdirSync(path.dirname(absPath), { recursive: true })
        fs.writeFileSync(absPath, content, 'utf-8')
      } else {
        fs.appendFileSync(absPath, APPEND_SECTION)
      }
    }

    toolLine(projectName, success('connected'), '\u2714')

    // Register project server-side (best-effort)
    const machineId = getMachineId()
    const toolsDetected = RULE_FILES.filter(r => r.detect(project)).map(r => r.tool)
    registerProject(apiKey, {
      projectName,
      projectPath: project.path,
      machineId,
      toolsDetected,
      configFiles: RULE_FILES.filter(r => r.detect(project)).map(r => r.filePath),
    }).catch(() => {})
  }

  // --- Disconnect removed projects ---
  for (const { project } of toDisconnect) {
    const projectName = path.basename(project.path)

    // Remove dedicated rule files
    for (const dedicatedFile of DEDICATED_FILES) {
      const absPath = path.join(project.path, dedicatedFile)
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) {
        try { fs.unlinkSync(absPath) } catch { /* ignore */ }
      }
    }

    // Remove piut sections from append files
    for (const appendFile of APPEND_FILES) {
      const absPath = path.join(project.path, appendFile)
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) {
        removePiutSection(absPath)
      }
    }

    // Remove .vscode/mcp.json piut config
    const vscodeMcpPath = path.join(project.path, '.vscode', 'mcp.json')
    if (fs.existsSync(vscodeMcpPath) && isPiutConfigured(vscodeMcpPath, 'servers')) {
      removeFromConfig(vscodeMcpPath, 'servers')
    }

    // Remove .piut/ directory
    removePiutDir(project.path)

    toolLine(projectName, warning('disconnected'), '\u2714')

    // Unregister project server-side (best-effort)
    const machineId = getMachineId()
    unregisterProject(apiKey, project.path, machineId).catch(() => {})
  }

  console.log()
  if (toConnect.length > 0) {
    console.log(success(`  ${toConnect.length} project(s) connected.`))
  }
  if (toDisconnect.length > 0) {
    console.log(success(`  ${toDisconnect.length} project(s) disconnected.`))
  }
  console.log()
}

// ---------------------------------------------------------------------------
// Edit Brain — open piut.com in browser
// ---------------------------------------------------------------------------

function handleEditBrain(): void {
  console.log(dim('  Opening piut.com/dashboard...'))
  openInBrowser('https://piut.com/dashboard')
  console.log(success('  \u2713 Opened in browser.'))
  console.log()
}

// ---------------------------------------------------------------------------
// Resync Brain — scan filesystem + merge update via update_brain
// ---------------------------------------------------------------------------

/** Format scan data into a text string suitable for update_brain */
function formatScanContent(input: { summary: { folders: string[]; projects: { name: string; path: string; description: string }[]; configFiles: { name: string; content: string }[]; recentDocuments: { name: string; content: string }[]; personalDocuments?: { name: string; content: string; format: string }[] } }): string {
  const { summary } = input
  const parts: string[] = []

  parts.push('The user has re-scanned their filesystem. Below is updated information about their projects, config files, and documents. Please merge this into the existing brain sections, preserving existing content and updating what has changed.')
  parts.push('')

  if (summary.folders.length > 0) {
    parts.push(`## Folder Structure\n${summary.folders.join('\n')}`)
  }

  if (summary.projects.length > 0) {
    const projectLines = summary.projects.map(p =>
      `- **${p.name}** (${p.path})${p.description ? ` \u2014 ${p.description}` : ''}`
    )
    parts.push(`## Projects Found\n${projectLines.join('\n')}`)
  }

  // Budget per file (same logic as server-side)
  const totalFiles = (summary.configFiles?.length || 0) + (summary.recentDocuments?.length || 0) + (summary.personalDocuments?.length || 0)
  const fileLimit = totalFiles <= 10 ? 10_000 : totalFiles <= 30 ? 5_000 : totalFiles <= 60 ? 3_000 : 2_000

  if (summary.configFiles.length > 0) {
    const configBlocks = summary.configFiles.map(f =>
      `### ${f.name}\n\`\`\`\n${f.content.slice(0, fileLimit)}\n\`\`\``
    )
    parts.push(`## AI Config Files\n${configBlocks.join('\n\n')}`)
  }

  if (summary.recentDocuments.length > 0) {
    const docBlocks = summary.recentDocuments.map(f =>
      `### ${f.name}\n${f.content.slice(0, fileLimit)}`
    )
    parts.push(`## Recent Documents\n${docBlocks.join('\n\n')}`)
  }

  if (summary.personalDocuments && summary.personalDocuments.length > 0) {
    const docBlocks = summary.personalDocuments.map(f =>
      `### ${f.name}\n${f.content.slice(0, fileLimit)}`
    )
    parts.push(`## Personal Documents\n${docBlocks.join('\n\n')}`)
  }

  let result = parts.join('\n\n')

  // Cap at 400K chars (~100K tokens, matching update_brain limit)
  if (result.length > 400_000) {
    result = result.slice(0, 400_000)
  }

  return result
}

async function handleResyncBrain(apiKey: string, validation: ValidateResponse): Promise<void> {
  if (!validation.serverUrl) {
    console.log(warning('  Brain must be deployed before resyncing.'))
    console.log(dim('  Run ') + brand('piut deploy') + dim(' first.'))
    console.log()
    return
  }

  const cwd = process.cwd()
  const cwdDisplay = cwd.replace(os.homedir(), '~')

  console.log(dim(`  Scanning ${cwdDisplay}...`))

  // Scan filesystem (same as build)
  const scanResult = await scanFolders([cwd])
  const allFolderPaths = scanResult.folders.map(f => f.path)
  const brainInput = buildBrainInput(scanResult, allFolderPaths)

  const projCount = brainInput.summary.projects.length
  const cfgCount = brainInput.summary.configFiles.length
  const dcCount = (brainInput.summary.personalDocuments?.length || 0) + brainInput.summary.recentDocuments.length

  console.log(success(`  Scanned: ${projCount} projects, ${cfgCount} config files, ${dcCount} docs`))
  console.log()

  if (projCount === 0 && cfgCount === 0) {
    console.log(chalk.yellow('  No projects or config files found to resync from.'))
    console.log()
    return
  }

  // Format scan data for update_brain
  const content = formatScanContent(brainInput)

  const spinner = new Spinner()
  spinner.start('Resyncing brain...')

  try {
    const result = await resyncBrain(validation.serverUrl, apiKey, content)
    spinner.stop()

    console.log()
    console.log(success('  \u2713 Brain resynced.'))
    console.log(dim(`  ${result.summary}`))
    console.log()
  } catch (err: unknown) {
    spinner.stop()
    const msg = (err as Error).message
    console.log(chalk.red(`  \u2717 ${msg}`))
    console.log()
    throw new CliError(msg)
  }
}

// ---------------------------------------------------------------------------
// View Brain
// ---------------------------------------------------------------------------

async function handleViewBrain(apiKey: string): Promise<void> {
  console.log(dim('  Loading brain...'))

  const { sections, hasUnpublishedChanges } = await getBrain(apiKey)

  const SECTION_LABELS: Record<string, string> = {
    about: 'About',
    soul: 'Soul',
    areas: 'Areas of Responsibility',
    projects: 'Projects',
    memory: 'Memory',
  }

  console.log()
  for (const [key, label] of Object.entries(SECTION_LABELS)) {
    const content = (sections as Record<string, string>)[key] || ''
    if (!content.trim()) {
      console.log(dim(`  ${label} \u2014 (empty)`))
    } else {
      console.log(success(`  ${label}`))
      for (const line of content.split('\n')) {
        console.log(`    ${line}`)
      }
    }
    console.log()
  }

  console.log(dim(`  Edit at ${brand('piut.com/dashboard')}`))
  console.log()

  if (hasUnpublishedChanges) {
    console.log(warning('  You have unpublished changes.'))
    console.log()

    const wantPublish = await confirm({
      message: 'Publish now?',
      default: true,
    })

    if (wantPublish) {
      try {
        await publishServer(apiKey)
        console.log()
        console.log(success('  \u2713 Brain published.'))
        console.log()
      } catch (err: unknown) {
        console.log()
        const msg = (err as Error).message
        if (msg === 'REQUIRES_SUBSCRIPTION') {
          console.log(chalk.yellow('  Deploy requires an active subscription ($10/mo).'))
          console.log(`  Subscribe at: ${brand('https://piut.com/dashboard/billing')}`)
          console.log(dim('  14-day free trial included.'))
        } else {
          console.log(chalk.red(`  \u2717 ${msg}`))
        }
        console.log()
      }
    }
  }
}
