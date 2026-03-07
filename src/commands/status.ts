import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { TOOLS } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { isPiutConfigured, getPiutConfig, extractKeyFromConfig } from '../lib/config.js'
import { scanForProjects } from '../lib/brain-scanner.js'
import { banner, success, dim, warning, toolLine, brand } from '../lib/ui.js'
import { readStore } from '../lib/store.js'
import { validateKey, verifyMcpEndpoint } from '../lib/api.js'

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

interface StatusOptions {
  verify?: boolean
}

export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  banner()

  if (options.verify) {
    await verifyStatus()
    return
  }

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

async function verifyStatus(): Promise<void> {
  const store = readStore()
  let issues = 0

  // Section 1: API Key
  console.log('  API Key')

  if (!store.apiKey) {
    console.log(warning('  \u2717 No saved API key'))
    console.log(dim('    Run ') + brand('piut setup') + dim(' to configure.'))
    issues++
    console.log()
    return
  }

  let slug: string | undefined
  let serverUrl: string | undefined
  try {
    const info = await validateKey(store.apiKey)
    slug = info.slug
    serverUrl = info.serverUrl
    const masked = store.apiKey.slice(0, 6) + '...'
    console.log(success(`  \u2714 Key valid: ${info.displayName} (${info.slug})`) + dim(`  ${masked}`))
  } catch (err: unknown) {
    console.log(warning(`  \u2717 Key invalid: ${(err as Error).message}`))
    issues++
  }

  console.log()

  // Section 2: Tool configurations
  console.log('  Tool Configurations')

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool.configPaths)

    for (const configPath of paths) {
      if (!fs.existsSync(configPath)) continue

      const piutConfig = getPiutConfig(configPath, tool.configKey)
      if (!piutConfig) {
        toolLine(tool.name, dim('installed, not connected'), '\u25cb')
        break
      }

      const configKey = extractKeyFromConfig(piutConfig)
      if (configKey && configKey === store.apiKey) {
        toolLine(tool.name, success('key matches'), '\u2714')
      } else if (configKey) {
        const masked = configKey.slice(0, 6) + '...'
        toolLine(tool.name, chalk.red(`key STALE (${masked})`), '\u2717')
        issues++
      } else {
        toolLine(tool.name, dim('configured (key not extractable)'), '\u25cb')
      }
      break
    }
  }

  console.log()

  // Section 3: MCP Server
  console.log('  MCP Server')

  if (serverUrl && store.apiKey) {
    const result = await verifyMcpEndpoint(serverUrl, store.apiKey)
    if (result.ok) {
      console.log(success(`  \u2714 ${serverUrl}`) + dim(`  ${result.tools.length} tools, ${result.latencyMs}ms`))
    } else {
      console.log(warning(`  \u2717 ${serverUrl}`) + dim(`  ${result.error}`))
      issues++
    }
  } else if (!serverUrl) {
    console.log(dim('  Skipped (no server URL)'))
  }

  console.log()

  // Summary
  if (issues > 0) {
    console.log(warning(`  Issues Found: ${issues}`))
    console.log(dim('  Run ') + brand('piut doctor') + dim(' for detailed diagnostics.'))
  } else {
    console.log(success('  All checks passed.'))
  }
  console.log()
}
