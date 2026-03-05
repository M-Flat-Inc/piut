import fs from 'fs'
import { password, confirm, checkbox } from '@inquirer/prompts'
import chalk from 'chalk'
import { validateKey } from '../lib/api.js'
import { detectInstalledTools, scanForFiles, formatSize } from '../lib/scanner.js'
import type { ScannedFile } from '../lib/scanner.js'
import { uploadFiles } from '../lib/sync-api.js'
import type { UploadFilePayload } from '../lib/sync-api.js'
import { readSyncConfig, writeSyncConfig, updateSyncConfig } from '../lib/sync-config.js'
import type { SyncConfig } from '../lib/sync-config.js'
import { banner, brand, success, dim, warning } from '../lib/ui.js'

interface SyncOptions {
  install?: boolean
  push?: boolean
  pull?: boolean
  key?: string
  yes?: boolean
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  if (options.install) {
    await installFlow(options)
  } else if (options.push) {
    await pushFlow(options)
  } else if (options.pull) {
    await pullFlow()
  } else {
    await statusFlow()
  }
}

// ─── Install Flow ────────────────────────────────────────────────

async function installFlow(options: SyncOptions): Promise<void> {
  banner()
  console.log(brand.bold('  Cloud Backup Setup'))
  console.log()

  // Step 1: API Key
  const config = readSyncConfig()
  let apiKey = options.key || config.apiKey

  if (!apiKey) {
    console.log(dim('  Enter your API key, or press Enter to get one at piut.com/dashboard'))
    console.log()

    apiKey = await password({
      message: 'Enter your API key (or press Enter to get one)',
      mask: '*',
      validate: (v: string) => {
        if (!v) return true // Allow empty to redirect
        return v.startsWith('pb_') || 'Key must start with pb_'
      },
    })

    if (!apiKey) {
      console.log()
      console.log(`  Get an API key at: ${brand('https://piut.com/dashboard')}`)
      console.log(dim('  Then run: npx @piut/cli sync --install'))
      console.log()
      return
    }
  }

  // Step 2: Validate key
  console.log(dim('  Validating key...'))
  let validationResult
  try {
    validationResult = await validateKey(apiKey)
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
    console.log(dim('  Get a key at https://piut.com/dashboard'))
    process.exit(1)
  }

  console.log(success(`  ✓ Authenticated as ${validationResult.displayName}`))
  console.log()

  // Save API key to config
  updateSyncConfig({ apiKey })

  // Step 3: Scan AI tool environments
  console.log(dim('  Scanning your AI tool environments...'))
  const tools = detectInstalledTools()

  if (tools.length === 0) {
    console.log(warning('  No AI tools detected.'))
    console.log(dim('  Supported: Claude Code, Claude Desktop, Cursor, Windsurf, Copilot, Amazon Q, Zed'))
    console.log()
    return
  }

  console.log(success(`  ✓ Found ${tools.length} product${tools.length === 1 ? '' : 's'} installed:`))
  for (const tool of tools) {
    console.log(`    - ${tool.name}`)
  }
  console.log()

  if (!options.yes) {
    const proceed = await confirm({
      message: `Continue with all ${tools.length}?`,
      default: true,
    })
    if (!proceed) {
      console.log(dim('  Setup cancelled.'))
      return
    }
  }

  // Step 4: Scan for brain files
  console.log()
  console.log(dim('  Scanning for brain files...'))
  console.log(dim('  (looking for: CLAUDE.md, MEMORY.md, SOUL.md, IDENTITY.md, .cursorrules, etc.)'))
  console.log()

  if (!options.yes) {
    const scanPermission = await confirm({
      message: 'Permission to scan your workspace?',
      default: true,
    })
    if (!scanPermission) {
      console.log(dim('  Scan cancelled.'))
      return
    }
  }

  const scannedFiles = scanForFiles()

  if (scannedFiles.length === 0) {
    console.log(warning('  No agent config files found in the current workspace.'))
    console.log(dim('  Try running from a project directory with CLAUDE.md, .cursorrules, etc.'))
    console.log()
    return
  }

  // Step 5: Display found files organized by category
  console.log()
  console.log(`  Found ${brand.bold(String(scannedFiles.length))} files across your workspace:`)
  console.log()

  const grouped = groupByCategory(scannedFiles)
  const choices = []

  for (const [category, files] of Object.entries(grouped)) {
    console.log(dim(`  📁 ${category}`))
    for (const file of files) {
      console.log(`    ☑ ${file.displayPath}`)
      choices.push({
        name: `${file.displayPath} ${dim(`(${formatSize(file.sizeBytes)})`)}`,
        value: file,
        checked: true,
      })
    }
    console.log()
  }

  // Step 6: Select files (default: all)
  let selectedFiles: ScannedFile[]

  if (options.yes) {
    selectedFiles = scannedFiles
  } else {
    selectedFiles = await checkbox({
      message: `Back up all ${scannedFiles.length} files?`,
      choices,
    })

    if (selectedFiles.length === 0) {
      console.log(dim('  No files selected.'))
      return
    }
  }

  // Step 7: Perform backup
  console.log()
  console.log(dim('  Backing up files...'))

  const syncConfig = readSyncConfig()
  const payloads: UploadFilePayload[] = selectedFiles.map(file => ({
    projectName: file.projectName,
    filePath: file.displayPath,
    content: fs.readFileSync(file.absolutePath, 'utf-8'),
    category: file.type,
    deviceId: syncConfig.deviceId,
    deviceName: syncConfig.deviceName,
  }))

  try {
    const result = await uploadFiles(apiKey, payloads)

    let totalSize = 0
    for (const file of result.files) {
      const scanned = selectedFiles.find(
        s => s.displayPath === file.filePath && s.projectName === file.projectName
      )
      const size = scanned ? scanned.sizeBytes : 0
      totalSize += size

      if (file.status === 'ok') {
        console.log(success(`  ✓ ${file.filePath}`) + dim(` (${formatSize(size)})`))
      } else {
        console.log(chalk.red(`  ✗ ${file.filePath}: ${file.status}`))
      }
    }

    console.log()
    if (result.uploaded > 0) {
      console.log(success(`  ✓ All files backed up successfully!`))
      console.log()
      console.log(dim('  📊 Backup complete:'))
      console.log(dim(`     ${result.uploaded} files | ${formatSize(totalSize)} total`))
    }
    if (result.errors > 0) {
      console.log(warning(`  ${result.errors} file(s) failed to upload.`))
    }

    // Save backed-up file paths to config
    const backedUpPaths = result.files
      .filter(f => f.status === 'ok')
      .map(f => f.filePath)
    updateSyncConfig({ backedUpFiles: backedUpPaths })

  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ Upload failed: ${(err as Error).message}`))
    process.exit(1)
  }

  console.log()
  console.log(`  View your backups: ${brand('https://piut.com/dashboard/backups')}`)
  console.log()

  // Step 8: Auto-backup prompt
  if (!options.yes) {
    const autoBackup = await confirm({
      message: 'Configure auto-backup?',
      default: false,
    })

    if (autoBackup) {
      updateSyncConfig({ autoDiscover: true })
      console.log(success('  ✓ Auto-backup enabled.'))
      console.log(dim('  New files in the same environments will be backed up automatically.'))
      console.log(dim('  Configure: piut sync config'))
    }
  }

  console.log()
}

// ─── Push Flow ───────────────────────────────────────────────────

async function pushFlow(options: SyncOptions): Promise<void> {
  banner()

  const config = readSyncConfig()
  const apiKey = options.key || config.apiKey

  if (!apiKey) {
    console.log(chalk.red('  ✗ Not configured. Run: npx @piut/cli sync --install'))
    process.exit(1)
  }

  console.log(dim('  Scanning for changes...'))
  const files = scanForFiles()

  if (files.length === 0) {
    console.log(dim('  No files found to push.'))
    return
  }

  // Upload all found files (the API deduplicates unchanged content via hash)
  const payloads: UploadFilePayload[] = files.map(file => ({
    projectName: file.projectName,
    filePath: file.displayPath,
    content: fs.readFileSync(file.absolutePath, 'utf-8'),
    category: file.type,
    deviceId: config.deviceId,
    deviceName: config.deviceName,
  }))

  try {
    const result = await uploadFiles(apiKey, payloads)

    for (const file of result.files) {
      if (file.status === 'ok') {
        console.log(success(`  ✓ ${file.filePath}`) + dim(` (v${file.version})`))
      } else {
        console.log(chalk.red(`  ✗ ${file.filePath}: ${file.status}`))
      }
    }

    console.log()
    console.log(success(`  Pushed ${result.uploaded} file(s)`))
    if (result.errors > 0) {
      console.log(warning(`  ${result.errors} error(s)`))
    }
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ Push failed: ${(err as Error).message}`))
    process.exit(1)
  }

  console.log()
}

