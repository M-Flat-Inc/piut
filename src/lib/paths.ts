import os from 'os'
import path from 'path'
import type { ToolDefinition } from '../types.js'

const home = os.homedir()
const platform = process.platform

export function expandPath(p: string): string {
  return p.replace(/^~/, home)
}

/** Resolve config paths for the current platform */
export function resolveConfigPaths(
  configPaths: ToolDefinition['configPaths']
): string[] {
  const resolved: string[] = []

  const platformKey = platform as 'darwin' | 'win32' | 'linux'
  const globalPaths = configPaths[platformKey] || []
  for (const p of globalPaths) {
    resolved.push(expandPath(p))
  }

  const projectPaths = configPaths.project || []
  for (const p of projectPaths) {
    resolved.push(path.resolve(process.cwd(), p))
  }

  return resolved
}
