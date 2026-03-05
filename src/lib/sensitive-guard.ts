/**
 * Sensitive file guard — detects .env files, API key patterns,
 * and other secrets before uploading to cloud backup.
 */

/** Patterns that indicate a file contains secrets */
const SECRET_PATTERNS = [
  // API keys and tokens
  /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-/.]{20,}/i,
  // AWS credentials
  /AKIA[0-9A-Z]{16}/,
  // Private keys
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  // Supabase service role JWTs (eyJ...)
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]?eyJ/i,
  // Generic JWT tokens assigned to variables
  /(?:JWT|TOKEN|SECRET|PASSWORD|CREDENTIAL)\s*[:=]\s*['"]?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i,
  // Connection strings
  /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@/i,
  // Stripe keys
  /sk_(?:live|test)_[A-Za-z0-9]{20,}/,
  // Anthropic keys
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  // OpenAI keys
  /sk-[A-Za-z0-9]{40,}/,
  // npm tokens
  /npm_[A-Za-z0-9]{36}/,
  // GitHub tokens
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  // Generic password assignments
  /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i,
]

/** File names that should never be uploaded */
const BLOCKED_FILENAMES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.staging',
  '.env.test',
  'credentials.json',
  'service-account.json',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
  '.netrc',
  '.npmrc',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
]

export interface SensitiveMatch {
  line: number
  preview: string
  pattern: string
}

export interface GuardResult {
  blocked: boolean
  reason: 'filename' | 'content' | null
  matches: SensitiveMatch[]
}

/** Check if a filename should be blocked outright */
export function isBlockedFilename(filePath: string): boolean {
  const basename = filePath.split('/').pop() || ''
  return BLOCKED_FILENAMES.some(blocked =>
    basename === blocked || basename.startsWith('.env.')
  )
}

/** Scan content for sensitive patterns */
export function scanForSecrets(content: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        // Redact the match for preview
        const preview = line.length > 80
          ? line.slice(0, 77) + '...'
          : line
        matches.push({
          line: i + 1,
          preview: preview.replace(/(['"])[A-Za-z0-9_\-/.+=]{20,}(['"])/g, '$1[REDACTED]$2'),
          pattern: pattern.source.slice(0, 40),
        })
        break // One match per line is enough
      }
    }
  }

  return matches
}

/** Full guard check — returns whether a file should be blocked */
export function guardFile(filePath: string, content: string): GuardResult {
  if (isBlockedFilename(filePath)) {
    return { blocked: true, reason: 'filename', matches: [] }
  }

  const matches = scanForSecrets(content)
  if (matches.length > 0) {
    return { blocked: true, reason: 'content', matches }
  }

  return { blocked: false, reason: null, matches: [] }
}
