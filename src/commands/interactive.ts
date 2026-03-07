import { select, confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import { validateKey } from '../lib/api.js'
import { readStore, updateStore } from '../lib/store.js'
import { banner, brand, success, dim, warning } from '../lib/ui.js'
import { buildCommand } from './build.js'
import { deployCommand } from './deploy.js'
import { connectCommand } from './connect.js'
import { disconnectCommand } from './disconnect.js'
import { statusCommand } from './status.js'
import { password } from '@inquirer/prompts'
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

  console.log(dim('  Connect to p\u0131ut:'))
  console.log(dim('    > Log in at piut.com'))
  console.log(dim('    > Enter p\u0131ut API key'))
  console.log()

  apiKey = await password({
    message: 'Enter your p\u0131ut API key:',
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

export async function interactiveMenu(): Promise<void> {
  banner()

  const { apiKey, validation } = await authenticate()
  console.log()

  // Guide user through onboarding if brain isn't set up yet
  if (validation.status === 'no_brain') {
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
    return
  }

  if (validation.status === 'unpublished') {
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
    return
  }

  // Fully set up — show the main menu
  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: 'Build Brain', value: 'build' as const, description: 'Build or rebuild your brain from your files' },
      { name: 'Deploy Brain', value: 'deploy' as const, description: 'Publish your MCP server (requires paid account)' },
      { name: 'Connect Projects', value: 'connect' as const, description: 'Add brain references to project config files' },
      { name: 'Disconnect Projects', value: 'disconnect' as const, description: 'Remove brain references from project configs' },
      { name: 'Status', value: 'status' as const, description: 'Show brain, deployment, and connected projects' },
    ],
  })

  switch (action) {
    case 'build':
      await buildCommand({ key: apiKey })
      break
    case 'deploy':
      await deployCommand({ key: apiKey })
      break
    case 'connect':
      await connectCommand({ key: apiKey })
      break
    case 'disconnect':
      await disconnectCommand({})
      break
    case 'status':
      statusCommand()
      break
  }
}
