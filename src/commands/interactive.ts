import { select, confirm, checkbox, password } from '@inquirer/prompts'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { validateKey, unpublishServer, pingMcp, getBrain, publishServer } from '../lib/api.js'
import { readStore, updateStore } from '../lib/store.js'
import { banner, brand, success, dim, warning, toolLine } from '../lib/ui.js'
import { buildCommand } from './build.js'
import { deployCommand } from './deploy.js'
import { connectCommand } from './connect.js'
import { disconnectCommand } from './disconnect.js'
import { statusCommand } from './status.js'
import { logoutCommand } from './logout.js'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { isPiutConfigured, mergeConfig, removeFromConfig } from '../lib/config.js'
import { CliError } from '../types.js'
import type { ValidateResponse } from '../types.js'

interface AuthResult {
  apiKey: string
  validation: ValidateResponse
}

async function authenticate(): Promise<AuthResult> {
  const config = readStore()
  let apiKey = config.apiKey

  if (apiKey) {
    // Validate saved key still works
    try {
      const result = await validateKey(apiKey)
      console.log(success(`  Connected as ${result.displayName}`))
      return { apiKey, validation: result }
    } catch {
      console.log(dim('  Saved key expired. Please re-authenticate.'))
      apiKey = undefined
    }
  }

  console.log(dim('  Connect to pıut:'))
  console.log(dim('    > Log in at piut.com'))
  console.log(dim('    > Enter pıut API key'))
  console.log()

  apiKey = await password({
    message: 'Enter your pıut API key:',
    mask: '*',
    validate: (v) => v.startsWith('pb_') || 'Key must start with pb_',
  })

  console.log(dim('  Validating key...'))
  let result: ValidateResponse
  try {
    result = await validateKey(apiKey)
  } catch (err: unknown) {
    console.log(chalk.red(`  \u2717 ${(err as Error).message}`))
    console.log(dim('  Get a key at https://piut.com/dashboard/keys'))
    process.exit(1)
  }

  console.log(success(`  \u2713 Connected as ${result.displayName}`))
  updateStore({ apiKey })

  return { apiKey, validation: result }
}

