import { password } from '@inquirer/prompts'
import chalk from 'chalk'
import { validateKey } from './api.js'
import { readStore, updateStore } from './store.js'
import { success, dim } from './ui.js'

/** Resolve API key from option, saved config, or interactive prompt. Validates and saves. */
export async function resolveApiKey(keyOption?: string): Promise<string> {
  const config = readStore()
  let apiKey = keyOption || config.apiKey

  if (!apiKey) {
    apiKey = await password({
      message: 'Enter your pıut API key:',
      mask: '*',
      validate: (v) => v.startsWith('pb_') || 'Key must start with pb_',
    })
  }

  // Validate
  console.log(dim('  Validating key...'))
  let result
  try {
    result = await validateKey(apiKey)
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
    console.log(dim('  Get a key at https://piut.com/dashboard/keys'))
    process.exit(1)
  }

  const label = result.slug
    ? `${result.displayName} (${result.slug})`
    : result.displayName
  console.log(success(`  ✓ Connected as ${label}`))

  // Save key for future use
  updateStore({ apiKey })

  return apiKey
}

/** Resolve API key and return both key and validation result. */
export async function resolveApiKeyWithResult(keyOption?: string) {
  const config = readStore()
  let apiKey = keyOption || config.apiKey

  if (!apiKey) {
    apiKey = await password({
      message: 'Enter your pıut API key:',
      mask: '*',
      validate: (v) => v.startsWith('pb_') || 'Key must start with pb_',
    })
  }

  console.log(dim('  Validating key...'))
  let result
  try {
    result = await validateKey(apiKey)
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
    console.log(dim('  Get a key at https://piut.com/dashboard/keys'))
    process.exit(1)
  }

  const label = result.slug
    ? `${result.displayName} (${result.slug})`
    : result.displayName
  console.log(success(`  ✓ Connected as ${label}`))
  updateStore({ apiKey })

  return { apiKey, ...result }
}
