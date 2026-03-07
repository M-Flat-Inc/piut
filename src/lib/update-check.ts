import { execFile } from 'child_process'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { brand, dim } from './ui.js'

const PACKAGE_NAME = '@piut/cli'

/** Detect if running via npx (cached or downloaded) */
export function isNpx(): boolean {
  return process.env.npm_command === 'exec' || (process.env._?.includes('npx') ?? false)
}

/** Fetch the latest published version from the npm registry */
export async function getLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`)
    if (!res.ok) return null
    const data = await res.json()
    return data.version ?? null
  } catch {
    return null
  }
}

/** Compare two semver strings. Returns true if latest is newer than current. */
export function isNewer(current: string, latest: string): boolean {
  const [cMaj, cMin, cPat] = current.split('.').map(Number)
  const [lMaj, lMin, lPat] = latest.split('.').map(Number)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

/** Run npm install globally to update the CLI */
export function runUpdate(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('npm', ['install', '-g', `${PACKAGE_NAME}@latest`], { timeout: 60000 }, (err) => {
      resolve(!err)
    })
  })
}

/**
 * Check if a newer version of @piut/cli is available.
 * If so, notify the user and offer to update.
 * Silently does nothing if the check fails (network error, etc.).
 */
export async function checkForUpdate(currentVersion: string): Promise<void> {
  const latest = await getLatestVersion()
  if (!latest || !isNewer(currentVersion, latest)) return

  const npx = isNpx()
  const updateCmd = npx
    ? `npx ${PACKAGE_NAME}@latest`
    : `npm install -g ${PACKAGE_NAME}@latest`

  console.log()
  console.log(brand('  Update available!') + dim(` ${currentVersion} → ${latest}`))
  console.log(dim(`  Run ${chalk.bold(updateCmd)} to update`))
  console.log()

  // npx users can't auto-update — just show the command
  if (npx) return

  try {
    const shouldUpdate = await confirm({
      message: `Update to v${latest} now?`,
      default: true,
    })

    if (shouldUpdate) {
      console.log(dim('  Updating...'))
      const ok = await runUpdate()
      if (ok) {
        console.log(chalk.green(`  ✓ Updated to v${latest}`))
        console.log(dim('  Restart the CLI to use the new version.'))
        process.exit(0)
      } else {
        console.log(chalk.yellow(`  Could not auto-update. Run manually:`))
        console.log(chalk.bold(`  npm install -g ${PACKAGE_NAME}@latest`))
        console.log()
      }
    }
  } catch {
    // User cancelled prompt (Ctrl+C) — continue without updating
  }
}
