/**
 * Folder enumeration, grouping, and display helpers for the build command.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ParsedFile } from './file-parsers.js'
import { formatSize } from './file-parsers.js'

export interface FolderScanResult {
  path: string
  displayPath: string
  files: ParsedFile[]
  fileCount: number
  totalBytes: number
}

const home = os.homedir()

/** Replace home dir prefix with ~ for display. */
export function displayPath(p: string): string {
  return p.startsWith(home) ? '~' + p.slice(home.length) : p
}

/** Group parsed files by their parent folder. */
export function groupFilesByFolder(files: ParsedFile[]): FolderScanResult[] {
  const map = new Map<string, ParsedFile[]>()

  for (const file of files) {
    const folder = file.folder
    if (!map.has(folder)) map.set(folder, [])
    map.get(folder)!.push(file)
  }

  const results: FolderScanResult[] = []
  for (const [folderPath, folderFiles] of map) {
    results.push({
      path: folderPath,
      displayPath: displayPath(folderPath),
      files: folderFiles,
      fileCount: folderFiles.length,
      totalBytes: folderFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
    })
  }

  // Sort by display path for consistent ordering
  results.sort((a, b) => a.displayPath.localeCompare(b.displayPath))
  return results
}

/** Format a folder scan result as a display line for checkbox. */
export function formatFolderChoice(folder: FolderScanResult): string {
  return `${folder.displayPath} — ${folder.fileCount} file${folder.fileCount === 1 ? '' : 's'} (${formatSize(folder.totalBytes)})`
}

/** Format a summary line for selected folders. */
export function formatSelectionSummary(folders: FolderScanResult[]): string {
  const totalFiles = folders.reduce((sum, f) => sum + f.fileCount, 0)
  const totalBytes = folders.reduce((sum, f) => sum + f.totalBytes, 0)
  return `${folders.length} folder${folders.length === 1 ? '' : 's'} selected (${totalFiles} file${totalFiles === 1 ? '' : 's'}, ${formatSize(totalBytes)})`
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
  '.claude', '.cursor', '.windsurf', '.openclaw', '.zed', '.github', '.amazonq',
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
