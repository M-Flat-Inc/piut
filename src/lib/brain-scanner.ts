import fs from 'fs'
import path from 'path'
import os from 'os'
import type { BuildBrainInput, ProjectInfo } from '../types.js'

export interface ScanProgress {
  phase: 'projects' | 'configs' | 'docs'
  message: string
}

export type ProgressCallback = (progress: ScanProgress) => void

const home = os.homedir()

/** Directories to skip during scanning */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', '.output',
  '.Trash', 'Library', '.cache', '.npm', '.yarn',
  '.pnpm-store', 'Caches', 'Cache', '.piut',
])

/** Files to read in full for brain building */
const FULL_READ_FILES = new Set([
  'README.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules',
  '.rules', '.clinerules',
  'AGENTS.md', 'CONVENTIONS.md', 'MEMORY.md', 'SOUL.md',
  'IDENTITY.md',
])

/** Config files that contain useful metadata */
const METADATA_FILES = new Set(['package.json'])

/** Max file size to read (100KB) */
const MAX_FILE_SIZE = 100 * 1024

/** Max age for "recent" .md files (30 days) */
const RECENT_DAYS = 30

/** Dot-directories to traverse during project scanning */
const SCAN_DOT_DIRS = new Set([
  '.claude', '.cursor', '.windsurf', '.github', '.zed', '.amazonq', '.vscode',
])

function shouldSkipDir(name: string): boolean {
  if (name.startsWith('.') && !SCAN_DOT_DIRS.has(name)) {
    return true
  }
  return SKIP_DIRS.has(name)
}

function isTextFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase()
  return ['.md', '.txt', '.json', '.yaml', '.yml', '.toml'].includes(ext)
}

function readFileSafe(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_FILE_SIZE) return null
    if (!stat.isFile()) return null
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

/** Get folder tree (names only, max 3 levels deep) */
function getFolderTree(dir: string, depth = 0, maxDepth = 3): string[] {
  if (depth >= maxDepth) return []
  const entries: string[] = []

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      if (!item.isDirectory()) continue
      if (shouldSkipDir(item.name)) continue

      const indent = '  '.repeat(depth)
      entries.push(`${indent}${item.name}/`)
      entries.push(...getFolderTree(path.join(dir, item.name), depth + 1, maxDepth))
    }
  } catch {
    // Permission denied or other error
  }

  return entries
}

/** Check if a directory is a project (has .git, package.json, etc.) */
function isProject(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, '.git')) ||
    fs.existsSync(path.join(dirPath, 'package.json')) ||
    fs.existsSync(path.join(dirPath, 'Cargo.toml')) ||
    fs.existsSync(path.join(dirPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(dirPath, 'go.mod'))
}

/** Build a ProjectInfo from a detected project directory */
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
    const content = readFileSafe(readmePath)
    if (content) {
      const lines = content.split('\n')
      let foundHeading = false
      for (const line of lines) {
        if (line.startsWith('#')) { foundHeading = true; continue }
        if (foundHeading && line.trim()) {
          description = line.trim().slice(0, 200)
          break
        }
      }
    }
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

/** Max recursion depth for project detection */
const MAX_PROJECT_DEPTH = 4

/** Detect projects in a directory (looks for git repos, package.json, etc.) */
function detectProjects(scanDirs: string[], onProgress?: ProgressCallback): ProjectInfo[] {
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
          onProgress?.({ phase: 'projects', message: `${info.name} (${fullPath.replace(home, '~')})` })
          // Don't recurse into projects (avoid subpackages/monorepo noise)
        } else {
          // Not a project — recurse deeper to find nested projects
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

/** Collect config files from projects (CLAUDE.md, .cursorrules, etc.) */
function collectConfigFiles(projects: ProjectInfo[], onProgress?: ProgressCallback): { name: string; content: string }[] {
  const configs: { name: string; content: string }[] = []

  // Global config files
  const globalPaths = [
    path.join(home, '.claude', 'MEMORY.md'),
    path.join(home, '.claude', 'CLAUDE.md'),
    path.join(home, '.openclaw', 'workspace', 'SOUL.md'),
    path.join(home, '.openclaw', 'workspace', 'MEMORY.md'),
  ]

  for (const gp of globalPaths) {
    const content = readFileSafe(gp)
    if (content && content.trim()) {
      const name = `~/${path.relative(home, gp)}`
      configs.push({ name, content })
      onProgress?.({ phase: 'configs', message: name })
    }
  }

  // Per-project config files
  for (const project of projects) {
    for (const fileName of FULL_READ_FILES) {
      const filePath = path.join(project.path, fileName)
      const content = readFileSafe(filePath)
      if (content && content.trim()) {
        const name = `${project.name}/${fileName}`
        configs.push({ name, content })
        onProgress?.({ phase: 'configs', message: name })
      }
    }

    // package.json (just name + description)
    const pkgPath = path.join(project.path, 'package.json')
    const pkgContent = readFileSafe(pkgPath)
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent)
        const summary = JSON.stringify({ name: pkg.name, description: pkg.description }, null, 2)
        const name = `${project.name}/package.json`
        configs.push({ name, content: summary })
        onProgress?.({ phase: 'configs', message: name })
      } catch { /* ignore */ }
    }
  }

  return configs
}

