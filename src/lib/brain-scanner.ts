/**
 * Project detection and AI config file collection for brain building.
 * Walks selected folders, finds projects, and collects AI config files.
 *
 * Document scanning was removed — users upload files via the vault instead.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { isAiConfigFile, AI_CONFIG_FILENAMES } from './file-types.js'

const home = os.homedir()

export interface ScanProgress {
  phase: 'projects' | 'configs'
  message: string
}

export type ProgressCallback = (progress: ScanProgress) => void

// ---------------------------------------------------------------------------
// Skip lists
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', '.output',
  '.Trash', 'Library', '.cache', '.npm', '.yarn',
  '.pnpm-store', 'Caches', 'Cache', '.piut',
])

const SCAN_DOT_DIRS = new Set([
  '.cursor', '.windsurf', '.github', '.zed', '.amazonq', '.vscode',
  '.gemini', '.openclaw', '.mcporter', '.paperclip',
  // .claude intentionally excluded — useful files collected by collectGlobalConfigFiles()
])

function shouldSkipDir(name: string): boolean {
  if (name.startsWith('.') && !SCAN_DOT_DIRS.has(name)) return true
  return SKIP_DIRS.has(name)
}

// ---------------------------------------------------------------------------
// Default scan directories
// ---------------------------------------------------------------------------

/** Directories to exclude from home folder listing */
const SKIP_HOME_DIRS = new Set([
  'Library', 'Applications', 'Public', 'Movies', 'Music', 'Pictures',
  'Templates', '.Trash',
])

/** Dot-directories to include in home listing (AI tool configs) */
const INCLUDE_DOT_DIRS = new Set([
  '.cursor', '.windsurf', '.openclaw', '.zed', '.github', '.amazonq',
  '.gemini', '.mcporter', '.paperclip',
  // .claude excluded — useful files collected by collectGlobalConfigFiles()
])

/** Get default scan directories (home subdirs + cloud storage). */
export function getDefaultScanDirs(): string[] {
  const dirs: string[] = []

  try {
    const entries = fs.readdirSync(home, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') && !INCLUDE_DOT_DIRS.has(entry.name)) continue
      if (SKIP_HOME_DIRS.has(entry.name)) continue
      dirs.push(path.join(home, entry.name))
    }
  } catch {
    // Permission denied
  }

  // macOS cloud storage
  const cloudStorage = path.join(home, 'Library', 'CloudStorage')
  try {
    if (fs.existsSync(cloudStorage) && fs.statSync(cloudStorage).isDirectory()) {
      const entries = fs.readdirSync(cloudStorage, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const fullPath = path.join(cloudStorage, entry.name)
        if (!dirs.includes(fullPath)) {
          dirs.push(fullPath)
        }
      }
    }
  } catch {
    // Permission denied
  }

  if (dirs.length === 0) dirs.push(home)
  return dirs
}

// ---------------------------------------------------------------------------
// Project detection
// ---------------------------------------------------------------------------

import type { ProjectInfo } from '../types.js'

function isProject(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, '.git')) ||
    fs.existsSync(path.join(dirPath, 'package.json')) ||
    fs.existsSync(path.join(dirPath, 'Cargo.toml')) ||
    fs.existsSync(path.join(dirPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(dirPath, 'go.mod'))
}

function buildProjectInfo(projectPath: string): ProjectInfo {
  const hasPkgJson = fs.existsSync(path.join(projectPath, 'package.json'))

  let description = ''
  if (hasPkgJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'))
      description = pkg.description || ''
    } catch { /* ignore */ }
  }

  const readmePath = path.join(projectPath, 'README.md')
  if (!description && fs.existsSync(readmePath)) {
    try {
      const content = fs.readFileSync(readmePath, 'utf-8')
      const lines = content.split('\n')
      let foundHeading = false
      for (const line of lines) {
        if (line.startsWith('#')) { foundHeading = true; continue }
        if (foundHeading && line.trim()) {
          description = line.trim().slice(0, 200)
          break
        }
      }
    } catch { /* ignore */ }
  }

  return {
    name: path.basename(projectPath),
    path: projectPath,
    description,
    hasClaudeMd: fs.existsSync(path.join(projectPath, 'CLAUDE.md')) ||
                 fs.existsSync(path.join(projectPath, '.claude', 'rules')),
    hasCursorRules: fs.existsSync(path.join(projectPath, '.cursorrules')) ||
                    fs.existsSync(path.join(projectPath, '.cursor', 'rules')),
    hasWindsurfRules: fs.existsSync(path.join(projectPath, '.windsurfrules')) ||
                      fs.existsSync(path.join(projectPath, '.windsurf', 'rules')),
    hasCopilotInstructions: fs.existsSync(path.join(projectPath, '.github', 'copilot-instructions.md')) ||
                            fs.existsSync(path.join(projectPath, '.github', 'instructions')),
    hasConventionsMd: fs.existsSync(path.join(projectPath, 'CONVENTIONS.md')) ||
                      fs.existsSync(path.join(projectPath, '.amazonq', 'rules')),
    hasZedRules: fs.existsSync(path.join(projectPath, '.rules')),
  }
}

