/**
 * AI config file identification for brain building.
 * Document/text extension lists were removed — the CLI no longer scans
 * for personal documents (users upload files via the vault instead).
 *
 * IMPORTANT: The sbaas version (src/lib/file-types.ts) retains the full
 * extension lists for dashboard file uploads. Only the CLI was simplified.
 */

import path from 'path'

// AI config files (identified by filename, used for brain building)
export const AI_CONFIG_FILENAMES = new Set([
  'CLAUDE.md', '.cursorrules', '.windsurfrules', '.rules', '.clinerules',
  'AGENTS.md', 'CONVENTIONS.md', 'MEMORY.md', 'SOUL.md', 'IDENTITY.md',
  'copilot-instructions.md',
])

export function isAiConfigFile(filename: string): boolean {
  return AI_CONFIG_FILENAMES.has(path.basename(filename))
}
