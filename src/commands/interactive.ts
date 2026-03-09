import { select, confirm, Separator } from '@inquirer/prompts'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import chalk from 'chalk'
import { validateKey, unpublishServer, pingMcp, getBrain, cleanBrain, deleteConnections, registerProject, unregisterProject, getMachineId, listVaultFiles, uploadVaultFile, deleteVaultFile } from '../lib/api.js'
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
import { connectAll } from '../lib/discovery.js'
import { scanForProjects } from '../lib/brain-scanner.js'
import { writePiutConfig, writePiutSkill, ensureGitignored, hasPiutDir, removePiutDir } from '../lib/piut-dir.js'
import { syncStaleConfigs, cycleMcpConfigs, cycleProjectConfigs, getConfiguredToolNames } from '../lib/sync.js'
import { publishServer } from '../lib/api.js' // used in deploy flow
import { offerGlobalInstall } from '../lib/global-install.js'
import { PROJECT_SKILL_SNIPPET } from '../lib/skill.js'
import { CliError } from '../types.js'
import type { ValidateResponse } from '../types.js'

/** Document formats that require server-side parsing (sent as base64). */
const DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'docx', 'doc', 'pptx', 'pages', 'key', 'rtf', 'odt', 'odp', 'eml', 'mbox',
])

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

  // Silently fix any tool/project configs with stale keys or slugs
  const synced = syncStaleConfigs(
    currentValidation.slug,
    apiKey,
    currentValidation.serverUrl,
  )
  if (synced.length > 0) {
    console.log(dim(`  Updated ${synced.length} stale config(s): ${synced.join(', ')}`))
  }

  // Offer global `piut` command if not already installed
  await offerGlobalInstall()

  // Silent auto-refresh: republish server, cycle tools + projects
  const configuredTools = getConfiguredToolNames()
  const isDeployed = currentValidation.status === 'active'

  if (configuredTools.length > 0 || isDeployed) {
    const parts: string[] = []

    // Republish server if deployed
    if (isDeployed) {
      try {
        await publishServer(apiKey)
        parts.push('server')
      } catch { /* silent */ }
    }

    // Cycle tool configs
    if (configuredTools.length > 0) {
      await cycleMcpConfigs(currentValidation.slug, apiKey)
      parts.push(`${configuredTools.length} tool(s)`)
    }

    // Refresh connected projects
    const refreshedProjects = await cycleProjectConfigs(
      currentValidation.slug,
      apiKey,
      currentValidation.serverUrl,
    )
    if (refreshedProjects.length > 0) {
      parts.push(`${refreshedProjects.length} project(s)`)
    }

    if (parts.length > 0) {
      console.log(dim(`  Refreshed: ${parts.join(', ')}`))
    }
  }

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
            name: 'My Brain',
            value: 'view-brain' as const,
            description: 'View all 5 brain sections',
            disabled: !hasBrain && '(build brain first)',
          },
          {
            name: 'Build Brain',
            value: 'build' as const,
            description: hasBrain ? 'Rebuild your brain from your files' : 'Build your brain from your files',
          },
          {
            name: 'Edit Brain',
            value: 'edit-brain' as const,
            description: 'Open piut.com to edit your brain',
            disabled: !hasBrain && '(build brain first)',
          },
          {
            name: 'Clean Brain',
            value: 'clean-brain' as const,
            description: 'Remove duplicates, fix formatting, flag contradictions',
            disabled: !hasBrain && '(build brain first)',
          },
          new Separator(),
          {
            name: isDeployed ? 'Undeploy Brain' : 'Deploy Brain',
            value: 'deploy' as const,
            description: isDeployed
              ? 'Take your MCP server offline'
              : 'Publish your MCP server (requires paid account)',
          },
          new Separator(),
          {
            name: 'Connect Tools + Projects',
            value: 'connect-all' as const,
            description: 'Connect all detected AI tools and projects to your brain',
            disabled: !isDeployed && '(deploy brain first)',
          },
          {
            name: 'Disconnect Tools + Projects',
            value: 'disconnect-all' as const,
            description: 'Remove all p\u0131ut connections from tools and projects',
            disabled: !isDeployed && '(deploy brain first)',
          },
          new Separator(),
          {
            name: 'View Files',
            value: 'vault-view' as const,
            description: 'List and manage files in your vault',
          },
          {
            name: 'Upload Files',
            value: 'vault-upload' as const,
            description: 'Upload a file to your vault',
          },
          new Separator(),
          {
            name: 'Status',
            value: 'status' as const,
            description: 'Show brain, deployment, and connected tools/projects',
          },
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
        case 'view-brain':
          await handleViewBrain(apiKey)
          break
        case 'build':
          await buildCommand({ key: apiKey })
          break
        case 'edit-brain':
          handleEditBrain()
          break
        case 'clean-brain':
          await handleCleanBrain(apiKey)
          break
        case 'deploy':
          if (isDeployed) {
            await handleUndeploy(apiKey)
          } else {
            await deployCommand({ key: apiKey })
          }
          break
        case 'connect-all':
          await handleConnectAll(apiKey, currentValidation)
          break
        case 'disconnect-all':
          await handleDisconnectAll(apiKey, currentValidation)
          break
        case 'vault-view':
          await handleVaultView(apiKey)
          break
        case 'vault-upload':
          await handleVaultUpload(apiKey)
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
        const errMsg = err instanceof Error ? err.message : String(err)
        console.log(chalk.red(`  Error: ${errMsg || 'An unexpected error occurred'}`))
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
// Connect Tools + Projects — all-or-nothing (no individual selection)
// ---------------------------------------------------------------------------

