/**
 * Interactive tree browser prompt for file and folder selection.
 * Built on @inquirer/core's createPrompt API.
 *
 * Usage:
 *   // Select folders:
 *   const folders = await treePrompt({ message: 'Select folders:', root: os.homedir() })
 *
 *   // Select files:
 *   const files = await treePrompt({ message: 'Select files:', root: os.homedir(), mode: 'files' })
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  createPrompt,
  useState,
  useKeypress,
  usePagination,
  useRef,
  isUpKey,
  isDownKey,
  isSpaceKey,
  isEnterKey,
} from '@inquirer/core'
import chalk from 'chalk'

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface TreeNode {
  path: string
  name: string
  depth: number
  expanded: boolean
  selected: boolean
  children: TreeNode[] | null // null = not loaded
  error?: boolean
  empty?: boolean
  isFile?: boolean
}

// ---------------------------------------------------------------------------
// Directory filtering
// ---------------------------------------------------------------------------

const TREE_SKIP = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', '.output',
  '.Trash', 'Library', '.cache', '.npm', '.yarn',
  '.pnpm-store', 'Caches', 'Cache', '.piut',
  'Applications', 'Public', 'Movies', 'Music', 'Pictures', 'Templates',
])

const TREE_INCLUDE_DOT_DIRS = new Set([
  '.cursor', '.windsurf', '.openclaw', '.zed', '.github', '.amazonq',
  '.gemini', '.mcporter', '.paperclip', '.vscode',
])

export function shouldShowInTree(name: string): boolean {
  if (TREE_SKIP.has(name)) return false
  if (name.startsWith('.') && !TREE_INCLUDE_DOT_DIRS.has(name)) return false
  return true
}

/** File extensions hidden from the tree browser (binary, compiled, etc.) */
const HIDDEN_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.heic',
  '.mp3', '.mp4', '.wav', '.aac', '.flac', '.ogg',
  '.avi', '.mov', '.mkv', '.wmv', '.webm',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.dmg', '.iso',
  '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.wasm',
  '.class', '.jar', '.pyc', '.pyo',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.lock', '.map',
])

function shouldShowFile(name: string): boolean {
  if (name.startsWith('.')) return false
  const ext = path.extname(name).toLowerCase()
  return !HIDDEN_FILE_EXTENSIONS.has(ext)
}

// ---------------------------------------------------------------------------
// Tree operations (pure, testable)
// ---------------------------------------------------------------------------

/** Read a directory and return filtered, sorted child TreeNodes. */
export function loadChildren(parentPath: string, parentDepth: number, includeFiles = false): TreeNode[] {
  try {
    const entries = fs.readdirSync(parentPath, { withFileTypes: true })
    const dirs: TreeNode[] = []
    const files: TreeNode[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!shouldShowInTree(entry.name)) continue
        dirs.push({
          path: path.join(parentPath, entry.name),
          name: entry.name,
          depth: parentDepth + 1,
          expanded: false,
          selected: false,
          children: null,
        })
      } else if (includeFiles && entry.isFile()) {
        if (!shouldShowFile(entry.name)) continue
        files.push({
          path: path.join(parentPath, entry.name),
          name: entry.name,
          depth: parentDepth + 1,
          expanded: false,
          selected: false,
          children: null,
          isFile: true,
        })
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))
    // Directories first, then files
    return [...dirs, ...files]
  } catch {
    return []
  }
}

/** Insert children into the flat items array after the node at `index`. */
export function expandNode(items: TreeNode[], index: number, children: TreeNode[]): TreeNode[] {
  const result = [...items]
  result[index] = { ...result[index], expanded: true, children, empty: children.length === 0 }
  result.splice(index + 1, 0, ...children)
  return result
}

/** Remove all descendants of the node at `index` from the flat array. */
export function collapseNode(items: TreeNode[], index: number): TreeNode[] {
  const node = items[index]
  const result = [...items]
  result[index] = { ...result[index], expanded: false }

  // Remove all items after index with depth > node.depth
  let removeCount = 0
  for (let i = index + 1; i < result.length; i++) {
    if (result[i].depth > node.depth) {
      removeCount++
    } else {
      break
    }
  }

  if (removeCount > 0) {
    result.splice(index + 1, removeCount)
  }

  return result
}

/** Find the index of the parent node (nearest preceding node with depth - 1). */
export function getParentIndex(items: TreeNode[], index: number): number {
  const targetDepth = items[index].depth - 1
  for (let i = index - 1; i >= 0; i--) {
    if (items[i].depth === targetDepth) return i
  }
  return index // no parent found, stay put
}

