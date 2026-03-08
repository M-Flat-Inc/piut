import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  shouldShowInTree,
  loadChildren,
  expandNode,
  collapseNode,
  getParentIndex,
} from '../src/lib/tree-prompt.js'
import type { TreeNode } from '../src/lib/tree-prompt.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-tree-prompt-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeNode(overrides: Partial<TreeNode> & { path: string; name: string }): TreeNode {
  return {
    depth: 0,
    expanded: false,
    selected: false,
    children: null,
    ...overrides,
  }
}

describe('shouldShowInTree', () => {
  it('shows regular directories', () => {
    expect(shouldShowInTree('Documents')).toBe(true)
    expect(shouldShowInTree('Desktop')).toBe(true)
    expect(shouldShowInTree('projects')).toBe(true)
  })

  it('hides .claude (collected separately)', () => {
    expect(shouldShowInTree('.claude')).toBe(false)
  })

  it('hides node_modules', () => {
    expect(shouldShowInTree('node_modules')).toBe(false)
  })

  it('hides .git', () => {
    expect(shouldShowInTree('.git')).toBe(false)
  })

  it('hides Library', () => {
    expect(shouldShowInTree('Library')).toBe(false)
  })

  it('hides .Trash', () => {
    expect(shouldShowInTree('.Trash')).toBe(false)
  })

  it('hides general dot directories', () => {
    expect(shouldShowInTree('.hidden')).toBe(false)
    expect(shouldShowInTree('.config')).toBe(false)
    expect(shouldShowInTree('.local')).toBe(false)
  })

  it('shows AI tool config dot-dirs', () => {
    expect(shouldShowInTree('.cursor')).toBe(true)
    expect(shouldShowInTree('.windsurf')).toBe(true)
    expect(shouldShowInTree('.zed')).toBe(true)
    expect(shouldShowInTree('.github')).toBe(true)
    expect(shouldShowInTree('.amazonq')).toBe(true)
    expect(shouldShowInTree('.vscode')).toBe(true)
  })

  it('hides Applications', () => {
    expect(shouldShowInTree('Applications')).toBe(false)
  })

  it('hides build artifacts', () => {
    expect(shouldShowInTree('dist')).toBe(false)
    expect(shouldShowInTree('build')).toBe(false)
    expect(shouldShowInTree('.next')).toBe(false)
  })
})

describe('loadChildren', () => {
  it('returns sorted directory entries', () => {
    fs.mkdirSync(path.join(tmpDir, 'zeta'))
    fs.mkdirSync(path.join(tmpDir, 'alpha'))
    fs.mkdirSync(path.join(tmpDir, 'beta'))

    const children = loadChildren(tmpDir, 0)
    expect(children).toHaveLength(3)
    expect(children[0].name).toBe('alpha')
    expect(children[1].name).toBe('beta')
    expect(children[2].name).toBe('zeta')
  })

  it('sets correct depth for children', () => {
    fs.mkdirSync(path.join(tmpDir, 'child'))

    const children = loadChildren(tmpDir, 2)
    expect(children[0].depth).toBe(3)
  })

  it('skips files by default (only directories)', () => {
    fs.mkdirSync(path.join(tmpDir, 'folder'))
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content')

    const children = loadChildren(tmpDir, 0)
    expect(children).toHaveLength(1)
    expect(children[0].name).toBe('folder')
  })

  it('includes files when includeFiles is true', () => {
    fs.mkdirSync(path.join(tmpDir, 'folder'))
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# Notes')
    fs.writeFileSync(path.join(tmpDir, 'data.csv'), 'a,b,c')

    const children = loadChildren(tmpDir, 0, true)
    // folder first, then files sorted alphabetically
    expect(children.length).toBe(3)
    expect(children[0].name).toBe('folder')
    expect(children[0].isFile).toBeUndefined()
    expect(children[1].name).toBe('data.csv')
    expect(children[1].isFile).toBe(true)
    expect(children[2].name).toBe('notes.md')
    expect(children[2].isFile).toBe(true)
  })

  it('hides binary files from file listing', () => {
    fs.writeFileSync(path.join(tmpDir, 'photo.png'), 'fake')
    fs.writeFileSync(path.join(tmpDir, 'archive.zip'), 'fake')
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Hi')

    const children = loadChildren(tmpDir, 0, true)
    expect(children).toHaveLength(1)
    expect(children[0].name).toBe('readme.md')
  })

  it('hides dotfiles from file listing', () => {
    fs.writeFileSync(path.join(tmpDir, '.hidden'), 'secret')
    fs.writeFileSync(path.join(tmpDir, 'visible.txt'), 'hello')

    const children = loadChildren(tmpDir, 0, true)
    expect(children).toHaveLength(1)
    expect(children[0].name).toBe('visible.txt')
  })

  it('filters out skip directories', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'))
    fs.mkdirSync(path.join(tmpDir, '.git'))
    fs.mkdirSync(path.join(tmpDir, 'real-folder'))

    const children = loadChildren(tmpDir, 0)
    expect(children).toHaveLength(1)
    expect(children[0].name).toBe('real-folder')
  })

  it('returns empty array for non-existent directory', () => {
    const children = loadChildren('/nonexistent/path/that/does/not/exist', 0)
    expect(children).toEqual([])
  })

  it('returns empty array for empty directory', () => {
    const emptyDir = path.join(tmpDir, 'empty')
    fs.mkdirSync(emptyDir)

    const children = loadChildren(emptyDir, 0)
    expect(children).toEqual([])
  })
})

