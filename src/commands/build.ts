import { select } from '@inquirer/prompts'
import chalk from 'chalk'
import { buildBrain } from '../lib/api.js'
import { scanForBrain, getDefaultScanDirs } from '../lib/brain-scanner.js'
import { banner, brand, success, dim } from '../lib/ui.js'
import { resolveApiKey } from '../lib/auth.js'
import { expandPath } from '../lib/paths.js'

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

  // Ask build mode
  const mode = scanFolders ? 'auto' : await select({
    message: 'How do you want to build your brain?',
    choices: [
      { name: 'Automatically (recommended)', value: 'auto' as const, description: 'Scan your files and build automatically' },
      { name: 'Select folder(s)...', value: 'folders' as const, description: 'Choose specific folders to scan' },
    ],
  })

  if (mode === 'folders' && !scanFolders) {
    const defaults = getDefaultScanDirs()
    console.log()
    console.log(dim('  Detected directories:'))
    for (const d of defaults) {
      console.log(dim(`    ${d}`))
    }
    console.log()
    console.log(dim('  Tip: pass --folders ~/Projects,~/Documents to specify directly'))
    scanFolders = defaults
  }

  console.log()
  console.log(dim('  Building your brain...'))
  console.log()

  // Scan filesystem
  const input = scanForBrain(scanFolders)

  const projCount = input.summary.projects.length
  const configCount = input.summary.configFiles.length
  const docCount = input.summary.recentDocuments.length

  console.log(dim(`  Scanned: ${projCount} projects, ${configCount} config files, ${docCount} recent docs`))
  console.log()

  if (projCount === 0 && configCount === 0) {
    console.log(chalk.yellow('  No projects or config files found to build from.'))
    console.log(dim('  Try running from a directory with your projects, or use --folders.'))
    console.log()
    return
  }

  // Call the build-brain API
  try {
    const sections = await buildBrain(apiKey, input)

    // Show summary of each section
    const sectionSummary = (content: string, label: string) => {
      if (!content || !content.trim()) {
        console.log(dim(`  ${label} — (empty)`))
      } else {
        const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || ''
        const preview = firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine
        console.log(success(`  ${label}`) + dim(` — ${preview}`))
      }
    }

    console.log(success('  Brain built!'))
    console.log()
    sectionSummary(sections.about, 'About')
    sectionSummary(sections.soul, 'Soul')
    sectionSummary(sections.areas, 'Areas of Responsibility')
    sectionSummary(sections.projects, 'Projects')
    sectionSummary(sections.memory, 'Memory')

    console.log()
    console.log(dim(`  Review and edit at ${brand('piut.com/dashboard')}`))
    console.log()
  } catch (err: unknown) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`))
    process.exit(1)
  }
}