// ---------------------------------------------------------------------------
// Prompt config & creation
// ---------------------------------------------------------------------------

interface TreePromptConfig {
  message: string
  root?: string
  pageSize?: number
  /** 'folders' (default) selects directories; 'files' shows and selects files */
  mode?: 'folders' | 'files'
}

const treePrompt = createPrompt<string[], TreePromptConfig>((config, done) => {
  const root = config.root ?? os.homedir()
  const pageSize = config.pageSize ?? 15
  const mode = config.mode ?? 'folders'
  const includeFiles = mode === 'files'
  const prefix = chalk.green('?')

  const childrenCache = useRef(new Map<string, TreeNode[]>()).current

  // Initialize with root's children
  const [items, setItems] = useState<TreeNode[]>(() => {
    const rootChildren = loadChildren(root, -1, includeFiles) // depth -1 so children are depth 0
    childrenCache.set(root, rootChildren)
    return rootChildren
  })

  const [active, setActive] = useState(0)
  const [done_, setDone] = useState(false)

  useKeypress((event) => {
    if (done_) return

    if (isEnterKey(event)) {
      const selected = items.filter(n => n.selected).map(n => n.path)
      setDone(true)
      done(selected)
      return
    }

    if (isUpKey(event)) {
      setActive(Math.max(0, active - 1))
      return
    }

    if (isDownKey(event)) {
      setActive(Math.min(items.length - 1, active + 1))
      return
    }

    if (isSpaceKey(event)) {
      const node = items[active]
      // In files mode, only allow selecting files
      if (includeFiles && !node.isFile) return
      // In folders mode, only allow selecting folders
      if (!includeFiles && node.isFile) return

      const updated = [...items]
      updated[active] = { ...updated[active], selected: !updated[active].selected }
      setItems(updated)
      return
    }

    // Right arrow: expand (directories only)
    if (event.name === 'right') {
      const node = items[active]
      if (node.isFile) return // can't expand a file
      if (node.expanded) return // already expanded

      let children: TreeNode[]
      if (childrenCache.has(node.path)) {
        children = childrenCache.get(node.path)!
      } else {
        children = loadChildren(node.path, node.depth, includeFiles)
        childrenCache.set(node.path, children)
      }

      setItems(expandNode(items, active, children))
      return
    }

    // Left arrow: collapse or go to parent
    if (event.name === 'left') {
      const node = items[active]
      if (!node.isFile && node.expanded) {
        setItems(collapseNode(items, active))
      } else {
        const parentIdx = getParentIndex(items, active)
        setActive(parentIdx)
      }
      return
    }
  })

  // Render
  if (done_) {
    const selected = items.filter(n => n.selected)
    const label = includeFiles ? 'file' : 'folder'
    const summary = selected.length === 0
      ? chalk.dim(`no ${label}s selected`)
      : selected.map(n => n.isFile ? n.name : n.path).join(', ')
    return `${prefix} ${config.message} ${chalk.cyan(summary)}`
  }

  const page = usePagination<TreeNode>({
    items,
    active,
    pageSize,
    loop: false,
    renderItem({ item, isActive }) {
      const indent = '  '.repeat(item.depth + 1)

      if (item.isFile) {
        const marker = item.selected ? chalk.green('\u25CF ') : '\u25CB ' // ● or ○
        const line = `${indent}  ${marker}${item.name}`
        return isActive ? chalk.cyan(line) : line
      }

      const icon = item.expanded ? '\u25BE' : '\u25B8' // ▾ or ▸
      const name = `${item.name}/`
      const suffix = item.error ? chalk.dim(' (permission denied)') : item.empty ? chalk.dim(' (empty)') : ''

      if (includeFiles) {
        // In file mode, folders aren't selectable — no marker
        const line = `${indent}${icon} ${name}${suffix}`
        return isActive ? chalk.cyan(line) : chalk.dim(line)
      }

      const marker = item.selected ? chalk.green('\u25CF ') : '\u25CB ' // ● or ○
      const line = `${indent}${icon} ${marker}${name}${suffix}`
      return isActive ? chalk.cyan(line) : line
    },
  })

  const selectHint = includeFiles ? 'space select file' : 'space select'
  const help = chalk.dim(`  \u2191\u2193 navigate  \u2192 expand  \u2190 collapse  ${selectHint}  enter done`)
  const header = chalk.dim(`  ${root}`)

  return `${prefix} ${config.message}\n${help}\n${header}\n${page}`
})

export default treePrompt
