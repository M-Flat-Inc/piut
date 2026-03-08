import { confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import os from 'os'
import { buildBrainStreaming, publishServer } from '../lib/api.js'
import {
  detectProjects,
  collectGlobalConfigFiles,
  collectProjectConfigFiles,
  getDefaultScanDirs,
  formatSize,
  MAX_BRAIN_INPUT_BYTES,
} from '../lib/brain-scanner.js'
import type { ScanProgress } from '../lib/brain-scanner.js'
import { banner, brand, success, dim, Spinner } from '../lib/ui.js'
import { resolveApiKeyWithResult } from '../lib/auth.js'
import { cycleMcpConfigs } from '../lib/sync.js'
import { CliError } from '../types.js'
import type { BuildBrainInput } from '../types.js'

interface BuildOptions {
  key?: string
  yes?: boolean
  publish?: boolean
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  banner()

  const { apiKey, serverUrl, slug } = await resolveApiKeyWithResult(options.key)

  // =========================================================================
  // Phase A: Auto-scan for AI config files + detect projects (local, fast)
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
  // Phase B: Size check
  // =========================================================================

  const totalBytes = allConfigs.reduce((sum, c) => sum + Buffer.byteLength(c.content, 'utf-8'), 0)
  const totalFiles = allConfigs.length

  if (totalFiles === 0) {
    console.log()
    console.log(chalk.yellow('  No config files found to build your brain.'))
    console.log(dim('  Add AI config files (CLAUDE.md, .cursorrules, etc.) to your projects,'))
    console.log(dim('  or upload documents via: piut vault upload <file>'))
    console.log()
    return
  }

  if (totalBytes > MAX_BRAIN_INPUT_BYTES) {
    console.log()
    console.log(chalk.yellow(`  Total data: ${formatSize(totalBytes)} exceeds the 1MB limit.`))
    console.log()
    return
  }

  // =========================================================================
  // Phase C: Consent Gate (before any network call)
  // =========================================================================

  if (!options.yes) {
    console.log()
    console.log(dim('  ━━━ READY TO BUILD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
    console.log()
    console.log(dim(`  ${totalFiles} file${totalFiles === 1 ? '' : 's'} (${formatSize(totalBytes)}) will be processed by Claude Sonnet to design your brain.`))
    console.log(dim('  File contents are used for brain generation only and'))
    console.log(dim(`  are not retained by p\u0131ut.`))
    console.log()
    console.log(dim(`  Privacy policy: ${brand('https://piut.com/privacy')}`))
    console.log()

    const consent = await confirm({
      message: 'Proceed?',
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
  // Phase D: Build brain
  // =========================================================================

  const home = os.homedir()
  const brainInput: BuildBrainInput = {
    summary: {
      projects: projects.map(p => ({
        name: p.name,
        path: p.path.replace(home, '~'),
        description: p.description,
      })),
      configFiles: allConfigs,
    },
  }

  await streamBuild(apiKey, serverUrl, slug, brainInput, options)
}

// ---------------------------------------------------------------------------
// Stream build response
// ---------------------------------------------------------------------------

async function streamBuild(
  apiKey: string,
  serverUrl: string,
  slug: string,
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

        // Silently cycle MCP configs so tools reconnect with fresh data
        await cycleMcpConfigs(slug, apiKey)
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
    console.log(chalk.red(`  ✗ ${msg}`))
    throw new CliError(msg)
  }
}
