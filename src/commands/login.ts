import chalk from 'chalk'
import { promptLogin } from '../lib/auth.js'
import { updateStore } from '../lib/store.js'
import { success, dim } from '../lib/ui.js'
import { CliError } from '../types.js'

export async function loginCommand(): Promise<void> {
  try {
    const { apiKey, validation } = await promptLogin()

    const label = validation.slug
      ? `${validation.displayName} (${validation.slug})`
      : validation.displayName
    console.log(success(`  ✓ Connected as ${label}`))

    updateStore({ apiKey })
    console.log(dim('  API key saved. You can now use all pıut commands.'))
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
    throw new CliError((err as Error).message)
  }
}
