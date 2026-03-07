/**
 * Filesystem scanner for brain building.
 * Walks selected folders, finds parseable files, extracts text,
 * and groups results by folder for the review step.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { canParse, isAiConfigFile, AI_CONFIG_FILENAMES, getFileCategory } from './file-types.js'
import { extractTextFromFile } from './file-parsers.js'
import type { ParsedFile } from './file-parsers.js'
import { groupFilesByFolder, displayPath, getDefaultScanDirs } from './folder-tree.js'
import type { FolderScanResult } from './folder-tree.js'
import type { BuildBrainInput, ProjectInfo } from '../types.js'

export { getDefaultScanDirs } from './folder-tree.js'

const home = os.homedir()

export interface ScanProgress {
  phase: 'scanning' | 'parsing' | 'projects' | 'configs' | 'docs'
  message: string
  folder?: string
}

export type ProgressCallback = (progress: ScanProgress) => void

export interface ScanResult {
  /** All parsed personal documents, grouped by folder */
  folders: FolderScanResult[]
  /** AI config files (CLAUDE.md, .cursorrules, etc.) */
  configFiles: { name: string; content: string }[]
  /** Detected projects */
  projects: ProjectInfo[]
  /** All parsed files (flat) */
  allFiles: ParsedFile[]
  totalFiles: number
  totalBytes: number
}

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
  '.claude', '.cursor', '.windsurf', '.github', '.zed', '.amazonq', '.vscode',
  '.gemini', '.openclaw', '.mcporter', '.paperclip',
])

function shouldSkipDir(name: string): boolean {
  if (name.startsWith('.') && !SCAN_DOT_DIRS.has(name)) return true
  return SKIP_DIRS.has(name)
}

// ---------------------------------------------------------------------------
// Project detection (kept from original for config file collection)
// ---------------------------------------------------------------------------

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

function collectConfigFiles(projects: ProjectInfo[], onProgress?: ProgressCallback): { name: string; content: string }[] {
  const configs: { name: string; content: string }[] = []

  // Global config files
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
        const name = `~/${path.relative(home, gp)}`
        configs.push({ name, content })
        onProgress?.({ phase: 'configs', message: name })
      }
    } catch {
      // File doesn't exist or permission denied
    }
  }

  // Per-project config files
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
// Full filesystem scan for personal documents
// ---------------------------------------------------------------------------

const MAX_SCAN_DEPTH = 6
const MAX_FILES = 500

/** Walk directories and collect all parseable files. */
async function scanFilesInDirs(
  dirs: string[],
  onProgress?: ProgressCallback,
): Promise<ParsedFile[]> {
  const files: ParsedFile[] = []
  const seen = new Set<string>()

  function walk(dir: string, depth: number): string[] {
    if (depth > MAX_SCAN_DEPTH) return []
    const found: string[] = []

    try {
      const items = fs.readdirSync(dir, { withFileTypes: true })
      for (const item of items) {
        if (item.isDirectory()) {
          if (!shouldSkipDir(item.name)) {
            found.push(...walk(path.join(dir, item.name), depth + 1))
          }
        } else if (item.isFile()) {
          if (canParse(item.name) && !isAiConfigFile(item.name)) {
            const fullPath = path.join(dir, item.name)
            if (!seen.has(fullPath)) {
              seen.add(fullPath)
              found.push(fullPath)
            }
          }
        }
      }
    } catch {
      // Permission denied
    }

    return found
  }

  // Collect all file paths
  const allPaths: string[] = []
  for (const dir of dirs) {
    onProgress?.({ phase: 'scanning', message: displayPath(dir) })
    allPaths.push(...walk(dir, 0))
    if (allPaths.length > MAX_FILES) break
  }

  // Parse files (async for document formats)
  const pathsToProcess = allPaths.slice(0, MAX_FILES)
  for (const filePath of pathsToProcess) {
    try {
      const stat = fs.statSync(filePath)
      onProgress?.({ phase: 'parsing', message: displayPath(filePath) })

      const content = await extractTextFromFile(filePath)
      if (content && content.trim()) {
        const category = getFileCategory(filePath)
        files.push({
          path: filePath,
          displayPath: displayPath(filePath),
          content,
          format: category === 'document' ? path.extname(filePath).slice(1) : 'text',
          sizeBytes: stat.size,
          folder: path.dirname(filePath),
        })
      }
    } catch {
      // Skip unparseable files
    }
  }

  return files
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan selected folders for all parseable files + detect projects + collect config files.
 * This is the main entry point for the build command's scan phase.
 */
export async function scanFolders(
  dirs: string[],
  onProgress?: ProgressCallback,
): Promise<ScanResult> {
  // 1. Scan for personal documents (async — parses PDFs, DOCX, etc.)
  const allFiles = await scanFilesInDirs(dirs, onProgress)
  const folders = groupFilesByFolder(allFiles)

  // 2. Detect projects and collect config files (sync — fast)
  const projects = detectProjects(dirs, onProgress)
  const configFiles = collectConfigFiles(projects, onProgress)

  const totalFiles = allFiles.length
  const totalBytes = allFiles.reduce((sum, f) => sum + f.sizeBytes, 0)

  return { folders, configFiles, projects, allFiles, totalFiles, totalBytes }
}

/**
 * Build the API input from a scan result, filtered to selected folders.
 */
export function buildBrainInput(
  scanResult: ScanResult,
  selectedFolderPaths: string[],
): BuildBrainInput {
  const selectedSet = new Set(selectedFolderPaths)

  // Filter files to selected folders
  const selectedFiles = scanResult.allFiles.filter(f => selectedSet.has(f.folder))

  // Build folder tree lines for display
  const folderTree: string[] = []
  for (const folder of scanResult.folders) {
    if (selectedSet.has(folder.path)) {
      folderTree.push(`${folder.displayPath}/ (${folder.fileCount} files)`)
    }
  }

  // Separate personal documents from config-like files
  const personalDocuments = selectedFiles.map(f => ({
    name: f.displayPath,
    content: f.content,
    format: f.format,
  }))

  return {
    summary: {
      folders: folderTree,
      projects: scanResult.projects.map(p => ({
        name: p.name,
        path: p.path.replace(home, '~'),
        description: p.description,
      })),
      configFiles: scanResult.configFiles,
      recentDocuments: [],
      personalDocuments,
    },
  }
}

/** Scan for projects that can be connected (used by connect command). */
export function scanForProjects(folders?: string[]): ProjectInfo[] {
  const scanDirs = folders || getDefaultScanDirs()
  return detectProjects(scanDirs)
}
