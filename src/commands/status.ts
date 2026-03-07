import fs from 'fs'
import path from 'path'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { isPiutConfigured } from '../lib/config.js'
import { scanForProjects } from '../lib/brain-scanner.js'
import { banner, success, dim, warning, toolLine, brand } from '../lib/ui.js'

/** Files that piut connect creates or appends to */
const PIUT_FILES = [
  'CLAUDE.md',
  '.cursor/rules/piut.mdc',
  '.windsurf/rules/piut.md',
  '.github/copilot-instructions.md',
  'CONVENTIONS.md',
  '.zed/rules.md',
]

function hasPiutReference(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.includes('p\u0131ut Context') || content.includes('piut Context')
  } catch {
    return false
  }
}

export function statusCommand(): void {
  banner()

  // Section 1: AI tool configuration
  console.log('  AI tool configuration:')
  console.log()

  let foundAny = false

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool.configPaths)

    for (const configPath of paths) {
      if (!fs.existsSync(configPath)) continue

      foundAny = true
      const configured = isPiutConfigured(configPath, tool.configKey)

      if (configured) {
        toolLine(tool.name, success('connected'), '\u2714')
      } else {
        toolLine(tool.name, dim('installed, not connected'), '\u25cb')
      }
      break
    }
  }

  if (!foundAny) {
    console.log(warning('  No supported AI tools detected.'))
    console.log(dim('  Run ') + brand('piut setup') + dim(' to configure your AI tools.'))
  }

  console.log()

  // Section 2: Connected projects
  console.log('  Connected projects:')
  console.log()

  const projects = scanForProjects()
  let connectedCount = 0

  for (const project of projects) {
    const connectedFiles: string[] = []
    for (const file of PIUT_FILES) {
      const absPath = path.join(project.path, file)
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) {
        connectedFiles.push(file)
      }
    }

    if (connectedFiles.length > 0) {
      connectedCount++
      console.log(success(`  \u2714 ${project.name}`) + dim(` (${connectedFiles.join(', ')})`))
    }
  }

  if (connectedCount === 0) {
    console.log(dim('  No projects connected.'))
    console.log(dim('  Run ') + brand('piut connect') + dim(' to add brain references to your projects.'))
  } else {
    console.log()
    console.log(dim(`  ${connectedCount} project(s) connected to your brain.`))
  }

  console.log()
}
