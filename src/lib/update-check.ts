import { execFile } from 'child_process'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { brand, dim } from './ui.js'

const PACKAGE_NAME = '@piut/cli'

/** Fetch the latest published version from the npm registry */
async function getLatestVersion(): Promise<string | null> {
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
function isNewer(current: string, latest: string): boolean {
  const [cMaj, cMin, cPat] = current.split('.').map(Number)
  const [lMaj, lMin, lPat] = latest.split('.').map(Number)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

/** Run npm install globally to update the CLI */
function runUpdate(): Promise<boolean> {
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

  console.log()
  console.log(brand('  Update available!') + dim(` ${currentVersion} → ${latest}`))
  console.log(dim(`  Run ${chalk.bold(`npm install -g ${PACKAGE_NAME}@latest`)} to update`))
  console.log()

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
