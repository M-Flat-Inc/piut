import chalk from 'chalk'
import { readSyncConfig, updateSyncConfig, getConfigFile } from '../lib/sync-config.js'
import { banner, brand, success, dim } from '../lib/ui.js'

interface SyncConfigOptions {
  files?: boolean
  autoDiscover?: string
  keepBrainUpdated?: string
  useBrain?: string
  show?: boolean
}

export async function syncConfigCommand(options: SyncConfigOptions): Promise<void> {
  banner()

  // Handle toggle flags
  if (options.autoDiscover !== undefined) {
    const value = parseBool(options.autoDiscover)
    if (value === null) {
      console.log(chalk.red('  ✗ Invalid value. Use: on, off, true, false'))
      process.exit(1)
    }
    updateSyncConfig({ autoDiscover: value })
    console.log(success(`  ✓ Auto-discover: ${value ? 'ON' : 'OFF'}`))
    console.log()
    return
  }

  if (options.keepBrainUpdated !== undefined) {
    const value = parseBool(options.keepBrainUpdated)
    if (value === null) {
      console.log(chalk.red('  ✗ Invalid value. Use: on, off, true, false'))
      process.exit(1)
    }
    updateSyncConfig({ keepBrainUpdated: value })
    console.log(success(`  ✓ Keep brain updated: ${value ? 'ON' : 'OFF'}`))
    console.log()
    return
  }

  if (options.useBrain !== undefined) {
    const value = parseBool(options.useBrain)
    if (value === null) {
      console.log(chalk.red('  ✗ Invalid value. Use: on, off, true, false'))
      process.exit(1)
    }
    updateSyncConfig({ useBrain: value })
    console.log(success(`  ✓ Use brain: ${value ? 'ON' : 'OFF'}`))
    console.log()
    return
  }

  if (options.show || options.files) {
    showConfig()
    return
  }

  // Default: show configuration menu
  showConfigMenu()
}

function showConfig(): void {
  const config = readSyncConfig()

  console.log(brand.bold('  Current Configuration'))
  console.log()
  console.log(`  Config file: ${dim(getConfigFile())}`)
  console.log(`  Device ID:   ${dim(config.deviceId)}`)
  console.log(`  Device name: ${dim(config.deviceName)}`)
  console.log(`  API key:     ${config.apiKey ? success('configured') : dim('not set')}`)
  console.log()
  console.log(dim('  Features:'))
  console.log(`    Auto-discover:      ${config.autoDiscover ? success('ON') : dim('OFF')}`)
  console.log(`    Keep brain updated: ${config.keepBrainUpdated ? success('ON') : dim('OFF')}`)
  console.log(`    Use brain:          ${config.useBrain ? success('ON') : dim('OFF')}`)
  console.log()

  if (config.backedUpFiles.length > 0) {
    console.log(dim('  Backed-up files:'))
    for (const f of config.backedUpFiles) {
      console.log(`    ${f}`)
    }
  } else {
    console.log(dim('  No files backed up yet.'))
  }

  console.log()
}

function showConfigMenu(): void {
  const config = readSyncConfig()

  console.log(brand.bold('  Configuration Options'))
  console.log(dim('  ──────────────────────────'))
  console.log()
  console.log(`  1. ${chalk.white('Change which files are backed up')}`)
  console.log(`     Current: ${config.backedUpFiles.length} files selected`)
  console.log(dim(`     Command: piut sync config --files`))
  console.log()
  console.log(`  2. ${chalk.white('Auto-backup new files in same environments')}`)
  console.log(`     Current: ${config.autoDiscover ? success('ON') : dim('OFF')}`)
  console.log(dim(`     Command: piut sync config --auto-discover [on|off]`))
  console.log()
  console.log(`  3. ${chalk.white('Use skill to keep brain up to date')}`)
  console.log(`     Current: ${config.keepBrainUpdated ? success('ON') : dim('OFF')}`)
  console.log(dim(`     Command: piut sync config --keep-brain-updated [on|off]`))
  console.log()
  console.log(`  4. ${chalk.white('Reference centralized brain')}`)
  console.log(`     Current: ${config.useBrain ? success('ON') : dim('OFF')}`)
  console.log(dim(`     Command: piut sync config --use-brain [on|off]`))
  console.log()
  console.log(`  5. ${chalk.white('View current configuration')}`)
  console.log(dim(`     Command: piut sync config --show`))
  console.log()
}

function parseBool(value: string): boolean | null {
  const lower = value.toLowerCase()
  if (['on', 'true', '1', 'yes'].includes(lower)) return true
  if (['off', 'false', '0', 'no'].includes(lower)) return false
  return null
}
