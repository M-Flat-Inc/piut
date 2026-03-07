import { select, checkbox, input, confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import os from 'os'
import { buildBrainStreaming, publishServer } from '../lib/api.js'
import { scanForBrain, getDefaultScanDirs } from '../lib/brain-scanner.js'
import type { ScanProgress } from '../lib/brain-scanner.js'
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

  // Determine scan folders
  let scanFolders: string[] | undefined
  if (options.folders) {
    scanFolders = options.folders.split(',').map(f => expandPath(f.trim()))
  }

  const cwd = process.cwd()
  const cwdDisplay = cwd.replace(os.homedir(), '~')

  if (!scanFolders) {
    // Show where we are and what we're about to do
    console.log(dim(`  Current directory: `) + cwdDisplay)
    console.log(dim(`  We'll scan for AI config files and projects here.`))
    console.log()

    const mode = await select({
      message: 'How do you want to build your brain?',
      choices: [
        { name: `Scan this directory (${cwdDisplay})`, value: 'cwd' as const, description: 'Scan current directory for projects and config files' },
        { name: 'Select folder(s)...', value: 'folders' as const, description: 'Choose a different directory to scan' },
      ],
    })

    if (mode === 'cwd') {
      scanFolders = [cwd]
    } else {
      const defaults = getDefaultScanDirs()
      const CUSTOM_VALUE = '__custom__'

      const choices = [
        ...defaults.map(d => ({ name: d.replace(os.homedir(), '~'), value: d })),
        { name: chalk.dim('Enter a custom path...'), value: CUSTOM_VALUE },
      ]

      const selected = await checkbox({
        message: 'Which folders should we scan?',
        choices,
        required: true,
      })

      // If user picked the custom path option, prompt for it
      if (selected.includes(CUSTOM_VALUE)) {
        const custom = await input({
          message: 'Enter folder path(s), comma-separated:',
        })
        const customPaths = custom.split(',').map(f => expandPath(f.trim())).filter(Boolean)
        scanFolders = [
          ...selected.filter(v => v !== CUSTOM_VALUE),
          ...customPaths,
        ]
      } else {
        scanFolders = selected
      }

      if (scanFolders.length === 0) {
        console.log(chalk.yellow('  No folders selected.'))
        return
      }
    }
  }

  console.log()

  // --- Phase 1: Filesystem scan with live listing ---
  let projectCount = 0
  let configCount = 0
  let docCount = 0

  const onProgress = (progress: ScanProgress) => {
    if (progress.phase === 'projects') {
      projectCount++
      console.log(dim(`  [${projectCount}] ${progress.message}`))
    } else if (progress.phase === 'configs') {
      configCount++
      console.log(dim(`  [${configCount}] ${progress.message}`))
    } else if (progress.phase === 'docs') {
      docCount++
      console.log(dim(`  [${docCount}] ${progress.message}`))
    }
  }

  // Scan filesystem
  const brainInput = scanForBrain(scanFolders, onProgress)

  const projCount = brainInput.summary.projects.length
  const cfgCount = brainInput.summary.configFiles.length
  const dcCount = brainInput.summary.recentDocuments.length

  console.log()
  console.log(success(`  Scanned: ${projCount} projects, ${cfgCount} config files, ${dcCount} recent docs`))
  console.log()

  if (projCount === 0 && cfgCount === 0) {
    console.log(chalk.yellow('  No projects or config files found to build from.'))
    console.log(dim('  Try running from a directory with your projects, or use --folders.'))
    console.log()
    return
  }

  // --- Phase 2: AI generation with streaming progress ---
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
          // Token count intentionally not displayed (not user's tokens)
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
          console.log(chalk.red(`  \u2717 ${event.data.message || 'Build failed'}`))
          throw new CliError(String(event.data.message || 'Build failed'))
      }
    }

    spinner.stop()

    if (!sections) {
      console.log(chalk.red('  \u2717 No response received from server'))
      throw new CliError('No response received from server')
    }

    // Show brain content
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
        console.log(dim(`  ${label} \u2014 (empty)`))
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

    // Ask to publish (--yes auto-publishes, --no-publish skips)
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
        console.log(success('  \u2713 Brain published. MCP server is live.'))
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
          console.log(chalk.red(`  \u2717 ${msg}`))
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
    // Network/stream errors often show cryptic messages \u2014 give a helpful hint
    const hint = msg === 'terminated' || msg.includes('network') || msg.includes('fetch')
      ? 'The build was interrupted. This can happen if your scan data is very large. Try using --folders to limit which directories are scanned.'
      : msg
    console.log(chalk.red(`  \u2717 ${hint}`))
    throw new CliError(hint)
  }
}
