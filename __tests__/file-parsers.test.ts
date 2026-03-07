import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { extractTextFromFile, formatSize } from '../src/lib/file-parsers.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piut-file-parsers-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('extractTextFromFile', () => {
  it('reads plain text .md files', async () => {
    const filePath = path.join(tmpDir, 'notes.md')
    fs.writeFileSync(filePath, '# My Notes\n\nSome content here.')
    const result = await extractTextFromFile(filePath)
    expect(result).toBe('# My Notes\n\nSome content here.')
  })

  it('reads plain text .txt files', async () => {
    const filePath = path.join(tmpDir, 'readme.txt')
    fs.writeFileSync(filePath, 'Hello world')
    const result = await extractTextFromFile(filePath)
    expect(result).toBe('Hello world')
  })

  it('reads .json files', async () => {
    const filePath = path.join(tmpDir, 'data.json')
    fs.writeFileSync(filePath, '{"key": "value"}')
    const result = await extractTextFromFile(filePath)
    expect(result).toBe('{"key": "value"}')
  })

  it('reads .csv files', async () => {
    const filePath = path.join(tmpDir, 'data.csv')
    fs.writeFileSync(filePath, 'name,age\nAlice,30\nBob,25')
    const result = await extractTextFromFile(filePath)
    expect(result).toContain('Alice')
  })

  it('returns null for unsupported extensions', async () => {
    const filePath = path.join(tmpDir, 'app.js')
    fs.writeFileSync(filePath, 'console.log("hi")')
    const result = await extractTextFromFile(filePath)
    expect(result).toBeNull()
  })

  it('returns null for non-existent files', async () => {
    const result = await extractTextFromFile(path.join(tmpDir, 'nope.txt'))
    expect(result).toBeNull()
  })

  it('returns null for directories', async () => {
    const dirPath = path.join(tmpDir, 'subdir')
    fs.mkdirSync(dirPath)
    const result = await extractTextFromFile(dirPath)
    expect(result).toBeNull()
  })

  it('returns null for files over 500KB', async () => {
    const filePath = path.join(tmpDir, 'huge.txt')
    fs.writeFileSync(filePath, 'x'.repeat(600 * 1024))
    const result = await extractTextFromFile(filePath)
    expect(result).toBeNull()
  })

  it('truncates extracted text to 100KB', async () => {
    const filePath = path.join(tmpDir, 'big.txt')
    // 200KB file (under 500KB raw limit)
    fs.writeFileSync(filePath, 'x'.repeat(200 * 1024))
    const result = await extractTextFromFile(filePath)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(100 * 1024)
  })

  it('parses .eml files', async () => {
    const emlContent = [
      'From: test@example.com',
      'To: user@example.com',
      'Subject: Test',
      '',
      'This is the email body.',
    ].join('\n')
    const filePath = path.join(tmpDir, 'message.eml')
    fs.writeFileSync(filePath, emlContent)
    const result = await extractTextFromFile(filePath)
    expect(result).toContain('email body')
  })

  it('parses .mbox files', async () => {
    const mboxContent = [
      'From user@example.com Mon Jan 1 00:00:00 2024',
      'From: user@example.com',
      'Subject: First',
      '',
      'Body one.',
      '',
      'From other@example.com Tue Jan 2 00:00:00 2024',
      'From: other@example.com',
      'Subject: Second',
      '',
      'Body two.',
    ].join('\n')
    const filePath = path.join(tmpDir, 'mail.mbox')
    fs.writeFileSync(filePath, mboxContent)
    const result = await extractTextFromFile(filePath)
    expect(result).toContain('Body one')
    expect(result).toContain('Body two')
  })
})

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatSize(2048)).toBe('2.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
})
