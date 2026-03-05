import { describe, it, expect } from 'vitest'
import { isBlockedFilename, scanForSecrets, guardFile } from '../src/lib/sensitive-guard.js'

describe('sensitive-guard', () => {
  describe('isBlockedFilename', () => {
    it('blocks .env files', () => {
      expect(isBlockedFilename('.env')).toBe(true)
      expect(isBlockedFilename('.env.local')).toBe(true)
      expect(isBlockedFilename('.env.production')).toBe(true)
      expect(isBlockedFilename('.env.staging')).toBe(true)
    })

    it('blocks credential files', () => {
      expect(isBlockedFilename('credentials.json')).toBe(true)
      expect(isBlockedFilename('service-account.json')).toBe(true)
      expect(isBlockedFilename('secrets.json')).toBe(true)
      expect(isBlockedFilename('id_rsa')).toBe(true)
    })

    it('allows agent config files', () => {
      expect(isBlockedFilename('CLAUDE.md')).toBe(false)
      expect(isBlockedFilename('MEMORY.md')).toBe(false)
      expect(isBlockedFilename('.cursorrules')).toBe(false)
      expect(isBlockedFilename('AGENTS.md')).toBe(false)
    })

    it('blocks .env with path prefix', () => {
      expect(isBlockedFilename('project/.env')).toBe(true)
      expect(isBlockedFilename('deep/nested/.env.local')).toBe(true)
    })
  })

  describe('scanForSecrets', () => {
    it('detects API key patterns', () => {
      const content = 'API_KEY=sk-ant-abc123def456ghi789jkl012mno'
      const matches = scanForSecrets(content)
      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].line).toBe(1)
    })

    it('detects Stripe keys', () => {
      // Build the key via concatenation to avoid GitHub push protection
      const prefix = ['sk', 'live'].join('_')
      const content = `STRIPE_KEY=${prefix}_${'x'.repeat(24)}`
      const matches = scanForSecrets(content)
      expect(matches.length).toBeGreaterThan(0)
    })

    it('detects GitHub tokens', () => {
      const content = 'GH_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890'
      const matches = scanForSecrets(content)
      expect(matches.length).toBeGreaterThan(0)
    })

    it('detects private keys', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...'
      const matches = scanForSecrets(content)
      expect(matches.length).toBeGreaterThan(0)
    })

    it('detects connection strings', () => {
      const content = 'DATABASE_URL=postgres://user:password@host:5432/db'
      const matches = scanForSecrets(content)
      expect(matches.length).toBeGreaterThan(0)
    })

    it('does not flag normal markdown content', () => {
      const content = `# CLAUDE.md
## Project Rules
- Use TypeScript
- Follow ESLint config
- Run tests before PRs`
      const matches = scanForSecrets(content)
      expect(matches.length).toBe(0)
    })

    it('does not flag code examples without real keys', () => {
      const content = `Use \`api_key\` parameter to authenticate.
Example: \`curl -H "Authorization: Bearer YOUR_KEY"\``
      const matches = scanForSecrets(content)
      expect(matches.length).toBe(0)
    })

    it('redacts sensitive values in preview', () => {
      const prefix = ['sk', 'live'].join('_')
      const content = `SECRET_KEY="${prefix}_${'y'.repeat(24)}"`
      const matches = scanForSecrets(content)
      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].preview).toContain('[REDACTED]')
    })
  })

  describe('guardFile', () => {
    it('blocks .env files by name', () => {
      const result = guardFile('.env', 'KEY=value')
      expect(result.blocked).toBe(true)
      expect(result.reason).toBe('filename')
    })

    it('blocks files with secrets in content', () => {
      const result = guardFile('config.md', 'API_KEY=sk-ant-reallylongsecretkeythatwouldbedangerous')
      expect(result.blocked).toBe(true)
      expect(result.reason).toBe('content')
    })

    it('allows clean markdown files', () => {
      const result = guardFile('CLAUDE.md', '# Project Rules\n\nUse TypeScript.')
      expect(result.blocked).toBe(false)
      expect(result.reason).toBe(null)
    })
  })
})
