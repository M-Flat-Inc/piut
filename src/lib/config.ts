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

/** Navigate a dot-separated key path (e.g., "mcp.servers") to get the nested object. */
function resolveKeyPath(config: Record<string, unknown>, keyPath: string): Record<string, unknown> | undefined {
  const parts = keyPath.split('.')
  let current: unknown = config
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current as Record<string, unknown> | undefined
}

/** Ensure all intermediate objects exist for a dot-separated key path, then set the value. */
function setAtKeyPath(config: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split('.')
  let current: Record<string, unknown> = config
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {}
    }
    current = current[parts[i]] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
}

/** Check if piut-context is already configured in a config file.
 *  configKey supports dot-separated paths (e.g., "mcp.servers"). */
export function isPiutConfigured(filePath: string, configKey: string): boolean {
  const config = readConfig(filePath)
  if (!config) return false
  const servers = resolveKeyPath(config, configKey)
  return !!servers?.['piut-context']
}

/** Merge piut-context into an existing config, preserving all other content.
 *  configKey supports dot-separated paths (e.g., "mcp.servers"). */
export function mergeConfig(
  filePath: string,
  configKey: string,
  serverConfig: Record<string, unknown>
): void {
  const existing = readConfig(filePath) || {}
  const servers = (resolveKeyPath(existing, configKey) || {}) as Record<string, unknown>

  servers['piut-context'] = serverConfig
  setAtKeyPath(existing, configKey, servers)

  writeConfig(filePath, existing)
}

/** Extract the piut-context server config object from a tool's config file.
 *  configKey supports dot-separated paths (e.g., "mcp.servers"). */
export function getPiutConfig(filePath: string, configKey: string): Record<string, unknown> | null {
  const config = readConfig(filePath)
  if (!config) return null
  const servers = resolveKeyPath(config, configKey)
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

/**
 * Extract the MCP slug from a piut-context config object's URL.
 * Handles all tool formats (url, serverUrl, httpUrl, settings.url, args array).
 */
export function extractSlugFromConfig(piutConfig: Record<string, unknown>): string | null {
  const slugFromUrl = (u: unknown): string | null => {
    if (typeof u !== 'string') return null
    const m = u.match(/\/api\/mcp\/([^/?#]+)/)
    return m ? m[1] : null
  }

  // Standard: { url: "https://piut.com/api/mcp/SLUG" }
  const fromUrl = slugFromUrl(piutConfig.url) || slugFromUrl(piutConfig.serverUrl) || slugFromUrl(piutConfig.httpUrl)
  if (fromUrl) return fromUrl

  // Zed: { settings: { url: "..." } }
  const settings = piutConfig.settings as Record<string, unknown> | undefined
  if (settings) {
    const fromSettings = slugFromUrl(settings.url)
    if (fromSettings) return fromSettings
  }

  // Claude Desktop: { args: [..., "https://piut.com/api/mcp/SLUG", ...] }
  const args = piutConfig.args as string[] | undefined
  if (Array.isArray(args)) {
    for (const arg of args) {
      const fromArg = slugFromUrl(arg)
      if (fromArg) return fromArg
    }
  }

  return null
}

/** Remove piut-context from a config file. Returns true if found and removed.
 *  configKey supports dot-separated paths (e.g., "mcp.servers"). */
export function removeFromConfig(filePath: string, configKey: string): boolean {
  const config = readConfig(filePath)
  if (!config) return false

  const servers = resolveKeyPath(config, configKey)
  if (!servers?.['piut-context']) return false

  delete servers['piut-context']

  // Clean up empty parent objects for simple (non-nested) keys
  if (Object.keys(servers).length === 0 && !configKey.includes('.')) {
    delete config[configKey]
  }

  writeConfig(filePath, config)
  return true
}
