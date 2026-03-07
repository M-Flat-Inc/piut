import { select, checkbox, input, confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import os from 'os'
import { buildBrainStreaming, publishServer } from '../lib/api.js'
import { scanFolders, buildBrainInput, getDefaultScanDirs } from '../lib/brain-scanner.js'
import type { ScanProgress, ScanResult } from '../lib/brain-scanner.js'
import { formatFolderChoice, formatSelectionSummary, displayPath } from '../lib/folder-tree.js'
import { banner, brand, success, dim, Spinner } from '../lib/ui.js'
import { resolveApiKeyWithResult } from '../lib/auth.js'
import { expandPath } from '../lib/paths.js'
import { CliError } from '../types.js'

interface BuildOptions {
  key?: string
  folders?: string
  yes?: boolean
  publish?: boolean
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  banner()

  const { apiKey, serverUrl } = await resolveApiKeyWithResult(options.key)

  // =========================================================================
  // Phase A: Folder Selection (local only)
  // =========================================================================

  let scanDirs: string[]

  if (options.folders) {
    // --folders flag bypasses interactive selection
    scanDirs = options.folders.split(',').map(f => expandPath(f.trim()))
  } else {
    console.log(dim('  ━━━ BUILD YOUR BRAIN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
    console.log()
    console.log(dim('  This is a local scan only — no files leave your machine'))
    console.log(dim('  until you review and explicitly approve.'))
    console.log()

    scanDirs = await selectFolders()
  }

  if (scanDirs.length === 0) {
    console.log(chalk.yellow('  No folders selected.'))
    return
  }

  // =========================================================================
  // Phase B: Local Scan (no network, with progress)
  // =========================================================================

  console.log()
  console.log(dim('  Scanning locally — no data is shared...'))
  console.log()

  let fileCount = 0
  const onProgress = (progress: ScanProgress) => {
    if (progress.phase === 'scanning') {
      console.log(dim(`  ${progress.message}`))
    } else if (progress.phase === 'parsing') {
      fileCount++
      console.log(dim(`    [${fileCount}] ${progress.message}`))
    } else if (progress.phase === 'projects') {
      console.log(dim(`  [project] ${progress.message}`))
    } else if (progress.phase === 'configs') {
      console.log(dim(`  [config] ${progress.message}`))
    }
  }

  const scanResult = await scanFolders(scanDirs, onProgress)

  console.log()
  console.log(success(`  ✓ Scan complete: ${scanResult.totalFiles} files found across ${scanResult.folders.length} folders (local only)`))
  console.log()

  if (scanResult.totalFiles === 0 && scanResult.configFiles.length === 0) {
    console.log(chalk.yellow('  No parseable files found in the selected folders.'))
    console.log(dim('  Try scanning a different directory, or use --folders to specify paths.'))
    console.log()
    return
  }

  // =========================================================================
  // Phase C: Folder Review (local only, deselect)
  // =========================================================================

  let selectedFolderPaths: string[]

  if (options.yes || scanResult.folders.length === 0) {
    // --yes auto-selects all, or no folders to review (only config files found)
    selectedFolderPaths = scanResult.folders.map(f => f.path)
  } else {
    selectedFolderPaths = await reviewFolders(scanResult)
  }

  if (selectedFolderPaths.length === 0 && scanResult.configFiles.length === 0) {
    console.log(chalk.yellow('  No folders selected.'))
    return
  }

  // =========================================================================
  // Phase D: Consent Gate (before any network call)
  // =========================================================================

  const selectedFolders = scanResult.folders.filter(f => selectedFolderPaths.includes(f.path))
  const totalSelectedFiles = selectedFolders.reduce((sum, f) => sum + f.fileCount, 0) + scanResult.configFiles.length

  if (!options.yes) {
    console.log()
    console.log(dim('  ━━━ READY TO BUILD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
    console.log()
    console.log(dim(`  ${totalSelectedFiles} files will be sent to p\u0131ut and processed by Claude`))
    console.log(dim('  Sonnet to design your brain. File contents are used for'))
    console.log(dim('  brain generation only and are not retained.'))
    console.log()
    console.log(dim(`  Privacy policy: ${brand('https://piut.com/privacy')}`))
    console.log()

    const consent = await confirm({
      message: 'Send files and build your brain?',
      default: false,
    })

    if (!consent) {
      console.log()
      console.log(dim('  Build cancelled. No files were sent.'))
      console.log()
      return
    }
  }

  // =========================================================================
  // Phase E: AI Generation with Streaming Progress
  // =========================================================================

  const brainInput = buildBrainInput(scanResult, selectedFolderPaths)

  const spinner = new Spinner()
  spinner.start('Generating brain...')

  try {
    let sections: Record<string, string> | null = null

    for await (const event of buildBrainStreaming(apiKey, brainInput)) {
      switch (event.event) {
        case 'status':
          spinner.updateMessage(String(event.data.message || 'Processing...'))
          break

        case 'progress':
          break

        case 'section':
          spinner.addSection(String(event.data.name))
          break

        case 'complete':
          spinner.completeAll()
          sections = (event.data.sections || {}) as Record<string, string>
          break

        case 'error':
          spinner.stop()
          console.log(chalk.red(`  ✗ ${event.data.message || 'Build failed'}`))
          throw new CliError(String(event.data.message || 'Build failed'))
      }
    }

    spinner.stop()

    if (!sections) {
      console.log(chalk.red('  ✗ No response received from server'))
      throw new CliError('No response received from server')
    }

    // =========================================================================
    // Phase F: Brain Preview
    // =========================================================================

    console.log()
    console.log(success('  Brain built!'))
    console.log()

    const SECTION_LABELS: Record<string, string> = {
      about: 'About',
      soul: 'Soul',
      areas: 'Areas of Responsibility',
      projects: 'Projects',
      memory: 'Memory',
    }

    for (const [key, label] of Object.entries(SECTION_LABELS)) {
      const content = (sections as Record<string, string>)[key] || ''
      if (!content.trim()) {
        console.log(dim(`  ${label} — (empty)`))
      } else {
        console.log(success(`  ${label}`))
        const lines = content.split('\n').filter(l => l.trim()).slice(0, 5)
        for (const line of lines) {
          console.log(dim(`    ${line.length > 80 ? line.slice(0, 80) + '...' : line}`))
        }
        const totalLines = content.split('\n').filter(l => l.trim()).length
        if (totalLines > 5) {
          console.log(dim(`    ... (${totalLines - 5} more lines)`))
        }
      }
      console.log()
    }

    console.log(dim(`  Review and edit at ${brand('piut.com/dashboard')}`))
    console.log()

    // Ask to publish
    let wantPublish: boolean
    if (options.publish === false) {
      wantPublish = false
    } else if (options.yes) {
      wantPublish = true
    } else {
      console.log(dim('  You can always make changes later.'))
      wantPublish = await confirm({
        message: 'Publish your brain now?',
        default: true,
      })
    }

    if (wantPublish) {
      try {
        await publishServer(apiKey)
        console.log()
        console.log(success('  ✓ Brain published. MCP server is live.'))
        console.log(`  ${brand(serverUrl)}`)
        console.log(dim('  (accessible only with secure authentication)'))
        console.log()
      } catch (err: unknown) {
        console.log()
        const msg = (err as Error).message
        if (msg === 'REQUIRES_SUBSCRIPTION') {
          console.log(chalk.yellow('  Deploy requires an active subscription ($10/mo).'))
          console.log(`  Subscribe at: ${brand('https://piut.com/dashboard/billing')}`)
          console.log(dim('  14-day free trial included.'))
        } else {
          console.log(chalk.red(`  ✗ ${msg}`))
        }
        console.log()
      }
    } else {
      console.log()
      console.log(dim('  You can publish anytime with: ') + brand('piut deploy'))
      console.log()
    }
  } catch (err: unknown) {
    spinner.stop()
    if (err instanceof CliError) throw err
    const msg = (err as Error).message || 'Unknown error'
    const hint = msg === 'terminated' || msg.includes('network') || msg.includes('fetch')
      ? 'The build was interrupted. This can happen if your scan data is very large. Try using --folders to limit which directories are scanned.'
      : msg
    console.log(chalk.red(`  ✗ ${hint}`))
    throw new CliError(hint)
  }
}

// ---------------------------------------------------------------------------
// Phase A helper: folder selection
// ---------------------------------------------------------------------------

async function selectFolders(): Promise<string[]> {
  const defaults = getDefaultScanDirs()
  const homeDir = os.homedir()
  const ALL_VALUE = '__all__'
  const CUSTOM_VALUE = '__custom__'

  const choices = [
    { name: `All home folders (~) ${chalk.dim('(Recommended)')}`, value: ALL_VALUE },
    { name: chalk.dim('──────────────'), value: '__sep__', disabled: true },
    ...defaults.map(d => ({ name: displayPath(d), value: d })),
    { name: chalk.dim('Browse to a folder...'), value: CUSTOM_VALUE },
  ]

  const selected = await checkbox({
    message: 'Select folders to scan:',
    choices,
    required: true,
  })

  let scanDirs: string[]

  if (selected.includes(ALL_VALUE)) {
    scanDirs = defaults
  } else {
    scanDirs = selected.filter(v => v !== CUSTOM_VALUE)

    if (selected.includes(CUSTOM_VALUE)) {
      const custom = await input({
        message: 'Enter folder path(s), comma-separated:',
      })
      const customPaths = custom.split(',').map(f => expandPath(f.trim())).filter(Boolean)
      scanDirs = [...scanDirs, ...customPaths]
    }
  }

  // Show what was selected and offer to add more
  if (scanDirs.length > 0 && !selected.includes(ALL_VALUE)) {
    console.log()
    console.log(dim('  Selected:'))
    for (const d of scanDirs) {
      console.log(dim(`    ${displayPath(d)}`))
    }

    const addMore = await select({
      message: 'Add more folders or continue?',
      choices: [
        { name: 'Continue with scan', value: 'continue' as const },
        { name: 'Add another folder...', value: 'add' as const },
      ],
    })

    if (addMore === 'add') {
      const extra = await input({
        message: 'Enter folder path(s), comma-separated:',
      })
      const extraPaths = extra.split(',').map(f => expandPath(f.trim())).filter(Boolean)
      scanDirs = [...scanDirs, ...extraPaths]
    }
  }

  return scanDirs
}

// ---------------------------------------------------------------------------
// Phase C helper: post-scan folder review
// ---------------------------------------------------------------------------

async function reviewFolders(scanResult: ScanResult): Promise<string[]> {
  if (scanResult.folders.length === 0) return []

  console.log(dim('  ━━━ REVIEW SCANNED FOLDERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log()
  console.log(dim('  All folders selected by default. Deselect any you want to exclude.'))
  console.log()

  const choices = scanResult.folders.map(folder => ({
    name: formatFolderChoice(folder),
    value: folder.path,
    checked: true,
  }))

  const selected = await checkbox({
    message: 'Select folders to include in your brain:',
    choices,
  })

  const selectedFolders = scanResult.folders.filter(f => selected.includes(f.path))
  console.log()
  console.log(dim(`  ${formatSelectionSummary(selectedFolders)}`))

  return selected
}
