import chalk from 'chalk'
import { publishServer } from '../lib/api.js'
import { banner, brand, success, dim, warning } from '../lib/ui.js'
import { resolveApiKeyWithResult } from '../lib/auth.js'
import { CliError } from '../types.js'

interface DeployOptions {
  key?: string
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

  try {
    await publishServer(apiKey)
    console.log()
    console.log(success('  ✓ Brain deployed. MCP server live.'))
    console.log(`  ${brand(serverUrl)}`)
    console.log(dim('  (securely accessible only with authentication)'))
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
      throw new CliError(msg)
    }
  }
}