const MAX_PROJECT_DEPTH = 4

export function detectProjects(scanDirs: string[], onProgress?: ProgressCallback): ProjectInfo[] {
  const projects: ProjectInfo[] = []
  const seen = new Set<string>()

  function walk(dir: string, depth: number): void {
    if (depth > MAX_PROJECT_DEPTH) return
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (!item.isDirectory()) continue
        if (shouldSkipDir(item.name)) continue

        const fullPath = path.join(dir, item.name)
        if (seen.has(fullPath)) continue
        seen.add(fullPath)

        if (isProject(fullPath)) {
          const info = buildProjectInfo(fullPath)
          projects.push(info)
          onProgress?.({ phase: 'projects', message: `${info.name} (${fullPath})` })
        } else {
          walk(fullPath, depth + 1)
        }
      }
    } catch {
      // Permission denied
    }
  }

  for (const dir of scanDirs) {
    walk(dir, 0)
  }
  return projects
}

// ---------------------------------------------------------------------------
// Config file collection
// ---------------------------------------------------------------------------

const MAX_CONFIG_SIZE = 100 * 1024

/** 1MB cap on total brain input data. */
export const MAX_BRAIN_INPUT_BYTES = 1_000_000

/** Collect global AI config files (~/.claude/MEMORY.md, etc.). Always runs. */
export function collectGlobalConfigFiles(onProgress?: ProgressCallback): { name: string; content: string }[] {
  const configs: { name: string; content: string }[] = []

  const globalPaths = [
    path.join(home, '.claude', 'MEMORY.md'),
    path.join(home, '.claude', 'CLAUDE.md'),
    path.join(home, '.openclaw', 'workspace', 'SOUL.md'),
    path.join(home, '.openclaw', 'workspace', 'MEMORY.md'),
    path.join(home, '.gemini', 'MEMORY.md'),
    path.join(home, '.paperclip', 'IDENTITY.md'),
  ]

  for (const gp of globalPaths) {
    try {
      const stat = fs.statSync(gp)
      if (!stat.isFile() || stat.size > MAX_CONFIG_SIZE) continue
      const content = fs.readFileSync(gp, 'utf-8')
      if (content.trim()) {
        const name = path.relative(home, gp)
        configs.push({ name, content })
        onProgress?.({ phase: 'configs', message: name })
      }
    } catch {
      // File doesn't exist or permission denied
    }
  }

  return configs
}

/** Collect per-project AI config files (CLAUDE.md, .cursorrules, etc.). */
export function collectProjectConfigFiles(projects: ProjectInfo[], onProgress?: ProgressCallback): { name: string; content: string }[] {
  const configs: { name: string; content: string }[] = []

  for (const project of projects) {
    for (const fileName of AI_CONFIG_FILENAMES) {
      const filePath = path.join(project.path, fileName)
      try {
        const stat = fs.statSync(filePath)
        if (!stat.isFile() || stat.size > MAX_CONFIG_SIZE) continue
        const content = fs.readFileSync(filePath, 'utf-8')
        if (content.trim()) {
          const name = `${project.name}/${fileName}`
          configs.push({ name, content })
          onProgress?.({ phase: 'configs', message: name })
        }
      } catch {
        // File doesn't exist
      }
    }

    // package.json (just name + description)
    const pkgPath = path.join(project.path, 'package.json')
    try {
      const stat = fs.statSync(pkgPath)
      if (stat.isFile() && stat.size <= MAX_CONFIG_SIZE) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        const summary = JSON.stringify({ name: pkg.name, description: pkg.description }, null, 2)
        configs.push({ name: `${project.name}/package.json`, content: summary })
        onProgress?.({ phase: 'configs', message: `${project.name}/package.json` })
      }
    } catch { /* ignore */ }
  }

  return configs
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Scan for projects that can be connected (used by connect command). */
export function scanForProjects(folders?: string[]): ProjectInfo[] {
  const scanDirs = folders || getDefaultScanDirs()
  return detectProjects(scanDirs)
}

/** Format file size for display. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