/** Check if an error is from the user pressing Ctrl+C in a prompt */
function isPromptCancellation(err: unknown): boolean {
  return !!(err && typeof err === 'object' && 'name' in err && (err as Error).name === 'ExitPromptError')
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
        choices: [
          {
            name: hasBrain ? 'Rebuild Brain' : 'Build Brain',
            value: 'build' as const,
            description: hasBrain ? 'Rebuild your brain from your files' : 'Build your brain from your files',
          },
          {
            name: isDeployed ? 'Undeploy Brain' : 'Deploy Brain',
            value: 'deploy' as const,
            description: isDeployed
              ? 'Take your MCP server offline'
              : 'Publish your MCP server (requires paid account)',
          },
          {
            name: 'Connect Tools',
            value: 'connect-tools' as const,
            description: 'Configure AI tools to use your MCP server',
            disabled: !isDeployed && '(deploy brain first)',
          },
          {
            name: 'Disconnect Tools',
            value: 'disconnect-tools' as const,
            description: 'Remove pıut from AI tool configs',
            disabled: !isDeployed && '(deploy brain first)',
          },
          {
            name: 'Connect Projects',
            value: 'connect-projects' as const,
            description: 'Add brain references to project config files',
            disabled: !isDeployed && '(deploy brain first)',
          },
          {
            name: 'Disconnect Projects',
            value: 'disconnect-projects' as const,
            description: 'Remove brain references from project configs',
            disabled: !isDeployed && '(deploy brain first)',
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
          {
            name: 'Logout',
            value: 'logout' as const,
            description: 'Remove saved API key',
          },
          {
            name: 'Exit',
            value: 'exit' as const,
            description: 'Quit pıut CLI',
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
          await buildCommand({ key: apiKey })
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
        case 'disconnect-tools':
          await handleDisconnectTools()
          break
        case 'connect-projects':
          await connectCommand({ key: apiKey })
          break
        case 'disconnect-projects':
          await disconnectCommand({})
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

async function handleConnectTools(apiKey: string, validation: ValidateResponse): Promise<void> {
  const { slug } = validation

  const unconfigured: { tool: (typeof TOOLS)[0]; configPath: string }[] = []
  const alreadyConnected: string[] = []

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool.configPaths)
    for (const configPath of paths) {
      const exists = fs.existsSync(configPath)
      const parentExists = fs.existsSync(path.dirname(configPath))
      if (exists || parentExists) {
        if (exists && isPiutConfigured(configPath, tool.configKey)) {
          alreadyConnected.push(tool.name)
        } else {
          unconfigured.push({ tool, configPath })
        }
        break
      }
    }
  }

  if (unconfigured.length === 0) {
    if (alreadyConnected.length > 0) {
      console.log(dim('  All detected tools are already connected.'))
    } else {
      console.log(warning('  No supported AI tools detected.'))
      console.log(dim('  Supported: Claude Code, Claude Desktop, Cursor, Windsurf, GitHub Copilot, Amazon Q, Zed'))
    }
    console.log()
    return
  }

  if (alreadyConnected.length > 0) {
    console.log(dim(`  Already connected: ${alreadyConnected.join(', ')}`))
    console.log()
  }

  const choices = unconfigured.map(u => ({
    name: u.tool.name,
    value: u,
    checked: true,
  }))

  const selected = await checkbox({
    message: 'Select tools to connect:',
    choices,
  })

  if (selected.length === 0) {
    console.log(dim('  No tools selected.'))
    return
  }

  console.log()
  for (const { tool, configPath } of selected) {
    const serverConfig = tool.generateConfig(slug, apiKey)
    mergeConfig(configPath, tool.configKey, serverConfig)
    toolLine(tool.name, success('connected'), '\u2714')
  }

  // Register tool connections with the server (fire-and-forget)
  if (validation.serverUrl) {
    await Promise.all(
      selected.map(({ tool }) => pingMcp(validation.serverUrl, apiKey, tool.name))
    )
  }

  console.log()
  console.log(dim('  Restart your AI tools for changes to take effect.'))
  console.log()
}

async function handleDisconnectTools(): Promise<void> {
  const configured: { tool: (typeof TOOLS)[0]; configPath: string }[] = []

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool.configPaths)
    for (const configPath of paths) {
      if (fs.existsSync(configPath) && isPiutConfigured(configPath, tool.configKey)) {
        configured.push({ tool, configPath })
        break
      }
    }
  }

  if (configured.length === 0) {
    console.log(dim('  pıut is not configured in any detected AI tools.'))
    console.log()
    return
  }

  const choices = configured.map(c => ({
    name: c.tool.name,
    value: c,
  }))

  const selected = await checkbox({
    message: 'Select tools to disconnect:',
    choices,
  })

  if (selected.length === 0) {
    console.log(dim('  No tools selected.'))
    return
  }

  const proceed = await confirm({
    message: `Disconnect pıut from ${selected.length} tool(s)?`,
    default: false,
  })
  if (!proceed) return

  console.log()
  for (const { tool, configPath } of selected) {
    const removed = removeFromConfig(configPath, tool.configKey)
    if (removed) {
      toolLine(tool.name, success('disconnected'), '\u2714')
    } else {
      toolLine(tool.name, warning('not found'), '\u00d7')
    }
  }

  console.log()
  console.log(dim('  Restart your AI tools for changes to take effect.'))
  console.log()
}

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
      console.log(dim(`  ${label} — (empty)`))
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
        console.log(success('  ✓ Brain published.'))
        console.log()
      } catch (err: unknown) {
        console.log()
        const msg = (err as Error).message
        if (msg === 'REQUIRES_SUBSCRIPTION') {
          console.log(chalk.yellow('  Deploy requires an active subscription ($10/mo).'))
          console.log(`  Subscribe at: ${brand('https://piut.com/dashboard/billing')}`)
          console.log(dim('  14-day free trial included.'))
        } else {
          console.log(chalk.red(`  ✗ ${msg}`))
        }
        console.log()
      }
    }
  }
}