/** Collect recently modified .md files from projects */
function collectRecentDocs(projects: ProjectInfo[], onProgress?: ProgressCallback): { name: string; content: string }[] {
  const docs: { name: string; content: string }[] = []
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
  const seen = new Set<string>()

  for (const project of projects) {
    try {
      const items = fs.readdirSync(project.path, { withFileTypes: true })
      for (const item of items) {
        if (!item.isFile()) continue
        if (!item.name.endsWith('.md')) continue
        if (FULL_READ_FILES.has(item.name)) continue // Already collected as config
        if (item.name.startsWith('.')) continue

        const filePath = path.join(project.path, item.name)
        if (seen.has(filePath)) continue
        seen.add(filePath)

        try {
          const stat = fs.statSync(filePath)
          if (stat.mtimeMs < cutoff) continue
          if (stat.size > MAX_FILE_SIZE) continue

          const content = fs.readFileSync(filePath, 'utf-8')
          if (content.trim()) {
            const name = `${project.name}/${item.name}`
            docs.push({ name, content })
            onProgress?.({ phase: 'docs', message: name })
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  return docs.slice(0, 20) // Cap at 20 recent docs
}

/** Directories to exclude from the home folder listing */
const SKIP_HOME_DIRS = new Set([
  'Library', 'Applications', 'Public', 'Movies', 'Music', 'Pictures',
  'Templates', '.Trash',
])

/** Dot-directories to include in home folder listing (AI tool config directories) */
const INCLUDE_DOT_DIRS = new Set([
  '.claude', '.cursor', '.windsurf', '.openclaw', '.zed', '.github', '.amazonq',
])

/** Default scan directories */
function getDefaultScanDirs(): string[] {
  const dirs: string[] = []

  // List all visible directories in home, excluding system/media folders
  try {
    const entries = fs.readdirSync(home, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') && !INCLUDE_DOT_DIRS.has(entry.name)) continue
      if (SKIP_HOME_DIRS.has(entry.name)) continue
      dirs.push(path.join(home, entry.name))
    }
  } catch {
    // Permission denied — fall back to home itself
  }

  // macOS cloud storage via ~/Library/CloudStorage/ (Dropbox, OneDrive, Google Drive, etc.)
  const cloudStorage = path.join(home, 'Library', 'CloudStorage')
  try {
    if (fs.existsSync(cloudStorage) && fs.statSync(cloudStorage).isDirectory()) {
      const entries = fs.readdirSync(cloudStorage, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const fullPath = path.join(cloudStorage, entry.name)
        // Avoid duplicates (e.g. Dropbox already found at ~/Dropbox)
        if (!dirs.includes(fullPath)) {
          dirs.push(fullPath)
        }
      }
    }
  } catch {
    // Permission denied
  }

  if (dirs.length === 0) {
    dirs.push(home)
  }

  return dirs
}

/** Scan filesystem and build a structured summary for brain generation */
export function scanForBrain(folders?: string[], onProgress?: ProgressCallback): BuildBrainInput {
  const scanDirs = folders || getDefaultScanDirs()

  // Build folder tree
  const folderTree: string[] = []
  for (const dir of scanDirs) {
    folderTree.push(`${path.basename(dir)}/`)
    folderTree.push(...getFolderTree(dir, 1))
  }

  // Detect projects
  const projects = detectProjects(scanDirs, onProgress)

  // Collect config files
  const configFiles = collectConfigFiles(projects, onProgress)

  // Collect recent documents
  const recentDocuments = collectRecentDocs(projects, onProgress)

  return {
    summary: {
      folders: folderTree,
      projects: projects.map(p => ({
        name: p.name,
        path: p.path.replace(home, '~'),
        description: p.description,
      })),
      configFiles,
      recentDocuments,
    },
  }
}

/** Scan for projects that can be connected (have AI config files or could have them) */
export function scanForProjects(folders?: string[]): ProjectInfo[] {
  const scanDirs = folders || getDefaultScanDirs()
  return detectProjects(scanDirs)
}

export { getDefaultScanDirs }
