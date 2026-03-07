import chalk from 'chalk'
import { getLatestVersion, isNewer, isNpx, runUpdate } from '../lib/update-check.js'
import { brand, dim, success } from '../lib/ui.js'

const PACKAGE_NAME = '@piut/cli'

export async function updateCommand(currentVersion: string): Promise<void> {
  console.log(dim(`  Current version: ${currentVersion}`))
  console.log(dim('  Checking for updates...'))

  const latest = await getLatestVersion()
  if (!latest) {
    console.log(chalk.yellow('  Could not reach the npm registry. Check your connection.'))
    return
  }

  if (!isNewer(currentVersion, latest)) {
    console.log(success(`  ✓ You're on the latest version (${currentVersion})`))
    return
  }

  console.log()
  console.log(brand('  Update available!') + dim(` ${currentVersion} → ${latest}`))

  if (isNpx()) {
    console.log()
    console.log(dim("  You're running via npx. Use the latest version with:"))
    console.log(chalk.bold(`  npx ${PACKAGE_NAME}@latest`))
    console.log()
    return
  }

  console.log(dim('  Updating...'))
  const ok = await runUpdate()
  if (ok) {
    console.log(success(`  ✓ Updated to v${latest}`))
    console.log(dim('  Restart the CLI to use the new version.'))
  } else {
    console.log(chalk.yellow('  Could not auto-update. Run manually:'))
    console.log(chalk.bold(`  npm install -g ${PACKAGE_NAME}@latest`))
  }
}
