import type { ValidateResponse } from '../types.js'

const API_BASE = process.env.PIUT_API_BASE || 'https://piut.com'

export async function validateKey(key: string): Promise<ValidateResponse> {
  const res = await fetch(`${API_BASE}/api/cli/validate`, {
    headers: { Authorization: `Bearer ${key}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Validation failed (HTTP ${res.status})`)
  }

  return res.json()
}
