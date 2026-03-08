import fs from 'fs'
import path from 'path'
import { checkbox, confirm } from '@inquirer/prompts'
import { scanForProjects } from '../lib/brain-scanner.js'
import { banner, success, dim, warning } from '../lib/ui.js'
import { expandPath } from '../lib/paths.js'
import { removePiutDir, hasPiutDir } from '../lib/piut-dir.js'
import { isPiutConfigured, removeFromConfig } from '../lib/config.js'
import { unregisterProject, getMachineId } from '../lib/api.js'
import { readStore } from '../lib/store.js'

interface DisconnectOptions {
  yes?: boolean
  folders?: string
}

/** Files that piut connect creates as dedicated files (can be deleted entirely) */
export const DEDICATED_FILES = new Set([
  '.cursor/rules/piut.mdc',
  '.windsurf/rules/piut.md',
  '.zed/rules.md',
])

/** Files where piut appends a section (remove the section, keep the rest) */
export const APPEND_FILES = [
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  'CONVENTIONS.md',
  'GEMINI.md',
  'AGENTS.md',
]

interface DisconnectAction {
  projectPath: string
  projectName: string
  filePath: string
  absPath: string
  action: 'delete' | 'remove-section' | 'remove-dir' | 'remove-mcp'
}

function hasPiutReference(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return content.includes('p\u0131ut Context') || content.includes('piut Context')
  } catch {
    return false
  }
}

export function removePiutSection(filePath: string): boolean {
  try {
    let content = fs.readFileSync(filePath, 'utf-8')

    // Remove the piut Context section (## piut Context through end of section or file)
    const patterns = [
      /\n*## p[ıi]ut Context[\s\S]*?(?=\n## |\n---\n|$)/g,
    ]

    let changed = false
    for (const pattern of patterns) {
      const newContent = content.replace(pattern, '')
      if (newContent !== content) {
        content = newContent
        changed = true
      }
    }

    if (changed) {
      // Clean up trailing whitespace
      content = content.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
      fs.writeFileSync(filePath, content, 'utf-8')
    }

    return changed
  } catch {
    return false
  }
}

export async function disconnectCommand(options: DisconnectOptions): Promise<void> {
  banner()

  let scanFolders: string[] | undefined
  if (options.folders) {
    scanFolders = options.folders.split(',').map(f => expandPath(f.trim()))
  }

  console.log(dim('  Scanning for connected projects...'))

  const projects = scanForProjects(scanFolders)
  const actions: DisconnectAction[] = []

  for (const project of projects) {
    const projectName = path.basename(project.path)

    // Check dedicated files
    for (const dedicatedFile of DEDICATED_FILES) {
      const absPath = path.join(project.path, dedicatedFile)
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) {
        actions.push({
          projectPath: project.path,
          projectName,
          filePath: dedicatedFile,
          absPath,
          action: 'delete',
        })
      }
    }

    // Check append files
    for (const appendFile of APPEND_FILES) {
      const absPath = path.join(project.path, appendFile)
      if (fs.existsSync(absPath) && hasPiutReference(absPath)) {
        actions.push({
          projectPath: project.path,
          projectName,
          filePath: appendFile,
          absPath,
          action: 'remove-section',
        })
      }
    }

    // Check .piut/ directory
    if (hasPiutDir(project.path)) {
      actions.push({
        projectPath: project.path,
        projectName,
        filePath: '.piut/',
        absPath: path.join(project.path, '.piut'),
        action: 'remove-dir',
      })
    }

    // Check .vscode/mcp.json for VS Code MCP config
    const vscodeMcpPath = path.join(project.path, '.vscode', 'mcp.json')
    if (fs.existsSync(vscodeMcpPath) && isPiutConfigured(vscodeMcpPath, 'servers')) {
      actions.push({
        projectPath: project.path,
        projectName,
        filePath: '.vscode/mcp.json',
        absPath: vscodeMcpPath,
        action: 'remove-mcp',
      })
    }
  }

  if (actions.length === 0) {
    console.log(dim('  No connected projects found.'))
    console.log()
    return
  }

  // Group by project
  const byProject = new Map<string, DisconnectAction[]>()
  for (const action of actions) {
    if (!byProject.has(action.projectPath)) byProject.set(action.projectPath, [])
    byProject.get(action.projectPath)!.push(action)
  }

  console.log()

  const projectChoices = Array.from(byProject.entries()).map(([projectPath, projectActions]) => {
    const name = path.basename(projectPath)
    const files = projectActions.map(a => a.filePath).join(', ')
    return {
      name: `${name} ${dim(`(${files})`)}`,
      value: projectPath,
    }
  })

  let selectedPaths: string[]

  if (options.yes) {
    selectedPaths = Array.from(byProject.keys())
  } else {
    selectedPaths = await checkbox({
      message: 'Select projects to disconnect:',
      choices: projectChoices,
    })

    if (selectedPaths.length === 0) {
      console.log(dim('  No projects selected.'))
      return
    }

    const proceed = await confirm({
      message: `Disconnect ${selectedPaths.length} project(s)?`,
      default: false,
    })
    if (!proceed) return
  }

  console.log()
  let disconnected = 0

  for (const projectPath of selectedPaths) {
    const projectActions = byProject.get(projectPath) || []
    const projectName = path.basename(projectPath)

    for (const action of projectActions) {
      if (action.action === 'delete') {
        try {
          fs.unlinkSync(action.absPath)
          console.log(success(`  ✓ ${projectName}/${action.filePath}`) + dim(' — deleted'))
          disconnected++
        } catch {
          console.log(warning(`  ✗ ${projectName}/${action.filePath}`) + dim(' — could not delete'))
        }
      } else if (action.action === 'remove-dir') {
        if (removePiutDir(action.projectPath)) {
          console.log(success(`  ✓ ${projectName}/${action.filePath}`) + dim(' — removed'))
          disconnected++
        }
      } else if (action.action === 'remove-mcp') {
        try {
          removeFromConfig(action.absPath, 'servers')
          console.log(success(`  ✓ ${projectName}/${action.filePath}`) + dim(' — piut-context removed'))
          disconnected++
        } catch {
          console.log(warning(`  ✗ ${projectName}/${action.filePath}`) + dim(' — could not update'))
        }
      } else {
        const removed = removePiutSection(action.absPath)
        if (removed) {
          console.log(success(`  ✓ ${projectName}/${action.filePath}`) + dim(' — section removed'))
          disconnected++
        } else {
          console.log(warning(`  ✗ ${projectName}/${action.filePath}`) + dim(' — section not found'))
        }
      }
    }
  }

  // Unregister projects server-side (best-effort, non-blocking)
  const store = readStore()
  if (store.apiKey) {
    const machineId = getMachineId()
    for (const projectPath of selectedPaths) {
      unregisterProject(store.apiKey, projectPath, machineId).catch(() => {
        // Best-effort — don't fail disconnect if server unregistration fails
      })
    }
  }

  console.log()
  console.log(success(`  Done. ${disconnected} file(s) updated.`))
  console.log()
}
