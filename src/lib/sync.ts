import fs from 'fs'
import path from 'path'
import { TOOLS } from './tools.js'
import { resolveConfigPaths } from './paths.js'
import { getPiutConfig, extractKeyFromConfig, extractSlugFromConfig, mergeConfig } from './config.js'
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
