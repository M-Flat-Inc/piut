import fs from 'fs'
import path from 'path'
import os from 'os'
import { TOOLS } from './tools.js'
import { resolveConfigPaths } from './paths.js'
import { expandPath } from './paths.js'

/** Known agent config file patterns to scan for */
const KNOWN_FILES = [
  'CLAUDE.md',
  '.claude/MEMORY.md',
  '.claude/settings.json',
  'AGENTS.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
  '.cursor/rules/*.md',
  '.cursor/rules/*.mdc',
  '.windsurf/rules/*.md',
  '.claude/rules/*.md',
  'CONVENTIONS.md',
  '.zed/rules.md',
]

/** Global file paths to scan (in home directory) */
const GLOBAL_FILES = [
  '~/.claude/MEMORY.md',
  '~/.claude/settings.local.json',
  '~/.openclaw/workspace/SOUL.md',
  '~/.openclaw/workspace/MEMORY.md',
  '~/.openclaw/workspace/IDENTITY.md',
  '~/.config/agent/IDENTITY.md',
]

export interface ScannedFile {
  /** Absolute path to the file */
  absolutePath: string
  /** Relative path for display (from home or cwd) */
  displayPath: string
  /** File size in bytes */
  sizeBytes: number
  /** Category for grouping in output */
  category: string
  /** Whether it's a global or project file */
  type: 'global' | 'project'
  /** Project name (directory name for project files, 'Global' for globals) */
  projectName: string
}

export interface InstalledTool {
  name: string
  id: string
}

/** Detect which AI tools are installed by checking for their config paths */
export function detectInstalledTools(): InstalledTool[] {
  const installed: InstalledTool[] = []

  for (const tool of TOOLS) {
    const paths = resolveConfigPaths(tool.configPaths)
    for (const configPath of paths) {
      if (fs.existsSync(configPath) || fs.existsSync(path.dirname(configPath))) {
        installed.push({ name: tool.name, id: tool.id })
        break
      }
    }
  }

  return installed
}

/** Map tool IDs to display categories */
function toolCategory(toolId: string): string {
  const map: Record<string, string> = {
    'claude-code': 'Claude Code',
    'claude-desktop': 'Claude Desktop',
    'cursor': 'Cursor Rules',
    'windsurf': 'Windsurf Rules',
    'copilot': 'VS Code / Copilot',
    'amazon-q': 'Amazon Q',
    'zed': 'Zed',
  }
  return map[toolId] || toolId
}

/** Categorize a file based on its path */
function categorizeFile(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.includes('.claude/') || lower.includes('claude.md')) return 'Claude Code'
  if (lower.includes('.cursor/') || lower.includes('.cursorrules')) return 'Cursor Rules'
  if (lower.includes('.windsurf/') || lower.includes('.windsurfrules')) return 'Windsurf Rules'
  if (lower.includes('.github/copilot')) return 'VS Code / Copilot'
  if (lower.includes('.aws/amazonq')) return 'Amazon Q'
  if (lower.includes('.zed/')) return 'Zed'
  if (lower.includes('.openclaw/')) return 'OpenClaw'
  return 'Custom'
}

/** Simple glob matching for patterns like *.md, *.mdc */
function matchesGlob(filename: string, pattern: string): boolean {
  if (!pattern.includes('*')) return filename === pattern
  const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')
  return regex.test(filename)
}

/** Scan a directory for files matching known patterns */
function scanDirectory(dir: string, patterns: string[]): string[] {
  const found: string[] = []

  for (const pattern of patterns) {
    const parts = pattern.split('/')
    if (parts.length === 1) {
      // Simple filename match
      const filePath = path.join(dir, pattern)
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        found.push(filePath)
      }
    } else {
      // Path with directories - check if last part has a glob
      const lastPart = parts[parts.length - 1]
      const dirPart = parts.slice(0, -1).join('/')
      const fullDir = path.join(dir, dirPart)

      if (lastPart.includes('*')) {
        // Glob in last segment - list directory and match
        if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
          try {
            const entries = fs.readdirSync(fullDir)
            for (const entry of entries) {
              if (matchesGlob(entry, lastPart)) {
                const fullPath = path.join(fullDir, entry)
                if (fs.statSync(fullPath).isFile()) {
                  found.push(fullPath)
                }
              }
            }
          } catch {
            // Permission denied or other error, skip
          }
        }
      } else {
        // Exact path
        const filePath = path.join(dir, pattern)
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          found.push(filePath)
        }
      }
    }
  }

  return found
}

/** Scan workspace for agent config files */
export function scanForFiles(workspaceDirs?: string[]): ScannedFile[] {
  const home = os.homedir()
  const files: ScannedFile[] = []
  const seen = new Set<string>()

  // 1. Scan global files
  for (const globalPath of GLOBAL_FILES) {
    const absPath = expandPath(globalPath)
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      if (seen.has(absPath)) continue
      seen.add(absPath)
      files.push({
        absolutePath: absPath,
        displayPath: globalPath,
        sizeBytes: fs.statSync(absPath).size,
        category: 'Global',
        type: 'global',
        projectName: 'Global',
      })
    }
  }

  // 2. Scan workspace directories
  const dirs = workspaceDirs || [process.cwd()]
  for (const dir of dirs) {
    const absDir = path.resolve(dir)
    if (!fs.existsSync(absDir)) continue

    const foundPaths = scanDirectory(absDir, KNOWN_FILES)
    for (const filePath of foundPaths) {
      if (seen.has(filePath)) continue
      seen.add(filePath)

      const relativePath = path.relative(absDir, filePath)
      const projectName = path.basename(absDir)

      files.push({
        absolutePath: filePath,
        displayPath: path.relative(home, filePath).startsWith('..')
          ? filePath
          : '~/' + path.relative(home, filePath),
        sizeBytes: fs.statSync(filePath).size,
        category: categorizeFile(filePath),
        type: 'project',
        projectName,
      })
    }
  }

  return files
}

/** Format file size for display */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}
