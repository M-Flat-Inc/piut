import type { ValidateResponse, BrainSections, BuildBrainInput } from '../types.js'

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

export async function buildBrain(key: string, input: BuildBrainInput): Promise<BrainSections> {
  const res = await fetch(`${API_BASE}/api/cli/build-brain`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    if (res.status === 429) {
      throw new Error(body.error || 'Rate limit exceeded (3 builds per day)')
    }
    throw new Error(body.error || `Build failed (HTTP ${res.status})`)
  }

  const data = await res.json()
  return data.sections
}

export async function publishServer(key: string): Promise<{ published: boolean }> {
  const res = await fetch(`${API_BASE}/api/mcp/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ published: true }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    if (res.status === 402) {
      throw new Error('REQUIRES_SUBSCRIPTION')
    }
    throw new Error(body.error || `Publish failed (HTTP ${res.status})`)
  }

  return res.json()
}
