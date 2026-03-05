import fs from 'fs'
import crypto from 'crypto'
import { password, confirm, checkbox, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { validateKey } from '../lib/api.js'
import { detectInstalledTools, scanForFiles, formatSize } from '../lib/scanner.js'
import type { ScannedFile } from '../lib/scanner.js'
import {
  uploadFiles,
  listFiles,
  pullFiles,
  listFileVersions,
  getFileVersion,
  resolveConflict,
} from '../lib/sync-api.js'
import type { UploadFilePayload } from '../lib/sync-api.js'
import { readSyncConfig, updateSyncConfig } from '../lib/sync-config.js'
import { guardFile } from '../lib/sensitive-guard.js'
import { banner, brand, success, dim, warning } from '../lib/ui.js'

interface SyncOptions {
  install?: boolean
  push?: boolean
  pull?: boolean
  watch?: boolean
  history?: string
  diff?: string
  restore?: string
  preferLocal?: boolean
  preferCloud?: boolean
  installDaemon?: boolean
  key?: string
  yes?: boolean
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  if (options.install) {
    await installFlow(options)
  } else if (options.push) {
    await pushFlow(options)
  } else if (options.pull) {
    await pullFlow(options)
  } else if (options.watch) {
    await watchFlow()
  } else if (options.history) {
    await historyFlow(options.history)
  } else if (options.diff) {
    await diffFlow(options.diff)
  } else if (options.restore) {
    await restoreFlow(options.restore)
  } else if (options.installDaemon) {
    await installDaemonFlow()
  } else {
    await statusFlow()
  }
}

// ─── Sensitive File Guard ──────────────────────────────────────

function guardAndFilter(files: ScannedFile[], options: { yes?: boolean }): ScannedFile[] {
  const safe: ScannedFile[] = []
  let blocked = 0

  for (const file of files) {
    const content = fs.readFileSync(file.absolutePath, 'utf-8')
    const result = guardFile(file.displayPath, content)

    if (result.blocked) {
      blocked++
      if (result.reason === 'filename') {
        console.log(chalk.red(`  BLOCKED ${file.displayPath}`) + dim(' (sensitive filename)'))
      } else {
        console.log(chalk.red(`  BLOCKED ${file.displayPath}`) + dim(' (contains secrets)'))
        for (const match of result.matches.slice(0, 3)) {
          console.log(dim(`    line ${match.line}: ${match.preview}`))
        }
        if (result.matches.length > 3) {
          console.log(dim(`    ... and ${result.matches.length - 3} more`))
        }
      }
    } else {
      safe.push(file)
    }
  }

  if (blocked > 0) {
    console.log()
    console.log(warning(`  ${blocked} file(s) blocked by sensitive file guard`))
    console.log(dim('  These files will not be uploaded to protect your secrets.'))
    console.log()
  }

  return safe
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

  // Step 5: Sensitive file guard
  const safeFiles = guardAndFilter(scannedFiles, options)

  if (safeFiles.length === 0) {
    console.log(warning('  All files were blocked by the sensitive file guard.'))
    console.log()
    return
  }

  // Step 6: Display found files organized by category
  console.log()
  console.log(`  Found ${brand.bold(String(safeFiles.length))} safe files across your workspace:`)
  console.log()

  const grouped = groupByCategory(safeFiles)
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

  // Step 7: Select files (default: all)
  let selectedFiles: ScannedFile[]

  if (options.yes) {
    selectedFiles = safeFiles
  } else {
    selectedFiles = await checkbox({
      message: `Back up all ${safeFiles.length} files?`,
      choices,
    })

    if (selectedFiles.length === 0) {
      console.log(dim('  No files selected.'))
      return
    }
  }

  // Step 8: Perform backup
  await uploadScannedFiles(apiKey, selectedFiles)

  console.log()
  console.log(`  View your backups: ${brand('https://piut.com/dashboard/backups')}`)
  console.log()

  // Step 9: Auto-backup prompt
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

  // Apply sensitive file guard
  const safeFiles = guardAndFilter(files, options)

  if (safeFiles.length === 0) {
    console.log(dim('  No safe files to push.'))
    return
  }

  // Conflict detection: compare local hash vs cloud hash
  if (!options.preferLocal && !options.preferCloud) {
    try {
      const cloudFiles = await listFiles(apiKey)
      for (const localFile of safeFiles) {
        const localContent = fs.readFileSync(localFile.absolutePath, 'utf-8')
        const localHash = hashContent(localContent)
        const cloudFile = cloudFiles.files.find(
          cf => cf.file_path === localFile.displayPath && cf.project_name === localFile.projectName
        )
        if (cloudFile && cloudFile.content_hash !== localHash) {
          // Both sides differ — potential conflict
          console.log(warning(`  Conflict: ${localFile.displayPath}`))
          console.log(dim(`    local hash:  ${localHash.slice(0, 12)}...`))
          console.log(dim(`    cloud hash:  ${cloudFile.content_hash.slice(0, 12)}...`))

          if (!options.yes) {
            const resolution = await select({
              message: `How to resolve ${localFile.displayPath}?`,
              choices: [
                { name: 'Keep local (push local to cloud)', value: 'keep-local' as const },
                { name: 'Keep cloud (skip this file)', value: 'keep-cloud' as const },
              ],
            })

            if (resolution === 'keep-cloud') {
              await resolveConflict(apiKey, cloudFile.id, 'keep-cloud', undefined, config.deviceId, config.deviceName)
              console.log(success(`  ✓ Kept cloud version of ${localFile.displayPath}`))
              // Remove from upload list
              const idx = safeFiles.indexOf(localFile)
              if (idx >= 0) safeFiles.splice(idx, 1)
              continue
            }
          }
        }
      }
    } catch {
      // If conflict check fails, proceed with upload anyway
    }
  }

  await uploadScannedFiles(apiKey, safeFiles)
  console.log()
}

// ─── Pull Flow ───────────────────────────────────────────────────

async function pullFlow(options: SyncOptions): Promise<void> {
  banner()

  const config = readSyncConfig()
  const apiKey = options.key || config.apiKey

  if (!apiKey) {
    console.log(chalk.red('  ✗ Not configured. Run: npx @piut/cli sync --install'))
    process.exit(1)
  }

  console.log(dim('  Pulling latest versions from cloud...'))

  try {
    const result = await pullFiles(apiKey, undefined, config.deviceId)

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

// ─── History Flow ────────────────────────────────────────────────

async function historyFlow(filePathOrId: string): Promise<void> {
  banner()
  console.log(brand.bold('  Version History'))
  console.log()

  const config = readSyncConfig()
  if (!config.apiKey) {
    console.log(chalk.red('  ✗ Not configured. Run: npx @piut/cli sync --install'))
    process.exit(1)
  }

  const fileId = await resolveFileId(config.apiKey, filePathOrId)
  if (!fileId) {
    console.log(chalk.red(`  ✗ File not found: ${filePathOrId}`))
    process.exit(1)
  }

  const result = await listFileVersions(config.apiKey, fileId)

  console.log(`  ${brand.bold(result.filePath)} (${result.projectName})`)
  console.log(`  Current version: v${result.currentVersion}`)
  console.log()

  for (const v of result.versions) {
    const date = new Date(v.createdAt).toLocaleString()
    const size = formatSize(v.contentSize)
    const summary = v.changeSummary ? ` — ${v.changeSummary}` : ''
    const marker = v.version === result.currentVersion ? chalk.green(' (current)') : ''
    console.log(`  v${v.version}  ${dim(date)}  ${dim(size)}${summary}${marker}`)
  }

  console.log()
}

// ─── Diff Flow ───────────────────────────────────────────────────

async function diffFlow(filePathOrId: string): Promise<void> {
  banner()
  console.log(brand.bold('  Local vs Cloud Diff'))
  console.log()

  const config = readSyncConfig()
  if (!config.apiKey) {
    console.log(chalk.red('  ✗ Not configured. Run: npx @piut/cli sync --install'))
    process.exit(1)
  }

  const fileId = await resolveFileId(config.apiKey, filePathOrId)
  if (!fileId) {
    console.log(chalk.red(`  ✗ File not found in cloud: ${filePathOrId}`))
    process.exit(1)
  }

  // Get cloud version
  const versions = await listFileVersions(config.apiKey, fileId)
  const cloudVersion = await getFileVersion(config.apiKey, fileId, versions.currentVersion)
  const cloudContent = cloudVersion.content

  // Try to find local file
  const localPath = resolveLocalPath(filePathOrId, versions.filePath)
  if (!localPath || !fs.existsSync(localPath)) {
    console.log(warning(`  Local file not found: ${filePathOrId}`))
    console.log(dim('  Showing cloud content only:'))
    console.log()
    console.log(cloudContent)
    return
  }

  const localContent = fs.readFileSync(localPath, 'utf-8')

  if (localContent === cloudContent) {
    console.log(success('  ✓ Local and cloud are identical'))
    console.log()
    return
  }

  // Simple line-by-line diff
  const localLines = localContent.split('\n')
  const cloudLines = cloudContent.split('\n')
  const maxLen = Math.max(localLines.length, cloudLines.length)

  console.log(`  ${versions.filePath}`)
  console.log(dim(`  local: ${localLines.length} lines | cloud v${versions.currentVersion}: ${cloudLines.length} lines`))
  console.log()

  let diffCount = 0
  for (let i = 0; i < maxLen; i++) {
    const local = localLines[i]
    const cloud = cloudLines[i]

    if (local !== cloud) {
      diffCount++
      if (diffCount > 50) {
        console.log(dim(`  ... and more differences (${maxLen - i} lines remaining)`))
        break
      }
      if (cloud !== undefined && local !== undefined) {
        console.log(chalk.red(`  - ${i + 1}: ${cloud}`))
        console.log(chalk.green(`  + ${i + 1}: ${local}`))
      } else if (cloud === undefined) {
        console.log(chalk.green(`  + ${i + 1}: ${local}`))
      } else {
        console.log(chalk.red(`  - ${i + 1}: ${cloud}`))
      }
    }
  }

  console.log()
  console.log(dim(`  ${diffCount} line(s) differ`))
  console.log()
}

// ─── Restore Flow ────────────────────────────────────────────────

async function restoreFlow(filePathOrId: string): Promise<void> {
  banner()
  console.log(brand.bold('  Restore from Cloud'))
  console.log()

  const config = readSyncConfig()
  if (!config.apiKey) {
    console.log(chalk.red('  ✗ Not configured. Run: npx @piut/cli sync --install'))
    process.exit(1)
  }

  const fileId = await resolveFileId(config.apiKey, filePathOrId)
  if (!fileId) {
    console.log(chalk.red(`  ✗ File not found in cloud: ${filePathOrId}`))
    process.exit(1)
  }

  // Show versions
  const versionsResult = await listFileVersions(config.apiKey, fileId)
  console.log(`  ${brand.bold(versionsResult.filePath)} (${versionsResult.projectName})`)
  console.log()

  if (versionsResult.versions.length <= 1) {
    console.log(dim('  Only one version available. Nothing to restore.'))
    console.log()
    return
  }

  // Let user pick a version
  const versionChoice = await select({
    message: 'Which version to restore?',
    choices: versionsResult.versions.map(v => ({
      name: `v${v.version} — ${new Date(v.createdAt).toLocaleString()} (${formatSize(v.contentSize)})${v.changeSummary ? ` — ${v.changeSummary}` : ''}`,
      value: v.version,
    })),
  })

  // Get the version content
  const versionData = await getFileVersion(config.apiKey, fileId, versionChoice)

  // Find local path
  const localPath = resolveLocalPath(filePathOrId, versionsResult.filePath)

  console.log()
  console.log(dim(`  Restoring v${versionChoice} of ${versionsResult.filePath}...`))

  // Upload as new current version
  const result = await uploadFiles(config.apiKey, [{
    projectName: versionsResult.projectName,
    filePath: versionsResult.filePath,
    content: versionData.content,
    category: 'project',
    deviceId: config.deviceId,
    deviceName: config.deviceName,
  }])

  if (result.uploaded > 0) {
    console.log(success(`  ✓ Cloud restored to v${versionChoice} content (saved as new version)`))
  }

  // Optionally write to local file
  if (localPath) {
    const writeLocal = await confirm({
      message: `Also write to local file ${localPath}?`,
      default: true,
    })

    if (writeLocal) {
      fs.writeFileSync(localPath, versionData.content, 'utf-8')
      console.log(success(`  ✓ Local file updated: ${localPath}`))
    }
  }

  console.log()
}

// ─── Watch Flow ──────────────────────────────────────────────────

async function watchFlow(): Promise<void> {
  banner()
  console.log(brand.bold('  Live Sync (Watch Mode)'))
  console.log()

  const config = readSyncConfig()
  if (!config.apiKey) {
    console.log(chalk.red('  ✗ Not configured. Run: npx @piut/cli sync --install'))
    process.exit(1)
  }

  // Dynamically import chokidar
  let chokidar: typeof import('chokidar')
  try {
    chokidar = await import('chokidar')
  } catch {
    console.log(chalk.red('  ✗ chokidar is required for watch mode.'))
    console.log(dim('  Install it: npm install -g chokidar'))
    console.log(dim('  Or use cron-based sync: piut sync --install-daemon'))
    process.exit(1)
  }

  // Scan for files to watch
  const files = scanForFiles()
  const safeFiles = guardAndFilter(files, { yes: true })

  if (safeFiles.length === 0) {
    console.log(dim('  No files to watch.'))
    return
  }

  const watchPaths = safeFiles.map(f => f.absolutePath)

  console.log(dim(`  Watching ${watchPaths.length} file(s) for changes...`))
  for (const f of safeFiles) {
    console.log(dim(`    ${f.displayPath}`))
  }
  console.log()
  console.log(dim('  Press Ctrl+C to stop.'))
  console.log()

  // Debounce map: path -> timeout
  const debounceMap = new Map<string, ReturnType<typeof setTimeout>>()
  const DEBOUNCE_MS = 2000

  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })

  watcher.on('change', (changedPath: string) => {
    // Clear existing debounce for this path
    const existing = debounceMap.get(changedPath)
    if (existing) clearTimeout(existing)

    debounceMap.set(changedPath, setTimeout(async () => {
      debounceMap.delete(changedPath)

      const file = safeFiles.find(f => f.absolutePath === changedPath)
      if (!file) return

      const content = fs.readFileSync(changedPath, 'utf-8')
      const guardResult = guardFile(file.displayPath, content)
      if (guardResult.blocked) {
        console.log(chalk.red(`  BLOCKED ${file.displayPath}`) + dim(' (sensitive content detected)'))
        return
      }

      try {
        const result = await uploadFiles(config.apiKey!, [{
          projectName: file.projectName,
          filePath: file.displayPath,
          content,
          category: file.type,
          deviceId: config.deviceId,
          deviceName: config.deviceName,
        }])

        const uploaded = result.files.find(f => f.status === 'ok')
        if (uploaded) {
          const time = new Date().toLocaleTimeString()
          console.log(success(`  ✓ ${file.displayPath}`) + dim(` v${uploaded.version} (${time})`))
        }
      } catch (err: unknown) {
        console.log(chalk.red(`  ✗ ${file.displayPath}: ${(err as Error).message}`))
      }
    }, DEBOUNCE_MS))
  })

  // Keep the process alive
  await new Promise(() => {})
}

// ─── Install Daemon Flow ─────────────────────────────────────────

async function installDaemonFlow(): Promise<void> {
  banner()
  console.log(brand.bold('  Auto-Sync Daemon Setup'))
  console.log()

  const platform = process.platform

  if (platform === 'darwin') {
    await installMacDaemon()
  } else if (platform === 'linux') {
    installLinuxCron()
  } else {
    console.log(dim('  Auto-sync daemon setup is available for macOS and Linux.'))
    console.log()
    console.log(dim('  Manual alternative: add this to your crontab (crontab -e):'))
    console.log()
    console.log(`    */30 * * * * cd ~ && npx @piut/cli sync --push --yes 2>&1 >> ~/.piut/sync.log`)
    console.log()
  }
}

async function installMacDaemon(): Promise<void> {
  const plistName = 'com.piut.auto-sync'
  const plistDir = `${process.env.HOME}/Library/LaunchAgents`
  const plistPath = `${plistDir}/${plistName}.plist`
  const logDir = `${process.env.HOME}/.piut/logs`

  // Resolve npx path
  const npxPath = await resolveNpxPath()

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistName}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${npxPath}</string>
    <string>@piut/cli</string>
    <string>sync</string>
    <string>--push</string>
    <string>--yes</string>
  </array>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${process.env.HOME}</string>
  <key>StandardOutPath</key>
  <string>${logDir}/sync.out.log</string>
  <key>StandardErrorPath</key>
  <string>${logDir}/sync.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.HOME}/.local/bin:${process.env.HOME}/.npm-global/bin</string>
  </dict>