describe('expandNode', () => {
  it('inserts children after the expanded node', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0 }),
      makeNode({ path: '/b', name: 'b', depth: 0 }),
    ]
    const children: TreeNode[] = [
      makeNode({ path: '/a/c1', name: 'c1', depth: 1 }),
      makeNode({ path: '/a/c2', name: 'c2', depth: 1 }),
    ]

    const result = expandNode(items, 0, children)
    expect(result).toHaveLength(4)
    expect(result[0].expanded).toBe(true)
    expect(result[1].name).toBe('c1')
    expect(result[2].name).toBe('c2')
    expect(result[3].name).toBe('b')
  })

  it('marks node as empty when no children', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0 }),
    ]

    const result = expandNode(items, 0, [])
    expect(result[0].expanded).toBe(true)
    expect(result[0].empty).toBe(true)
  })

  it('sets children on the expanded node', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0 }),
    ]
    const children: TreeNode[] = [
      makeNode({ path: '/a/child', name: 'child', depth: 1 }),
    ]

    const result = expandNode(items, 0, children)
    expect(result[0].children).toEqual(children)
  })
})

describe('collapseNode', () => {
  it('removes all descendants', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0, expanded: true }),
      makeNode({ path: '/a/b', name: 'b', depth: 1 }),
      makeNode({ path: '/a/c', name: 'c', depth: 1 }),
      makeNode({ path: '/d', name: 'd', depth: 0 }),
    ]

    const result = collapseNode(items, 0)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('a')
    expect(result[0].expanded).toBe(false)
    expect(result[1].name).toBe('d')
  })

  it('removes nested descendants', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0, expanded: true }),
      makeNode({ path: '/a/b', name: 'b', depth: 1, expanded: true }),
      makeNode({ path: '/a/b/c', name: 'c', depth: 2 }),
      makeNode({ path: '/a/d', name: 'd', depth: 1 }),
      makeNode({ path: '/e', name: 'e', depth: 0 }),
    ]

    const result = collapseNode(items, 0)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('a')
    expect(result[1].name).toBe('e')
  })

  it('handles collapsing node with no children in array', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0, expanded: true }),
      makeNode({ path: '/b', name: 'b', depth: 0 }),
    ]

    const result = collapseNode(items, 0)
    expect(result).toHaveLength(2)
    expect(result[0].expanded).toBe(false)
  })

  it('handles collapsing last item', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0 }),
      makeNode({ path: '/b', name: 'b', depth: 0, expanded: true }),
    ]

    const result = collapseNode(items, 1)
    expect(result).toHaveLength(2)
    expect(result[1].expanded).toBe(false)
  })
})

describe('getParentIndex', () => {
  it('finds the parent node', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0 }),
      makeNode({ path: '/a/b', name: 'b', depth: 1 }),
      makeNode({ path: '/a/c', name: 'c', depth: 1 }),
    ]

    expect(getParentIndex(items, 1)).toBe(0)
    expect(getParentIndex(items, 2)).toBe(0)
  })

  it('returns same index when no parent found', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0 }),
      makeNode({ path: '/b', name: 'b', depth: 0 }),
    ]

    expect(getParentIndex(items, 0)).toBe(0)
  })

  it('finds correct parent with mixed depths', () => {
    const items: TreeNode[] = [
      makeNode({ path: '/a', name: 'a', depth: 0 }),
      makeNode({ path: '/a/b', name: 'b', depth: 1 }),
      makeNode({ path: '/a/b/c', name: 'c', depth: 2 }),
    ]

    expect(getParentIndex(items, 2)).toBe(1) // parent of c is b
  })
})
