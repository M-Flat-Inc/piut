import fs from 'fs'
import os from 'os'
import path from 'path'
import chalk from 'chalk'
import { TOOLS, getMachineId } from '../lib/tools.js'
import { resolveConfigPaths } from '../lib/paths.js'
import { isPiutConfigured, getPiutConfig, extractKeyFromConfig } from '../lib/config.js'
import { scanForProjects } from '../lib/brain-scanner.js'
import { banner, success, dim, warning, toolLine, brand } from '../lib/ui.js'
import { readStore } from '../lib/store.js'
import { validateKey, verifyMcpEndpoint } from '../lib/api.js'

const API_BASE = process.env.PIUT_API_BASE || 'https://piut.com'

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

interface RemoteConnection {
  tool_name: string
  auth_method: string
  last_connected_at: string
  request_count: number
  hostname: string | null
  machine_id: string
}

interface RemoteProject {
  projectName: string
  projectPath: string
  machineId: string
  hostname: string | null
  toolsDetected: string[]
  updatedAt: string
}

async function fetchRemoteConnections(key: string): Promise<RemoteConnection[]> {
  try {
    const res = await fetch(`${API_BASE}/api/mcp/connections`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.connections || []
  } catch {
    return []
  }
}

async function fetchRemoteProjects(key: string): Promise<RemoteProject[]> {
  try {
    const res = await fetch(`${API_BASE}/api/cli/projects`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.projects || []
  } catch {
    return []
  }
}

function machineLabel(hostname: string | null, machineId: string): string {
  if (hostname) return hostname
  if (machineId && machineId !== 'unknown') return machineId.slice(0, 8)
  return 'unknown'
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
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

  const thisHostname = os.hostname()
  const thisMachineId = getMachineId()

  // Section 1: Local AI tool configuration
  console.log(`  AI tools on this machine ${dim(`(${thisHostname})`)}:`)
  console.log()

  let foundAny = false

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool)

    for (const { filePath, configKey } of paths) {
      if (!fs.existsSync(filePath)) continue

      foundAny = true
      const configured = isPiutConfigured(filePath, configKey)

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

  // Section 2: Local connected projects
  console.log(`  Connected projects on this machine:`)
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

  // Section 3: All connections across machines (from cloud)
  const store = readStore()
  if (store.apiKey) {
    const [remoteConnections, remoteProjects] = await Promise.all([
      fetchRemoteConnections(store.apiKey),
      fetchRemoteProjects(store.apiKey),
    ])

    // Show remote connections from other machines
    const otherMachineConns = remoteConnections.filter(c => c.machine_id !== thisMachineId)
    const otherMachineProjects = remoteProjects.filter(p => p.machineId !== thisMachineId)

    if (otherMachineConns.length > 0 || otherMachineProjects.length > 0) {
      console.log(`  Other machines:`)
      console.log()

      if (otherMachineConns.length > 0) {
        for (const conn of otherMachineConns) {
          const machine = machineLabel(conn.hostname, conn.machine_id)
          const age = timeAgo(conn.last_connected_at)
          console.log(dim(`  ${conn.tool_name}`) + dim(` @${machine}`) + dim(` — ${conn.request_count} requests, ${age}`))
        }
      }

      if (otherMachineProjects.length > 0) {
        for (const proj of otherMachineProjects) {
          const machine = machineLabel(proj.hostname, proj.machineId)
          console.log(dim(`  ${proj.projectName}`) + dim(` @${machine}:${proj.projectPath}`))
        }
      }

      console.log()
    }
  }
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
    const paths = resolveConfigPaths(tool)

    for (const { filePath, configKey } of paths) {
      if (!fs.existsSync(filePath)) continue

      const piutConfig = getPiutConfig(filePath, configKey)
      if (!piutConfig) {
        toolLine(tool.name, dim('installed, not connected'), '\u25cb')
        break
      }

      const extractedKey = extractKeyFromConfig(piutConfig)
      if (extractedKey && extractedKey === store.apiKey) {
        toolLine(tool.name, success('key matches'), '\u2714')
      } else if (extractedKey) {
        const masked = extractedKey.slice(0, 6) + '...'
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