</dict>
</plist>`

  console.log(dim('  This will create a macOS LaunchAgent that runs every 30 minutes.'))
  console.log()
  console.log(dim(`  Plist: ${plistPath}`))
  console.log(dim(`  Logs:  ${logDir}/sync.{out,err}.log`))
  console.log()

  const proceed = await confirm({
    message: 'Install the auto-sync LaunchAgent?',
    default: true,
  })

  if (!proceed) {
    console.log(dim('  Cancelled.'))
    return
  }

  // Create dirs
  fs.mkdirSync(logDir, { recursive: true })
  fs.mkdirSync(plistDir, { recursive: true })

  // Write plist
  fs.writeFileSync(plistPath, plistContent, 'utf-8')
  console.log(success(`  ✓ Plist written: ${plistPath}`))

  // Load the agent
  const { execSync } = await import('child_process')
  try {
    // Unload first in case it already exists
    try {
      execSync(`launchctl bootout gui/$(id -u) ${plistPath} 2>/dev/null`, { stdio: 'ignore' })
    } catch { /* ignore */ }

    execSync(`launchctl bootstrap gui/$(id -u) ${plistPath}`)
    console.log(success('  ✓ LaunchAgent loaded — auto-sync active!'))
  } catch {
    console.log(warning('  LaunchAgent written but could not be loaded automatically.'))
    console.log(dim(`  Load manually: launchctl bootstrap gui/$(id -u) ${plistPath}`))
  }

  console.log()
  console.log(dim('  To stop: launchctl bootout gui/$(id -u) com.piut.auto-sync'))
  console.log(dim('  To check: launchctl print gui/$(id -u)/com.piut.auto-sync'))
  console.log()
}

function installLinuxCron(): void {
  console.log(dim('  Add this line to your crontab (run: crontab -e):'))
  console.log()
  console.log(`    */30 * * * * cd ~ && npx @piut/cli sync --push --yes 2>&1 >> ~/.piut/sync.log`)
  console.log()
  console.log(dim('  This will push changes every 30 minutes.'))
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

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

async function uploadScannedFiles(apiKey: string, files: ScannedFile[]): Promise<void> {
  console.log()
  console.log(dim('  Backing up files...'))

  const syncConfig = readSyncConfig()
  const payloads: UploadFilePayload[] = files.map(file => ({
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
      const scanned = files.find(
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
}

/** Resolve a file path or partial match to a cloud file ID */
async function resolveFileId(apiKey: string, pathOrId: string): Promise<string | null> {
  // If it looks like a UUID, use directly
  if (/^[0-9a-f]{8}-/.test(pathOrId)) return pathOrId

  // Otherwise, search by file path
  const result = await listFiles(apiKey)
  const match = result.files.find(f =>
    f.file_path === pathOrId ||
    f.file_path.endsWith(pathOrId) ||
    f.file_path.includes(pathOrId)
  )

  return match?.id || null
}

/** Try to resolve a local file path */
function resolveLocalPath(input: string, cloudPath: string): string | null {
  // Direct path
  if (fs.existsSync(input)) return input

  // Try expanding ~ in the cloud path
  const home = process.env.HOME || ''
  if (cloudPath.startsWith('~/')) {
    const expanded = cloudPath.replace('~', home)
    if (fs.existsSync(expanded)) return expanded
  }

  // Try in cwd
  const cwdPath = `${process.cwd()}/${cloudPath}`
  if (fs.existsSync(cwdPath)) return cwdPath

  return null
}

/** Resolve npx binary path */
async function resolveNpxPath(): Promise<string> {
  const { execSync } = await import('child_process')
  try {
    return execSync('which npx', { encoding: 'utf-8' }).trim()
  } catch {
    return '/usr/local/bin/npx'
  }
}

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
