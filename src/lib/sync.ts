import fs from 'fs'
import path from 'path'
import { TOOLS } from './tools.js'
import { resolveConfigPaths } from './paths.js'
import { getPiutConfig, extractKeyFromConfig, extractSlugFromConfig, mergeConfig, removeFromConfig } from './config.js'
import { readPiutConfig, writePiutConfig } from './piut-dir.js'

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

      const existing = getPiutConfig(filePath, configKey)
      if (!existing) continue

      // Remove piut-context entry so the tool detects the server is gone
      removeFromConfig(filePath, configKey)

      // Brief pause to let file-watching tools pick up the removal
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Re-add with a fresh config — tool detects new server entry and reconnects
      const freshConfig = tool.generateConfig(slug, apiKey)
      mergeConfig(filePath, configKey, freshConfig)

      break // only first matching path per tool
    }
  }
}
