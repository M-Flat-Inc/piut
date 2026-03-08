import { confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import os from 'os'
import { buildBrainStreaming, publishServer } from '../lib/api.js'
import {
  detectProjects,
  collectGlobalConfigFiles,
  collectProjectConfigFiles,
  scanFilesInDirs,
  getDefaultScanDirs,
  MAX_BRAIN_INPUT_BYTES,
} from '../lib/brain-scanner.js'
import type { ScanProgress } from '../lib/brain-scanner.js'
import type { ParsedFile } from '../lib/file-parsers.js'
import { formatSize } from '../lib/file-parsers.js'
import treePrompt from '../lib/tree-prompt.js'
import { banner, brand, success, dim, Spinner } from '../lib/ui.js'
import { resolveApiKeyWithResult } from '../lib/auth.js'
import { expandPath } from '../lib/paths.js'
import { CliError } from '../types.js'
import type { BuildBrainInput } from '../types.js'

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
  // --folders flag: scan ALL parseable files in specified dirs (power user)
  // =========================================================================

  if (options.folders) {
    const scanDirs = options.folders.split(',').map(f => expandPath(f.trim()))
    await runFullScan(scanDirs, apiKey, serverUrl, options)
    return
  }

  // =========================================================================
  // Phase A: Auto-scan for AI config files (local, fast)
  // =========================================================================

  console.log(dim('  ━━━ BUILD YOUR BRAIN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log()
  console.log(dim('  Scanning for AI config files...'))
  console.log()

  const cwd = process.cwd()
  const homeDirs = getDefaultScanDirs()
  // Deduplicate: CWD might overlap with a home subdir
  const allScanDirs = [cwd, ...homeDirs.filter(d => !d.startsWith(cwd) && !cwd.startsWith(d))]

  const onProgress = (progress: ScanProgress) => {
    if (progress.phase === 'projects') {
      console.log(dim(`  [project] ${progress.message}`))
    } else if (progress.phase === 'configs') {
      console.log(dim(`  [config] ${progress.message}`))
    }
  }

  const projects = detectProjects(allScanDirs, onProgress)
  const globalConfigs = collectGlobalConfigFiles(onProgress)
  const projectConfigs = collectProjectConfigFiles(projects, onProgress)
  const allConfigs = [...globalConfigs, ...projectConfigs]

  console.log()
  if (allConfigs.length > 0) {
    console.log(success(`  ✓ Found ${allConfigs.length} config file${allConfigs.length === 1 ? '' : 's'} in ${projects.length} project${projects.length === 1 ? '' : 's'}`))
  } else {
    console.log(dim('  No AI config files found.'))
  }

  // =========================================================================
  // Phase B: Optional manual folder add
  // =========================================================================

  let manualFiles: ParsedFile[] = []

  if (!options.yes) {
    console.log()
    const addMore = await confirm({
      message: 'Add additional folders to scan?',
      default: false,
    })

    if (addMore) {
      const folders = await treePrompt({
        message: 'Select folders:',
        root: os.homedir(),
      })

      if (folders.length > 0) {
        console.log()
        console.log(dim('  Scanning selected folders...'))
        console.log()

        let fileCount = 0
        const scanProgress = (progress: ScanProgress) => {
          if (progress.phase === 'scanning') {
            console.log(dim(`  ${progress.message}`))
          } else if (progress.phase === 'parsing') {
            fileCount++
            console.log(dim(`    [${fileCount}] ${progress.message}`))
          }
        }

        manualFiles = await scanFilesInDirs(folders, scanProgress)
        console.log()
        console.log(success(`  ✓ Found ${manualFiles.length} file${manualFiles.length === 1 ? '' : 's'} in selected folders`))
      }
    }
  }

  // =========================================================================
  // Phase C: 1MB cap enforcement
  // =========================================================================

  const configBytes = allConfigs.reduce((sum, c) => sum + Buffer.byteLength(c.content, 'utf-8'), 0)
  const manualBytes = manualFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
  const totalBytes = configBytes + manualBytes
  const totalFiles = allConfigs.length + manualFiles.length

  if (totalFiles === 0) {
    console.log()
    console.log(chalk.yellow('  No files found to build your brain.'))
    console.log(dim('  Try adding folders with additional content, or use --folders to specify paths.'))
    console.log()
    return
  }

  if (totalBytes > MAX_BRAIN_INPUT_BYTES) {
    console.log()
    console.log(chalk.yellow(`  Total data: ${formatSize(totalBytes)} exceeds the 1MB limit.`))
    console.log(dim('  Try selecting fewer folders or use --folders to specify specific directories.'))
    console.log()
    return
  }

  // =========================================================================
  // Phase D: Consent Gate (before any network call)
  // =========================================================================

  if (!options.yes) {
    console.log()
    console.log(dim('  ━━━ READY TO BUILD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
    console.log()
    console.log(dim(`  ${totalFiles} file${totalFiles === 1 ? '' : 's'} (${formatSize(totalBytes)}) will be sent to p\u0131ut and`))
    console.log(dim('  processed by Claude Sonnet to design your brain.'))
    console.log(dim('  File contents are used for brain generation only and'))
    console.log(dim('  are not retained.'))
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
  // Phase E: Build brain
  // =========================================================================

  const brainInput = buildInput(allConfigs, manualFiles, projects)

  await streamBuild(apiKey, serverUrl, brainInput, options)
}

// ---------------------------------------------------------------------------
// --folders path: full scan of specified directories (existing behavior)
// ---------------------------------------------------------------------------

async function runFullScan(
  scanDirs: string[],
  apiKey: string,
  serverUrl: string,
  options: BuildOptions,
): Promise<void> {
  console.log(dim('  ━━━ BUILD YOUR BRAIN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log()
  console.log(dim('  Scanning specified folders...'))
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

  const allFiles = await scanFilesInDirs(scanDirs, onProgress)
  const projects = detectProjects(scanDirs, onProgress)
  const globalConfigs = collectGlobalConfigFiles(onProgress)
  const projectConfigs = collectProjectConfigFiles(projects, onProgress)
  const allConfigs = [...globalConfigs, ...projectConfigs]

  const configBytes = allConfigs.reduce((sum, c) => sum + Buffer.byteLength(c.content, 'utf-8'), 0)
  const manualBytes = allFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
  const totalBytes = configBytes + manualBytes
  const totalFiles = allConfigs.length + allFiles.length

  console.log()
  console.log(success(`  ✓ Scan complete: ${totalFiles} files found (${formatSize(totalBytes)})`))

  if (totalFiles === 0) {
    console.log(chalk.yellow('  No parseable files found in the selected folders.'))
    console.log(dim('  Try scanning a different directory.'))
    console.log()
    return
  }

  if (totalBytes > MAX_BRAIN_INPUT_BYTES) {
    console.log()
    console.log(chalk.yellow(`  Total data: ${formatSize(totalBytes)} exceeds the 1MB limit.`))
    console.log(dim('  Try selecting fewer or smaller directories.'))
    console.log()
    return
  }

  if (!options.yes) {
    console.log()
    console.log(dim(`  ${totalFiles} file${totalFiles === 1 ? '' : 's'} (${formatSize(totalBytes)}) will be sent to p\u0131ut and`))
    console.log(dim('  processed by Claude Sonnet to design your brain.'))
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

  const brainInput = buildInput(allConfigs, allFiles, projects)
  await streamBuild(apiKey, serverUrl, brainInput, options)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildInput(
  configFiles: { name: string; content: string }[],
  manualFiles: ParsedFile[],
  projects: { name: string; path: string; description: string }[],
): BuildBrainInput {
  const home = os.homedir()

  const personalDocuments = manualFiles.map(f => ({
    name: f.displayPath,
    content: f.content,
    format: f.format,
  }))

  const folderTree: string[] = []
  const seenFolders = new Set<string>()
  for (const f of manualFiles) {
    if (!seenFolders.has(f.folder)) {
      seenFolders.add(f.folder)
      folderTree.push(`${f.folder}/ (scanned)`)
    }
  }

  return {
    summary: {
      folders: folderTree,
      projects: projects.map(p => ({
        name: p.name,
        path: p.path.replace(home, '~'),
        description: p.description,
      })),
      configFiles,
      recentDocuments: [],
      personalDocuments,
    },
  }
}

async function streamBuild(
  apiKey: string,
  serverUrl: string,
  brainInput: BuildBrainInput,
  options: BuildOptions,
): Promise<void> {
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

    // Brain Preview
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
