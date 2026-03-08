/**
 * Thrown instead of process.exit(1) so the interactive menu can catch
 * errors and return to the menu instead of killing the process.
 */
export class CliError extends Error {
  constructor(message?: string) {
    super(message || '')
    this.name = 'CliError'
  }
}

export interface ToolDefinition {
  id: string
  name: string
  /** JSON key that holds MCP servers (e.g., "mcpServers", "servers", "context_servers").
   *  Omit for skill-only tools that don't have MCP config files. */
  configKey?: string
  /** Dot-separated key path for global config files with nested structure.
   *  E.g., "mcp.servers" for VS Code settings.json where servers are at config.mcp.servers.
   *  When set, global config paths use this key path instead of configKey. */
  globalConfigKey?: string
  /** Config file paths by platform. Also used for detection — if the parent directory
   *  of any path exists, the tool is considered "installed". */
  configPaths: {
    darwin?: string[]
    win32?: string[]
    linux?: string[]
    project?: string[]
  }
  /** Skill file path (relative to project root) */
  skillFilePath?: string
  /** Quick command alternative (e.g., claude mcp add-json) */
  quickCommand?: (slug: string, key: string) => string
  /** Generate the server config object for this tool.
   *  Omit for skill-only tools — they'll be detected but MCP config won't be written. */
  generateConfig?: (slug: string, key: string) => Record<string, unknown>
  /** True if this tool can only be configured via skill files, not MCP config.
   *  Shown with a "(skill only)" label in the UI. */
  skillOnly?: boolean
}

export interface DetectedTool {
  tool: ToolDefinition
  configPath: string
  /** The resolved configKey for this specific path (may differ for global vs project configs) */
  resolvedConfigKey: string
  exists: boolean
  alreadyConfigured: boolean
  /** True if piut exists but has a different API key than the one being used */
  staleKey?: boolean
}

export type ValidateStatus = 'active' | 'unpublished' | 'no_brain'

export interface ValidateResponse {
  slug: string
  displayName: string
  serverUrl: string
  planType: string
  status: ValidateStatus
  _contractVersion: string
}

export interface LoginResponse {
  apiKey: string
  slug: string
  displayName: string
  serverUrl: string
  planType: string
  status: ValidateStatus
  _contractVersion: string
}

export interface BrainSections {
  about: string
  soul: string
  areas: string
  projects: string
  memory: string
}

export interface BuildBrainInput {
  summary: {
    projects: { name: string; path: string; description: string }[]
    configFiles: { name: string; content: string }[]
  }
}

export interface ProjectInfo {
  name: string
  path: string
  description: string
  hasClaudeMd: boolean
  hasCursorRules: boolean
  hasWindsurfRules: boolean
  hasCopilotInstructions: boolean
  hasConventionsMd: boolean
  hasZedRules: boolean
}

// ---------------------------------------------------------------------------
// Vault types
// ---------------------------------------------------------------------------

export interface VaultFile {
  filename: string
  extension: string
  sizeBytes: number
  summary: string | null
  createdAt: string
}

export interface VaultListResponse {
  files: VaultFile[]
  usage: {
    totalBytes: number
    maxBytes: number
    fileCount: number
  }
}

export interface VaultUploadResponse {
  filename: string
  extension: string
  sizeBytes: number
  summary: string | null
}

export interface VaultReadResponse {
  filename: string
  extension: string
  sizeBytes: number
  summary: string | null
  content: string
}
