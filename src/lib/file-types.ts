/**
 * Supported file types for brain building.
 * IMPORTANT: This must stay in sync with sbaas/src/lib/file-types.ts.
 * Both files define the same extensions and logic.
 */

import path from 'path'

// Document formats (require parsing libraries)
export const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.pptx', '.pages', '.key',
  '.rtf', '.odt', '.odp', '.eml', '.mbox',
])

// Plain text formats (read as UTF-8 directly)
export const PLAIN_TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.csv', '.xml', '.html', '.htm',
  '.json', '.yaml', '.yml', '.toml', '.rst', '.adoc', '.tex',
  '.ini', '.cfg', '.conf', '.log',
])

// AI config files (identified separately, used for all brain sections)
export const AI_CONFIG_FILENAMES = new Set([
  'CLAUDE.md', '.cursorrules', '.windsurfrules', '.rules', '.clinerules',
  'AGENTS.md', 'CONVENTIONS.md', 'MEMORY.md', 'SOUL.md', 'IDENTITY.md',
  'copilot-instructions.md',
])

// All parseable extensions
export const PARSEABLE_EXTENSIONS = new Set([
  ...DOCUMENT_EXTENSIONS,
  ...PLAIN_TEXT_EXTENSIONS,
])

// Excluded extensions (code, images, binary, etc.)
export const EXCLUDED_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.pyw', '.pyi', '.rs', '.go', '.java', '.kt', '.scala', '.clj',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.rb', '.php', '.swift', '.m', '.mm',
  '.lua', '.r', '.jl', '.zig', '.nim', '.v',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql', '.proto',
  '.css', '.scss', '.sass', '.less', '.styl',
  '.xls', '.xlsx', '.numbers', '.sqlite', '.db', '.dat', '.parquet', '.avro',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.tiff', '.heic',
  '.mp3', '.mp4', '.wav', '.aac', '.flac', '.ogg',
  '.avi', '.mov', '.mkv', '.wmv', '.webm',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.dmg', '.iso',
  '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.wasm',
  '.class', '.jar', '.pyc', '.pyo',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.lock', '.map', '.min.js', '.min.css',
])

export function canParse(filename: string): boolean {
  return PARSEABLE_EXTENSIONS.has(path.extname(filename).toLowerCase())
}

export function needsParsing(filename: string): boolean {
  return DOCUMENT_EXTENSIONS.has(path.extname(filename).toLowerCase())
}

export function isAiConfigFile(filename: string): boolean {
  return AI_CONFIG_FILENAMES.has(path.basename(filename))
}

export function getFileCategory(filename: string): 'document' | 'text' | 'config' | 'excluded' | 'unknown' {
  const base = path.basename(filename)
  if (AI_CONFIG_FILENAMES.has(base)) return 'config'
  const ext = path.extname(filename).toLowerCase()
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document'
  if (PLAIN_TEXT_EXTENSIONS.has(ext)) return 'text'
  if (EXCLUDED_EXTENSIONS.has(ext)) return 'excluded'
  return 'unknown'
}
