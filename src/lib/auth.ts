import { select, input, password } from '@inquirer/prompts'
import { exec } from 'child_process'
import http from 'http'
import crypto from 'crypto'
import chalk from 'chalk'
import { validateKey, loginWithEmail } from './api.js'
import { readStore, updateStore } from './store.js'
import { success, dim, brand } from './ui.js'
import { CliError } from '../types.js'
import type { ValidateResponse } from '../types.js'

const API_BASE = process.env.PIUT_API_BASE || 'https://piut.com'

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

/** Open the browser for OAuth-style login, receive API key via local callback server. */
async function browserFlow(): Promise<{ apiKey: string; validation: ValidateResponse }> {
  const state = crypto.randomBytes(16).toString('hex')

  return new Promise((resolve, reject) => {
    let settled = false

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`)

      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end()
        return
      }

      const key = url.searchParams.get('key')
      const returnedState = url.searchParams.get('state')

      // Verify state to prevent CSRF
      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorPage('State mismatch. Please try again from the CLI.'))
        cleanup()
        if (!settled) { settled = true; reject(new CliError('Browser auth state mismatch')) }
        return
      }

      if (!key || !key.startsWith('pb_')) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(errorPage('No valid API key received.'))
        cleanup()
        if (!settled) { settled = true; reject(new CliError('No API key received from browser')) }
        return
      }

      // Send success page to browser
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(successPage())
      cleanup()

      // Validate the key before resolving
      validateKey(key)
        .then(validation => {
          if (!settled) { settled = true; resolve({ apiKey: key, validation }) }
        })
        .catch(err => {
          if (!settled) { settled = true; reject(err) }
        })
    })

    const timer = setTimeout(() => {
      cleanup()
      if (!settled) {
        settled = true
        reject(new CliError('Browser login timed out after 2 minutes. Please try again.'))
      }
    }, 120_000)

    function cleanup() {
      clearTimeout(timer)
      server.close()
    }

    // Listen on a random available port on localhost only
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      const authUrl = `${API_BASE}/cli/auth?port=${port}&state=${state}`
      console.log(dim(`  Opening ${brand('piut.com')} in your browser...`))
      openBrowser(authUrl)
      console.log(dim('  Waiting for browser authorization...'))
    })

    server.on('error', (err) => {
      cleanup()
      if (!settled) { settled = true; reject(new CliError(`Failed to start callback server: ${err.message}`)) }
    })
  })
}

function successPage(): string {
  return `<!DOCTYPE html>
<html><head><title>p\u0131ut CLI</title></head>
<body style="background:#0a0a0a;color:white;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<div style="font-size:48px;color:#4ade80;margin-bottom:16px">&#10003;</div>
<h2 style="margin:0 0 8px">CLI Authorized</h2>
<p style="color:#a3a3a3;margin:0">You can close this tab and return to your terminal.</p>
</div>
</body></html>`
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html><head><title>p\u0131ut CLI</title></head>
<body style="background:#0a0a0a;color:white;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<div style="font-size:48px;color:#f87171;margin-bottom:16px">&#10007;</div>
<h2 style="margin:0 0 8px">Authorization Failed</h2>
<p style="color:#a3a3a3;margin:0">${message}</p>
</div>
</body></html>`
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
        description: 'Sign in via piut.com (opens browser)',
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
