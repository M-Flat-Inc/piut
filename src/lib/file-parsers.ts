/**
 * CLI-side file text extraction.
 * Parses documents locally before sending extracted text to the API.
 */

import fs from 'fs'
import path from 'path'
import { DOCUMENT_EXTENSIONS, PLAIN_TEXT_EXTENSIONS } from './file-types.js'

/** Max raw file size to attempt parsing (500 KB) */
const MAX_RAW_SIZE = 500 * 1024

/** Max extracted text per file (100 KB) */
const MAX_EXTRACTED_TEXT = 100 * 1024

export interface ParsedFile {
  path: string
  displayPath: string
  content: string
  format: string
  sizeBytes: number
  folder: string
}

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACTED_TEXT) return text
  return text.slice(0, MAX_EXTRACTED_TEXT)
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------------------------------------------------------------------------
// Parsers (lazy-loaded to keep startup fast)
// ---------------------------------------------------------------------------

async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  return result.text
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const { extractRawText } = await import('mammoth') as unknown as {
    extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>
  }
  const result = await extractRawText({ buffer })
  return result.value
}

async function parsePptx(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const texts: string[] = []

  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0')
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0')
      return numA - numB
    })

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async('string')
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g)
    if (matches) {
      texts.push(matches.map(m => m.replace(/<[^>]+>/g, '')).join(' '))
    }
  }

  return texts.join('\n\n')
}

async function parseAppleDoc(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)

  // Try embedded preview.pdf first
  if (zip.files['preview.pdf']) {
    const pdfBuf = await zip.files['preview.pdf'].async('nodebuffer')
    try {
      return await parsePdf(pdfBuf)
    } catch {
      // Fall through
    }
  }

  // Heuristic: extract readable text from IWA files
  const texts: string[] = []
  for (const [name, file] of Object.entries(zip.files)) {
    if (name.endsWith('.iwa') && !file.dir) {
      try {
        const buf = await file.async('nodebuffer')
        const str = buf.toString('utf-8')
        const readable = str.match(/[\x20-\x7E\xC0-\xFF]{4,}/g)
        if (readable) {
          texts.push(...readable.filter(s => s.length > 10))
        }
      } catch {
        // Skip
      }
    }
  }

  return texts.join('\n\n')
}

async function parseRtf(buffer: Buffer): Promise<string> {
  // @ts-expect-error — @iarna/rtf-to-html has no type declarations
  const { fromString } = await import('@iarna/rtf-to-html') as {
    fromString: (doc: string, cb: (err: Error | null, html: string) => void) => void
  }

  return new Promise<string>((resolve, reject) => {
    fromString(buffer.toString('utf-8'), (err: Error | null, html: string) => {
      if (err) { reject(err); return }
      resolve(stripHtml(html))
    })
  })
}

async function parseOpenDocument(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const contentXml = zip.files['content.xml']
  if (!contentXml) return ''
  return stripHtml(await contentXml.async('string'))
}

function parseEml(buffer: Buffer): string {
  const content = buffer.toString('utf-8')
  const boundaryMatch = content.match(/boundary="?([^\s"]+)"?/i)

  if (boundaryMatch) {
    const parts = content.split(`--${boundaryMatch[1]}`)
    for (const part of parts) {
      if (/content-type:\s*text\/plain/i.test(part)) {
        const bodyStart = part.indexOf('\n\n')
        if (bodyStart !== -1) return part.slice(bodyStart + 2).trim()
      }
    }
  }

  const headerEnd = content.indexOf('\n\n')
  if (headerEnd !== -1) {
    const body = content.slice(headerEnd + 2)
    if (!/<html/i.test(body.slice(0, 200))) return body.trim()
    return stripHtml(body)
  }

  return content.trim()
}

function parseMbox(buffer: Buffer): string {
  const content = buffer.toString('utf-8')
  const messages = content.split(/^From /m).filter(Boolean)
  const texts: string[] = []

  for (const msg of messages.slice(0, 50)) {
    const headerEnd = msg.indexOf('\n\n')
    if (headerEnd !== -1) {
      const body = msg.slice(headerEnd + 2)
      texts.push(!/<html/i.test(body.slice(0, 200)) ? body.trim() : stripHtml(body))
    }
  }

  return texts.join('\n\n---\n\n')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract plain text from a file on disk.
 * Returns null if the file can't be parsed or is too large.
 */
export async function extractTextFromFile(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase()

  // Check file size
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return null
    if (stat.size > MAX_RAW_SIZE) return null
  } catch {
    return null
  }

  // Plain text — read directly
  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    try {
      return truncate(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  }

  // Document format — parse
  if (!DOCUMENT_EXTENSIONS.has(ext)) return null

  try {
    const buffer = fs.readFileSync(filePath)
    let text: string

    switch (ext) {
      case '.pdf': text = await parsePdf(buffer); break
      case '.docx':
      case '.doc': text = await parseDocx(buffer); break
      case '.pptx': text = await parsePptx(buffer); break
      case '.pages':
      case '.key': text = await parseAppleDoc(buffer); break
      case '.rtf': text = await parseRtf(buffer); break
      case '.odt':
      case '.odp': text = await parseOpenDocument(buffer); break
      case '.eml': text = parseEml(buffer); break
      case '.mbox': text = parseMbox(buffer); break
      default: return null
    }

    return truncate(text)
  } catch {
    return null
  }
}

/** Format file size for display. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
