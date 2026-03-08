import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readStore, updateStore } from './store.js'
import { success, dim } from './ui.js'

/** Check if `piut` command is available in PATH */
function isPiutInPath(): boolean {
  try {
    execSync(process.platform === 'win32' ? 'where piut' : 'which piut', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** Detect the user's shell profile file */
function getShellProfile(): string | null {
  const shell = process.env.SHELL || ''
  const home = os.homedir()

  if (shell.includes('zsh')) {
    return path.join(home, '.zshrc')
  }
  if (shell.includes('bash')) {
    const profile = path.join(home, '.bash_profile')
    if (process.platform === 'darwin' && fs.existsSync(profile)) {
      return profile
    }
    return path.join(home, '.bashrc')
  }
  return null
}

/** Append a piut alias to the shell profile */
function addShellAlias(profilePath: string): boolean {
  try {
    const content = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf-8') : ''

    if (content.includes('alias piut=') || content.includes('piut()')) {
      return true // already has it
    }

    const alias = '\n# pıut CLI shortcut\nalias piut="npx @piut/cli"\n'
    fs.appendFileSync(profilePath, alias)
    return true
  } catch {
    return false
  }
}

/**
 * Automatically install the `piut` shell command.
 * Runs silently — no prompt, just a brief status line.
 *
 * Strategy:
 *   1. Try `npm install -g @piut/cli` (gives real binary in PATH, works immediately)
 *   2. Fall back to shell alias in ~/.zshrc or ~/.bashrc (works after new terminal)
 *   3. If both fail, silently skip (user can always use `npx @piut/cli`)
 *
 * Only runs once — stores a flag in ~/.piut/config.json.
 */
export async function offerGlobalInstall(): Promise<void> {
  if (isPiutInPath()) return

  const store = readStore()
  if (store.globalInstallOffered) return

  updateStore({ globalInstallOffered: true })

  // Try npm global install (works immediately in current shell)
  try {
    execSync('npm install -g @piut/cli', { stdio: 'pipe', timeout: 30000 })

    if (isPiutInPath()) {
      console.log(dim('  Installed `piut` command for quick access'))
      return
    }
  } catch {
    // Fall through to shell alias
  }

  // Fallback: add alias to shell profile
  const profile = getShellProfile()
  if (profile) {
    if (addShellAlias(profile)) {
      console.log(dim(`  Added \`piut\` shortcut to ${path.basename(profile)}`))
      return
    }
  }

  // Both failed — skip silently. User can always use npx @piut/cli.
}
