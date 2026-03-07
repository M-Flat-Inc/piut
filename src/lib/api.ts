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

// ---------------------------------------------------------------------------
// Streaming build — SSE progress events
// ---------------------------------------------------------------------------

export interface BuildStreamEvent {
  event: 'status' | 'progress' | 'section' | 'complete' | 'error'
  data: Record<string, unknown>
}

export async function* buildBrainStreaming(
  key: string,
  input: BuildBrainInput
): AsyncGenerator<BuildStreamEvent> {
  const res = await fetch(`${API_BASE}/api/cli/build-brain`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
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

  // If the server didn't return SSE (e.g., old server), parse as JSON
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream')) {
    const data = await res.json()
    yield { event: 'complete', data: { sections: data.sections } }
    return
  }

  // Parse SSE stream
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    // Last part may be incomplete — keep it in the buffer
    buffer = parts.pop() || ''

    for (const part of parts) {
      let eventName = ''
      let eventData = ''

      for (const line of part.split('\n')) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6)
        }
      }

      if (eventName && eventData) {
        try {
          yield { event: eventName as BuildStreamEvent['event'], data: JSON.parse(eventData) }
        } catch {
          // Skip malformed events
        }
      }
    }
  }
}

/**
 * Ping the MCP endpoint to register a tool connection.
 * Sends a minimal JSON-RPC `tools/list` request with a User-Agent
 * that identifies which tool was just configured by the CLI.
 */
export async function pingMcp(
  serverUrl: string,
  key: string,
  toolName: string,
): Promise<boolean> {
  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'User-Agent': `piut-cli (configured: ${toolName})`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    })
    return res.ok
  } catch {
    return false
  }
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

export async function unpublishServer(key: string): Promise<{ published: boolean }> {
  const res = await fetch(`${API_BASE}/api/mcp/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ published: false }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Unpublish failed (HTTP ${res.status})`)
  }

  return res.json()
}
