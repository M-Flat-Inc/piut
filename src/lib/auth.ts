import { select, input, password } from '@inquirer/prompts'
import { exec } from 'child_process'
import chalk from 'chalk'
import { validateKey, loginWithEmail } from './api.js'
import { readStore, updateStore } from './store.js'
import { success, dim, brand } from './ui.js'
import { CliError } from '../types.js'
import type { ValidateResponse } from '../types.js'

/** Open a URL in the user's default browser. */
function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open'
  exec(`${cmd} "${url}"`)
}

/** Prompt for email + password, authenticate via API, return key + validation. */
async function loginWithEmailFlow(): Promise<{ apiKey: string; validation: ValidateResponse }> {
  const email = await input({
    message: 'Email:',
    validate: (v) => v.includes('@') || 'Enter a valid email address',
  })

  const pw = await password({
    message: 'Password:',
    mask: '*',
  })

  console.log(dim('  Authenticating...'))

  const result = await loginWithEmail(email, pw)

  return {
    apiKey: result.apiKey,
    validation: {
      slug: result.slug,
      displayName: result.displayName,
      serverUrl: result.serverUrl,
      planType: result.planType,
      status: result.status,
      _contractVersion: result._contractVersion,
    },
  }
}

/** Prompt for API key, validate it, return key + validation. */
async function pasteKeyFlow(): Promise<{ apiKey: string; validation: ValidateResponse }> {
  const apiKey = await password({
    message: 'Enter your pıut API key:',
    mask: '*',
    validate: (v) => v.startsWith('pb_') || 'Key must start with pb_',
  })

  console.log(dim('  Validating key...'))
  const validation = await validateKey(apiKey)

  return { apiKey, validation }
}

/** Open the dashboard in browser, then prompt to paste API key. */
async function browserFlow(): Promise<{ apiKey: string; validation: ValidateResponse }> {
  const url = 'https://piut.com/dashboard/keys'
  console.log(dim(`  Opening ${brand(url)}...`))
  openBrowser(url)
  console.log(dim('  Copy your API key from the dashboard, then paste it here.'))
  console.log()

  return pasteKeyFlow()
}

export type AuthMethod = 'email' | 'browser' | 'api-key'

/** Prompt user to choose an authentication method and authenticate. */
export async function promptLogin(): Promise<{ apiKey: string; validation: ValidateResponse }> {
  const method = await select<AuthMethod>({
    message: 'How would you like to connect?',
    choices: [
      {
        name: 'Log in with email',
        value: 'email' as const,
        description: 'Use your pıut email and password',
      },
      {
        name: 'Log in with browser',
        value: 'browser' as const,
        description: 'Open piut.com to get your API key',
      },
      {
        name: 'Paste API key',
        value: 'api-key' as const,
        description: 'Enter an API key directly',
      },
    ],
  })

  switch (method) {
    case 'email':
      return loginWithEmailFlow()
    case 'browser':
      return browserFlow()
    case 'api-key':
      return pasteKeyFlow()
  }
}

/** Resolve API key from option, saved config, or interactive prompt. Validates and saves. */
export async function resolveApiKey(keyOption?: string): Promise<string> {
  const config = readStore()
  let apiKey = keyOption || config.apiKey

  if (apiKey) {
    // Validate existing key
    console.log(dim('  Validating key...'))
    let result
    try {
      result = await validateKey(apiKey)
    } catch (err: unknown) {
      console.log(chalk.red(`  ✗ ${(err as Error).message}`))
      console.log(dim('  Get a key at https://piut.com/dashboard/keys'))
      throw new CliError((err as Error).message)
    }

    const label = result.slug
      ? `${result.displayName} (${result.slug})`
      : result.displayName
    console.log(success(`  ✓ Connected as ${label}`))
    updateStore({ apiKey })
    return apiKey
  }

  // No key available — prompt login
  try {
    const { apiKey: newKey, validation } = await promptLogin()
    const label = validation.slug
      ? `${validation.displayName} (${validation.slug})`
      : validation.displayName
    console.log(success(`  ✓ Connected as ${label}`))
    updateStore({ apiKey: newKey })
    return newKey
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
    throw new CliError((err as Error).message)
  }
}

/** Resolve API key and return both key and validation result. */
export async function resolveApiKeyWithResult(keyOption?: string) {
  const config = readStore()
  let apiKey = keyOption || config.apiKey

  if (apiKey) {
    console.log(dim('  Validating key...'))
    let result
    try {
      result = await validateKey(apiKey)
    } catch (err: unknown) {
      console.log(chalk.red(`  ✗ ${(err as Error).message}`))
      console.log(dim('  Get a key at https://piut.com/dashboard/keys'))
      throw new CliError((err as Error).message)
    }

    const label = result.slug
      ? `${result.displayName} (${result.slug})`
      : result.displayName
    console.log(success(`  ✓ Connected as ${label}`))
    updateStore({ apiKey })
    return { apiKey, ...result }
  }

  // No key available — prompt login
  try {
    const { apiKey: newKey, validation } = await promptLogin()
    const label = validation.slug
      ? `${validation.displayName} (${validation.slug})`
      : validation.displayName
    console.log(success(`  ✓ Connected as ${label}`))
    updateStore({ apiKey: newKey })
    return { apiKey: newKey, ...validation }
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
    throw new CliError((err as Error).message)
  }
}
