import fs from 'fs'
import path from 'path'
import os from 'os'
import type { BuildBrainInput, ProjectInfo } from '../types.js'

const home = os.homedir()

/** Directories to skip during scanning */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', '.output',
  '.Trash', 'Library', '.cache', '.npm', '.yarn',
  '.pnpm-store', 'Caches', 'Cache',
])

/** Files to read in full for brain building */
const FULL_READ_FILES = new Set([
  'README.md', 'CLAUDE.md', '.cursorrules', '.windsurfrules',
  'AGENTS.md', 'CONVENTIONS.md', 'MEMORY.md', 'SOUL.md',
  'IDENTITY.md',
])

/** Config files that contain useful metadata */
const METADATA_FILES = new Set(['package.json'])

/** Max file size to read (100KB) */
const MAX_FILE_SIZE = 100 * 1024

/** Max age for "recent" .md files (30 days) */
const RECENT_DAYS = 30

function shouldSkipDir(name: string): boolean {
  if (name.startsWith('.') && name !== '.claude' && name !== '.cursor' &&
      name !== '.windsurf' && name !== '.github' && name !== '.zed') {
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

/** Detect projects in a directory (looks for git repos, package.json, etc.) */
function detectProjects(scanDirs: string[]): ProjectInfo[] {
  const projects: ProjectInfo[] = []

  for (const dir of scanDirs) {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (!item.isDirectory()) continue
        if (shouldSkipDir(item.name)) continue

        const projectPath = path.join(dir, item.name)

        // Check for project indicators
        const hasGit = fs.existsSync(path.join(projectPath, '.git'))
        const hasPkgJson = fs.existsSync(path.join(projectPath, 'package.json'))
        const hasCargoToml = fs.existsSync(path.join(projectPath, 'Cargo.toml'))
        const hasPyproject = fs.existsSync(path.join(projectPath, 'pyproject.toml'))
        const hasGoMod = fs.existsSync(path.join(projectPath, 'go.mod'))

        if (!hasGit && !hasPkgJson && !hasCargoToml && !hasPyproject && !hasGoMod) continue

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
            // Extract first paragraph after first heading
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

        projects.push({
          name: item.name,
          path: projectPath,
          description,
          hasClaudeMd: fs.existsSync(path.join(projectPath, 'CLAUDE.md')),
          hasCursorRules: fs.existsSync(path.join(projectPath, '.cursorrules')) ||
                          fs.existsSync(path.join(projectPath, '.cursor', 'rules')),
          hasWindsurfRules: fs.existsSync(path.join(projectPath, '.windsurfrules')) ||
                            fs.existsSync(path.join(projectPath, '.windsurf', 'rules')),
          hasCopilotInstructions: fs.existsSync(path.join(projectPath, '.github', 'copilot-instructions.md')),
          hasConventionsMd: fs.existsSync(path.join(projectPath, 'CONVENTIONS.md')),
          hasZedRules: fs.existsSync(path.join(projectPath, '.zed', 'rules.md')),
        })
      }
    } catch {
      // Permission denied
    }
  }

  return projects
}

/** Collect config files from projects (CLAUDE.md, .cursorrules, etc.) */
function collectConfigFiles(projects: ProjectInfo[]): { name: string; content: string }[] {
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
      configs.push({ name: `~/${path.relative(home, gp)}`, content })
    }
  }

  // Per-project config files
  for (const project of projects) {
    for (const fileName of FULL_READ_FILES) {
      const filePath = path.join(project.path, fileName)
      const content = readFileSafe(filePath)
      if (content && content.trim()) {
        configs.push({ name: `${project.name}/${fileName}`, content })
      }
    }

    // package.json (just name + description)
    const pkgPath = path.join(project.path, 'package.json')
    const pkgContent = readFileSafe(pkgPath)
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent)
        const summary = JSON.stringify({ name: pkg.name, description: pkg.description }, null, 2)
        configs.push({ name: `${project.name}/package.json`, content: summary })
      } catch { /* ignore */ }
    }
  }

  return configs
}

/** Collect recently modified .md files from projects */
function collectRecentDocs(projects: ProjectInfo[]): { name: string; content: string }[] {
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
            docs.push({ name: `${project.name}/${item.name}`, content })
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  return docs.slice(0, 20) // Cap at 20 recent docs
}

/** Default scan directories */
function getDefaultScanDirs(): string[] {
  const dirs: string[] = []

  // Common project directories
  const candidates = [
    path.join(home, 'Projects'),
    path.join(home, 'projects'),
    path.join(home, 'Developer'),
    path.join(home, 'dev'),
    path.join(home, 'Code'),
    path.join(home, 'code'),
    path.join(home, 'src'),
    path.join(home, 'repos'),
    path.join(home, 'workspace'),
    path.join(home, 'Workspace'),
    path.join(home, 'Documents'),
    path.join(home, 'Desktop'),
  ]

  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      dirs.push(dir)
    }
  }

  // Also include home directory itself (for top-level projects)
  if (dirs.length === 0) {
    dirs.push(home)
  }

  return dirs
}

/** Scan filesystem and build a structured summary for brain generation */
export function scanForBrain(folders?: string[]): BuildBrainInput {
  const scanDirs = folders || getDefaultScanDirs()

  // Build folder tree
  const folderTree: string[] = []
  for (const dir of scanDirs) {
    folderTree.push(`${path.basename(dir)}/`)
    folderTree.push(...getFolderTree(dir, 1))
  }

  // Detect projects
  const projects = detectProjects(scanDirs)

  // Collect config files
  const configFiles = collectConfigFiles(projects)

  // Collect recent documents
  const recentDocuments = collectRecentDocs(projects)

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
