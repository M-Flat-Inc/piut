import type { ValidateResponse } from '../types.js'

const VALIDATE_URL = 'https://piut.com/api/cli/validate'

export async function validateKey(key: string): Promise<ValidateResponse> {
  const res = await fetch(VALIDATE_URL, {
    headers: { Authorization: `Bearer ${key}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Validation failed (HTTP ${res.status})`)
  }

  return res.json()
}
