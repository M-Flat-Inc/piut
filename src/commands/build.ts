import { select, checkbox, input } from '@inquirer/prompts'
import chalk from 'chalk'
import os from 'os'
import { buildBrainStreaming } from '../lib/api.js'
import { scanForBrain, getDefaultScanDirs } from '../lib/brain-scanner.js'
import type { ScanProgress } from '../lib/brain-scanner.js'
import { banner, brand, success, dim, Spinner } from '../lib/ui.js'
import { resolveApiKey } from '../lib/auth.js'
import { expandPath } from '../lib/paths.js'
import { CliError } from '../types.js'

interface BuildOptions {
  key?: string
  folders?: string
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  banner()

  const apiKey = await resolveApiKey(options.key)

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
          spinner.updateTokens(event.data.tokens as number)
          break

        case 'section':
          spinner.addSection(String(event.data.name))
          break

        case 'complete':
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

    // Show final summary
    console.log()
    console.log(success('  Brain built!'))
    console.log()

    const sectionSummary = (content: string, label: string) => {
      if (!content || !content.trim()) {
        console.log(dim(`  ${label} \u2014 (empty)`))
      } else {
        const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || ''
        const preview = firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine
        console.log(success(`  ${label}`) + dim(` \u2014 ${preview}`))
      }
    }

    sectionSummary(sections.about || '', 'About')
    sectionSummary(sections.soul || '', 'Soul')
    sectionSummary(sections.areas || '', 'Areas of Responsibility')
    sectionSummary(sections.projects || '', 'Projects')
    sectionSummary(sections.memory || '', 'Memory')

    console.log()
    console.log(dim(`  Review and edit at ${brand('piut.com/dashboard')}`))
    console.log()
  } catch (err: unknown) {
    spinner.stop()
    if (err instanceof CliError) throw err
    console.log(chalk.red(`  \u2717 ${(err as Error).message}`))
    throw new CliError((err as Error).message)
  }
}
