import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  displayPath,
  groupFilesByFolder,
} from '../src/lib/folder-tree.js'
import type { ParsedFile } from '../src/lib/file-parsers.js'

let tmpDir: string
let origHome: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-folder-tree-'))
  origHome = process.env.HOME || os.homedir()
  process.env.HOME = tmpDir
})

afterEach(() => {
  process.env.HOME = origHome
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function makeParsedFile(opts: Partial<ParsedFile> & { path: string; folder: string }): ParsedFile {
  return {
    displayPath: opts.displayPath || opts.path,
    content: opts.content || 'test content',
    format: opts.format || 'text',
    sizeBytes: opts.sizeBytes || 100,
    ...opts,
  }
}

describe('displayPath', () => {
  it('returns full path without tilde abbreviation', () => {
    const result = displayPath(origHome + '/Documents/file.txt')
    expect(result).toBe(origHome + '/Documents/file.txt')
  })

  it('leaves non-home paths unchanged', () => {
    expect(displayPath('/tmp/file.txt')).toBe('/tmp/file.txt')
  })
})

describe('groupFilesByFolder', () => {
  it('groups files by their folder property', () => {
    const files: ParsedFile[] = [
      makeParsedFile({ path: '/a/file1.md', folder: '/a' }),
      makeParsedFile({ path: '/a/file2.md', folder: '/a' }),
      makeParsedFile({ path: '/b/file3.md', folder: '/b' }),
    ]

    const groups = groupFilesByFolder(files)
    expect(groups).toHaveLength(2)
    const folderA = groups.find(g => g.path === '/a')
    expect(folderA).toBeDefined()
    expect(folderA!.fileCount).toBe(2)
    const folderB = groups.find(g => g.path === '/b')
    expect(folderB).toBeDefined()
    expect(folderB!.fileCount).toBe(1)
  })

  it('calculates total bytes per folder', () => {
    const files: ParsedFile[] = [
      makeParsedFile({ path: '/a/f1.md', folder: '/a', sizeBytes: 100 }),
      makeParsedFile({ path: '/a/f2.md', folder: '/a', sizeBytes: 200 }),
    ]

    const groups = groupFilesByFolder(files)
    expect(groups[0].totalBytes).toBe(300)
  })

  it('returns empty array for no files', () => {
    expect(groupFilesByFolder([])).toEqual([])
  })

  it('sorts by display path', () => {
    const files: ParsedFile[] = [
      makeParsedFile({ path: '/z/file.md', folder: '/z' }),
      makeParsedFile({ path: '/a/file.md', folder: '/a' }),
    ]

    const groups = groupFilesByFolder(files)
    expect(groups[0].path).toBe('/a')
    expect(groups[1].path).toBe('/z')
  })
})
