import os from 'os'
import path from 'path'
import type { ToolDefinition } from '../types.js'

export function expandPath(p: string): string {
  return p.replace(/^~/, os.homedir())
}

export interface ResolvedConfigPath {
  filePath: string
  configKey: string
}

/** Resolve config paths for the current platform, each annotated with its configKey.
 *  Global paths use tool.globalConfigKey (if set), project paths use tool.configKey. */
export function resolveConfigPaths(
  tool: Pick<ToolDefinition, 'configPaths' | 'configKey' | 'globalConfigKey'>
): ResolvedConfigPath[] {
  const resolved: ResolvedConfigPath[] = []
  const configKey = tool.configKey || ''

  const platformKey = process.platform as 'darwin' | 'win32' | 'linux'
  const globalPaths = tool.configPaths[platformKey] || []
  for (const p of globalPaths) {
    resolved.push({ filePath: expandPath(p), configKey: tool.globalConfigKey || configKey })
  }

  const projectPaths = tool.configPaths.project || []
  for (const p of projectPaths) {
    resolved.push({ filePath: path.resolve(process.cwd(), p), configKey })
  }

  return resolved
}
