import fs from 'fs'
import path from 'path'

/** Read a JSON config file. Returns null if file doesn't exist or can't be parsed. */
export function readConfig(filePath: string): Record<string, unknown> | null {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }

  // Try parsing raw JSON first (handles most cases correctly)
  try {
    return JSON.parse(raw)
  } catch {
    // Fall back to stripping comments (for VS Code JSONC files)
    try {
      const cleaned = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')   // Block comments
        .replace(/^(\s*)\/\/.*$/gm, '$1')   // Line comments at start of line only
      return JSON.parse(cleaned)
    } catch {
      return null
    }
  }
}

/** Write a JSON config file, creating parent directories if needed. */
export function writeConfig(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

/** Check if piut-context is already configured in a config file. */
export function isPiutConfigured(filePath: string, configKey: string): boolean {
  const config = readConfig(filePath)
  if (!config) return false
  const servers = config[configKey] as Record<string, unknown> | undefined
  return !!servers?.['piut-context']
}

/** Merge piut-context into an existing config, preserving all other content. */
export function mergeConfig(
  filePath: string,
  configKey: string,
  serverConfig: Record<string, unknown>
): void {
  const existing = readConfig(filePath) || {}
  const servers = (existing[configKey] as Record<string, unknown>) || {}

  servers['piut-context'] = serverConfig
  existing[configKey] = servers

  writeConfig(filePath, existing)
}

/** Remove piut-context from a config file. Returns true if found and removed. */
export function removeFromConfig(filePath: string, configKey: string): boolean {
  const config = readConfig(filePath)
  if (!config) return false

  const servers = config[configKey] as Record<string, unknown> | undefined
  if (!servers?.['piut-context']) return false

  delete servers['piut-context']

  if (Object.keys(servers).length === 0) {
    delete config[configKey]
  }

  writeConfig(filePath, config)
  return true
}
