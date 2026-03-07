import { confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import { publishServer } from '../lib/api.js'
import { banner, brand, success, dim, warning } from '../lib/ui.js'
import { resolveApiKeyWithResult } from '../lib/auth.js'

interface DeployOptions {
  key?: string
  yes?: boolean
}

export async function deployCommand(options: DeployOptions): Promise<void> {
  banner()

  const { apiKey, slug, serverUrl, status } = await resolveApiKeyWithResult(options.key)

  if (status === 'no_brain') {
    console.log()
    console.log(warning('  You haven\u2019t built a brain yet.'))
    console.log(dim('  Run ') + brand('piut build') + dim(' first to create your brain, then deploy.'))
    console.log()
    return
  }

  console.log()
  console.log(dim('  Your brain will be published as an MCP server at:'))
  console.log(`  ${brand(serverUrl)}`)
  console.log()
  console.log(dim('  Any AI tool with this URL can read your brain.'))
  console.log()

  if (!options.yes) {
    const proceed = await confirm({
      message: 'Deploy?',
      default: true,
    })
    if (!proceed) {
      console.log(dim('  Cancelled.'))
      return
    }
  }

  try {
    await publishServer(apiKey)
    console.log()
    console.log(success('  ✓ Brain deployed. MCP server live.'))
    console.log(dim(`  URL: ${serverUrl}`))
    console.log()
    console.log(dim('  Next: run ') + brand('piut connect') + dim(' to add brain references to your projects.'))
    console.log()
  } catch (err: unknown) {
    const msg = (err as Error).message
    if (msg === 'REQUIRES_SUBSCRIPTION') {
      console.log()
      console.log(chalk.yellow('  Deploy requires an active subscription ($10/mo).'))
      console.log()
      console.log(`  Subscribe at: ${brand('https://piut.com/dashboard/billing')}`)
      console.log(dim('  14-day free trial included.'))
      console.log()
    } else {
      console.log(chalk.red(`  ✗ ${msg}`))
      process.exit(1)
    }
  }
}