async function handleConnectAll(apiKey: string, validation: ValidateResponse): Promise<void> {
  // Connect all tools first
  await connectAll(validation.slug, apiKey, validation)

  // Then connect all projects
  const projects = scanForProjects()
  const unconnected = projects.filter(p => !hasPiutDir(p.path))

  if (unconnected.length === 0) {
    if (projects.length > 0) {
      console.log(dim(`  All ${projects.length} project(s) already connected.`))
    } else {
      console.log(dim('  No projects found.'))
    }
    console.log()
    return
  }

  const projectNames = unconnected.map(p => path.basename(p.path)).join(', ')
  console.log(dim(`  Projects to connect: ${projectNames}`))
  console.log()

  const proceed = await confirm({
    message: `Connect ${unconnected.length} project${unconnected.length === 1 ? '' : 's'}?`,
    default: true,
  })

  if (!proceed) {
    console.log(dim('  Skipped.'))
    console.log()
    return
  }

  console.log()
  const copilotTool = TOOLS.find(t => t.id === 'copilot')

  for (const project of unconnected) {
    const projectName = path.basename(project.path)
    writePiutConfig(project.path, { slug: validation.slug, apiKey, serverUrl: validation.serverUrl })
    await writePiutSkill(project.path, validation.slug, apiKey)
    ensureGitignored(project.path)

    if (copilotTool) {
      const hasCopilot = fs.existsSync(path.join(project.path, '.github', 'copilot-instructions.md'))
        || fs.existsSync(path.join(project.path, '.github'))
      if (hasCopilot) {
        const vscodeMcpPath = path.join(project.path, '.vscode', 'mcp.json')
        const serverConfig = copilotTool.generateConfig!(validation.slug, apiKey)
        mergeConfig(vscodeMcpPath, copilotTool.configKey!, serverConfig)
      }
    }

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

  console.log()
  console.log(success(`  ${unconnected.length} project(s) connected.`))
  console.log()
}

// ---------------------------------------------------------------------------
// Disconnect Tools + Projects — all-or-nothing
// ---------------------------------------------------------------------------

async function handleDisconnectAll(apiKey: string, validation: ValidateResponse): Promise<void> {
  // Gather what's connected
  const { detectTools } = await import('../lib/discovery.js')
  const detectedTools = detectTools()
  const connectedTools = detectedTools.filter(d => !d.tool.skillOnly && d.alreadyConfigured)

  const projects = scanForProjects()
  const connectedProjects = projects.filter(p => hasPiutDir(p.path))

  if (connectedTools.length === 0 && connectedProjects.length === 0) {
    console.log(dim('  Nothing is connected.'))
    console.log()
    return
  }

  // Show what will be disconnected
  if (connectedTools.length > 0) {
    console.log(dim(`  Tools: ${connectedTools.map(d => d.tool.name).join(', ')}`))
  }
  if (connectedProjects.length > 0) {
    console.log(dim(`  Projects: ${connectedProjects.map(p => path.basename(p.path)).join(', ')}`))
  }
  console.log()

  const proceed = await confirm({
    message: `Disconnect ${connectedTools.length} tool(s) and ${connectedProjects.length} project(s)?`,
    default: false,
  })

  if (!proceed) {
    console.log(dim('  Cancelled.'))
    console.log()
    return
  }

  console.log()

  // Disconnect tools
  const removedNames: string[] = []
  for (const { tool, configPath, resolvedConfigKey } of connectedTools) {
    if (!resolvedConfigKey) continue
    const removed = removeFromConfig(configPath, resolvedConfigKey)
    if (removed) {
      removedNames.push(tool.name)
      toolLine(tool.name, warning('disconnected'), '\u2714')
    }
  }

  if (removedNames.length > 0) {
    deleteConnections(apiKey, removedNames).catch(() => {})
  }

  // Disconnect projects
  for (const project of connectedProjects) {
    const projectName = path.basename(project.path)

    for (const dedicatedFile of DEDICATED_FILES) {
      const absPath = path.join(project.path, dedicatedFile)
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) {
        try { fs.unlinkSync(absPath) } catch { /* ignore */ }
      }
    }

    for (const appendFile of APPEND_FILES) {
      const absPath = path.join(project.path, appendFile)
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) {
        removePiutSection(absPath)
      }
    }

    const vscodeMcpPath = path.join(project.path, '.vscode', 'mcp.json')
    if (fs.existsSync(vscodeMcpPath) && isPiutConfigured(vscodeMcpPath, 'servers')) {
      removeFromConfig(vscodeMcpPath, 'servers')
    }

    removePiutDir(project.path)
    toolLine(projectName, warning('disconnected'), '\u2714')

    const machineId = getMachineId()
    unregisterProject(apiKey, project.path, machineId).catch(() => {})
  }

  console.log()
  console.log(dim('  Restart your AI tools for changes to take effect.'))
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
// Clean Brain — deduplicate, format, flag contradictions
// ---------------------------------------------------------------------------

