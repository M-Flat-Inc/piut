import fs from 'fs'
import path from 'path'
import { TOOLS } from './tools.js'
import { resolveConfigPaths } from './paths.js'
import { getPiutConfig, extractKeyFromConfig, extractSlugFromConfig, mergeConfig, removeFromConfig, isPiutConfigured } from './config.js'
import { readPiutConfig, writePiutConfig, writePiutSkill, hasPiutDir } from './piut-dir.js'
import { scanForProjects } from './brain-scanner.js'

/**
 * Silently update all tool and project configs that have stale API keys or slugs.
 * Called on CLI launch after authentication succeeds.
 * Returns the names of tools/configs that were updated.
 */
export function syncStaleConfigs(slug: string, apiKey: string, serverUrl: string): string[] {
  const updated: string[] = []

  // 1. Check all global + project-local tool configs
  for (const tool of TOOLS) {
    if (tool.skillOnly || !tool.generateConfig || !tool.configKey) continue

    const paths = resolveConfigPaths(tool)

    for (const { filePath, configKey } of paths) {
      if (!fs.existsSync(filePath)) continue

      const piutConfig = getPiutConfig(filePath, configKey)
      if (!piutConfig) continue

      const existingKey = extractKeyFromConfig(piutConfig)
      const existingSlug = extractSlugFromConfig(piutConfig)

      const keyStale = !!existingKey && existingKey !== apiKey
      const slugStale = !!existingSlug && existingSlug !== slug

      if (keyStale || slugStale) {
        const newConfig = tool.generateConfig(slug, apiKey)
        mergeConfig(filePath, configKey, newConfig)
        updated.push(tool.name)
      }

      break // only check first matching path per tool
    }
  }

  // 2. Check current directory's .piut/config.json
  const cwd = process.cwd()
  const existing = readPiutConfig(cwd)
  if (existing && (existing.apiKey !== apiKey || existing.slug !== slug)) {
    writePiutConfig(cwd, { slug, apiKey, serverUrl })
    updated.push('.piut/config.json')
  }

  return updated
}

/** Return names of tools that currently have piut configured. */
export function getConfiguredToolNames(): string[] {
  const names: string[] = []
  for (const tool of TOOLS) {
    if (tool.skillOnly || !tool.configKey) continue
    const paths = resolveConfigPaths(tool)
    for (const { filePath, configKey } of paths) {
      if (!fs.existsSync(filePath)) continue
      if (getPiutConfig(filePath, configKey)) {
        names.push(tool.name)
        break
      }
    }
  }
  return names
}

/**
 * Remove → wait → re-add a single config entry to force file-watching tools
 * to detect a change and re-initialize their MCP connection.
 */
async function cycleConfigEntry(filePath: string, configKey: string, freshConfig: Record<string, unknown>): Promise<void> {
  removeFromConfig(filePath, configKey)
  await new Promise((resolve) => setTimeout(resolve, 500))
  mergeConfig(filePath, configKey, freshConfig)
}

/**
 * Cycle all configured MCP tool configs (remove → wait → re-add) to force
 * tools like Cursor to re-initialize their MCP connection. Called silently
 * after a successful build+publish so changes propagate immediately.
 */
export async function cycleMcpConfigs(slug: string, apiKey: string): Promise<void> {
  for (const tool of TOOLS) {
    if (tool.skillOnly || !tool.generateConfig || !tool.configKey) continue

    const paths = resolveConfigPaths(tool)

    for (const { filePath, configKey } of paths) {
      if (!fs.existsSync(filePath)) continue
      if (!getPiutConfig(filePath, configKey)) continue

      await cycleConfigEntry(filePath, configKey, tool.generateConfig(slug, apiKey))
      break // only first matching path per tool
    }
  }
}

/**
 * Scan for connected projects and refresh their .piut/ contents:
 * - Re-write config.json with current credentials
 * - Re-fetch skill.md from piut.com
 * - Cycle project-local .vscode/mcp.json if present
 * Returns names of refreshed projects.
 */
export async function cycleProjectConfigs(slug: string, apiKey: string, serverUrl: string): Promise<string[]> {
  const projects = scanForProjects()
  const refreshed: string[] = []

  const vscodeTool = TOOLS.find(t => t.id === 'vscode')

  for (const project of projects) {
    if (!hasPiutDir(project.path)) continue

    const projectName = path.basename(project.path)

    // Refresh credentials
    writePiutConfig(project.path, { slug, apiKey, serverUrl })

    // Refresh skill.md from server
    await writePiutSkill(project.path, slug, apiKey)

    // Cycle project-local .vscode/mcp.json if it has piut configured
    if (vscodeTool?.generateConfig && vscodeTool.configKey) {
      const vscodeMcpPath = path.join(project.path, '.vscode', 'mcp.json')
      if (fs.existsSync(vscodeMcpPath) && isPiutConfigured(vscodeMcpPath, 'servers')) {
        await cycleConfigEntry(vscodeMcpPath, 'servers', vscodeTool.generateConfig(slug, apiKey))
      }
    }

    refreshed.push(projectName)
  }

  return refreshed
}
