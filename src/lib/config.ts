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

/** Extract the piut-context server config object from a tool's config file. */
export function getPiutConfig(filePath: string, configKey: string): Record<string, unknown> | null {
  const config = readConfig(filePath)
  if (!config) return null
  const servers = config[configKey] as Record<string, unknown> | undefined
  const piut = servers?.['piut-context'] as Record<string, unknown> | undefined
  return piut ?? null
}

/**
 * Extract the API key from a piut-context config object.
 * Handles all 7 tool formats:
 * - Most tools: headers.Authorization = "Bearer pb_..."
 * - Claude Desktop: args array containing "Authorization: Bearer pb_..."
 * - Zed: settings.headers.Authorization = "Bearer pb_..."
 */
export function extractKeyFromConfig(piutConfig: Record<string, unknown>): string | null {
  // Standard: { headers: { Authorization: "Bearer pb_..." } }
  const headers = piutConfig.headers as Record<string, string> | undefined
  if (headers?.Authorization) {
    const match = headers.Authorization.match(/Bearer\s+(pb_\S+)/)
    if (match) return match[1]
  }

  // Zed: { settings: { headers: { Authorization: "Bearer pb_..." } } }
  const settings = piutConfig.settings as Record<string, unknown> | undefined
  if (settings) {
    const settingsHeaders = settings.headers as Record<string, string> | undefined
    if (settingsHeaders?.Authorization) {
      const match = settingsHeaders.Authorization.match(/Bearer\s+(pb_\S+)/)
      if (match) return match[1]
    }
  }

  // Claude Desktop: { args: [..., "--header", "Authorization: Bearer pb_..."] }
  const args = piutConfig.args as string[] | undefined
  if (Array.isArray(args)) {
    for (const arg of args) {
      const match = arg.match(/Bearer\s+(pb_\S+)/)
      if (match) return match[1]
    }
  }

  return null
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