async function handleCleanBrain(apiKey: string): Promise<void> {
  const shouldContinue = await confirm({
    message: 'This will clean up your brain by removing duplicates, fixing formatting, and flagging contradictions. You can revert this change from history. Continue?',
    default: false,
  })

  if (!shouldContinue) {
    console.log(dim('  Cancelled.'))
    console.log()
    return
  }

  const spinner = new Spinner()
  spinner.start('  Cleaning brain...')

  try {
    const result = await cleanBrain(apiKey)
    spinner.stop()

    console.log(success(`  ✓ ${result.summary}`))
    console.log()

    // Show stats
    const { stats } = result
    const statParts: string[] = []
    if (stats.duplicatesRemoved > 0) statParts.push(`${stats.duplicatesRemoved} duplicate${stats.duplicatesRemoved === 1 ? '' : 's'} removed`)
    if (stats.sectionsReorganized > 0) statParts.push(`${stats.sectionsReorganized} section${stats.sectionsReorganized === 1 ? '' : 's'} reorganized`)
    if (stats.contradictionsFound > 0) statParts.push(`${stats.contradictionsFound} contradiction${stats.contradictionsFound === 1 ? '' : 's'} found`)

    if (statParts.length > 0) {
      console.log(dim(`  ${statParts.join(' · ')}`))
    }

    // Show contradictions if any
    if (result.contradictions.length > 0) {
      console.log()
      console.log(warning('  Contradictions detected:'))
      for (const c of result.contradictions) {
        console.log(dim(`  [${c.section}] ${c.description}`))
      }
    }

    console.log()
  } catch (err) {
    spinner.stop()
    throw err
  }
}