// ─── Pull Flow ───────────────────────────────────────────────────

async function pullFlow(): Promise<void> {
  banner()

  const config = readSyncConfig()
  if (!config.apiKey) {
    console.log(chalk.red('  ✗ Not configured. Run: npx @piut/cli sync --install'))
    process.exit(1)
  }

  console.log(dim('  Pulling latest versions from cloud...'))

  try {
    const { pullFiles: pull } = await import('../lib/sync-api.js')
    const result = await pull(config.apiKey, undefined, config.deviceId)

    if (result.files.length === 0) {
      console.log(dim('  No files to pull. Everything is up to date.'))
      return
    }

    for (const file of result.files) {
      console.log(success(`  ✓ ${file.file_path}`) + dim(` (v${file.current_version})`))
    }

    console.log()
    console.log(success(`  Pulled ${result.files.length} file(s)`))
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ Pull failed: ${(err as Error).message}`))
    process.exit(1)
  }

  console.log()
}

// ─── Status Flow ─────────────────────────────────────────────────

async function statusFlow(): Promise<void> {
  banner()
  console.log(brand.bold('  Cloud Backup Status'))
  console.log()

  const config = readSyncConfig()

  if (!config.apiKey) {
    console.log(dim('  Not configured.'))
    console.log()
    console.log(`  Get started: ${brand('npx @piut/cli sync --install')}`)
    console.log()
    return
  }

  try {
    const { listFiles } = await import('../lib/sync-api.js')
    const result = await listFiles(config.apiKey)

    console.log(`  Files: ${brand.bold(String(result.fileCount))} / ${result.fileLimit}`)
    console.log(`  Storage: ${brand.bold(formatSize(result.storageUsed))} / ${formatSize(result.storageLimit)}`)
    console.log(`  Devices: ${result.devices.length}`)
    console.log()

    if (result.files.length > 0) {
      console.log(dim('  Backed-up files:'))
      for (const file of result.files) {
        console.log(`    ${file.file_path} ${dim(`v${file.current_version}`)}`)
      }
    }

    console.log()
    console.log(dim('  Configuration:'))
    console.log(`    Auto-discover: ${config.autoDiscover ? success('ON') : dim('OFF')}`)
    console.log(`    Brain sync:    ${config.keepBrainUpdated ? success('ON') : dim('OFF')}`)
    console.log(`    Use brain:     ${config.useBrain ? success('ON') : dim('OFF')}`)
    console.log()
    console.log(`  Dashboard: ${brand('https://piut.com/dashboard/backups')}`)
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
  }

  console.log()
}

// ─── Helpers ─────────────────────────────────────────────────────

function groupByCategory(files: ScannedFile[]): Record<string, ScannedFile[]> {
  const groups: Record<string, ScannedFile[]> = {}
  for (const file of files) {
    if (!groups[file.category]) groups[file.category] = []
    groups[file.category].push(file)
  }

  // Sort: Global first, then alphabetical
  const sorted: Record<string, ScannedFile[]> = {}
  if (groups['Global']) {
    sorted['Global'] = groups['Global']
    delete groups['Global']
  }
  for (const key of Object.keys(groups).sort()) {
    sorted[key] = groups[key]
  }
  return sorted
}
