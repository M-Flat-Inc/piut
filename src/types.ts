export interface ToolDefinition {
  id: string
  name: string
  /** JSON key that holds MCP servers (e.g., "mcpServers", "servers", "context_servers") */
  configKey: string
  /** Config file paths by platform */
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
  /** Generate the server config object for this tool */
  generateConfig: (slug: string, key: string) => Record<string, unknown>
}

export interface DetectedTool {
  tool: ToolDefinition
  configPath: string
  exists: boolean
  alreadyConfigured: boolean
}

export interface ValidateResponse {
  slug: string
  displayName: string
  serverUrl: string
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
    folders: string[]
    projects: { name: string; path: string; description: string }[]
    configFiles: { name: string; content: string }[]
    recentDocuments: { name: string; content: string }[]
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