// ---------------------------------------------------------------------------
// File Vault — list, upload, delete from interactive menu
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function handleVaultView(apiKey: string): Promise<void> {
  const data = await listVaultFiles(apiKey)

  if (data.files.length === 0) {
    console.log(dim('  Vault is empty. Use "Upload Files" to add files.'))
    console.log()
    return
  }

  // Show files and usage
  console.log()
  for (const file of data.files) {
    const size = dim(`(${formatSize(file.sizeBytes)})`)
    console.log(`  ${file.filename}  ${size}`)
    if (file.summary) console.log(dim(`    ${file.summary}`))
  }
  console.log()
  console.log(dim(`  ${data.usage.fileCount} file(s), ${formatSize(data.usage.totalBytes)} / ${formatSize(data.usage.maxBytes)} used`))
  console.log()

  const action = await select({
    message: 'Actions:',
    choices: [
      { name: 'Delete a file', value: 'delete' as const },
      { name: 'Back', value: 'back' as const },
    ],
  })

  if (action === 'back') return

  if (action === 'delete') {
    const fileChoices = data.files.map(f => ({
      name: `${f.filename}  ${dim(`(${formatSize(f.sizeBytes)})`)}`,
      value: f.filename,
    }))

    const filename = await select({
      message: 'Which file to delete?',
      choices: fileChoices,
    })

    const confirmed = await confirm({
      message: `Delete "${filename}"? This cannot be undone.`,
      default: false,
    })

    if (confirmed) {
      try {
        await deleteVaultFile(apiKey, filename)
        console.log(success(`  Deleted ${filename}`))
        console.log()
      } catch (err: unknown) {
        console.log(chalk.red(`  ${(err as Error).message}`))
        console.log()
      }
    }
  }
}

async function handleVaultUpload(apiKey: string): Promise<void> {
  const treePrompt = (await import('../lib/tree-prompt.js')).default

  const files = await treePrompt({
    message: 'Select files to upload:',
    mode: 'files',
  })

  if (files.length === 0) {
    console.log(dim('  No files selected.'))
    console.log()
    return
  }

  console.log()
  let uploaded = 0
  for (const filePath of files) {
    const filename = path.basename(filePath)
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() || '' : ''
    const isDocument = DOCUMENT_EXTENSIONS.has(ext)

    let content: string
    let encoding: 'base64' | 'utf8' | undefined
    if (isDocument) {
      content = fs.readFileSync(filePath).toString('base64')
      encoding = 'base64'
    } else {
      content = fs.readFileSync(filePath, 'utf-8')
    }

    const spinner = new Spinner()
    spinner.start(`Uploading ${filename}...`)
    try {
      const result = await uploadVaultFile(apiKey, filename, content, encoding)
      spinner.stop()
      console.log(success(`  Uploaded ${result.filename}`) + dim(` (${formatSize(result.sizeBytes)})`))
      if (result.summary) console.log(dim(`  ${result.summary}`))
      uploaded++
    } catch (err: unknown) {
      spinner.stop()
      console.log(chalk.red(`  ${(err as Error).message}`))
    }
  }

  if (uploaded > 0) {
    console.log()
    console.log(success(`  ${uploaded} file${uploaded === 1 ? '' : 's'} uploaded to vault.`))
  }
  console.log()
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
