import os from 'os'
import crypto from 'crypto'
import type { ValidateResponse, LoginResponse, BrainSections, BuildBrainInput, VaultListResponse, VaultUploadResponse, VaultReadResponse } from '../types.js'

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

export async function loginWithEmail(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/cli/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Login failed (HTTP ${res.status})`)
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

  try {
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
  } catch {
    // Connection dropped mid-stream (e.g., server deploy/restart)
    yield { event: 'error', data: { message: 'Connection lost. The build may still complete — run `piut status` to check.' } }
  }
}

/**
 * Verify the MCP endpoint is reachable and returns tools.
 * Returns structured results (tool names, latency) instead of just boolean.
 */
export async function verifyMcpEndpoint(
  serverUrl: string,
  key: string,
): Promise<{ ok: boolean; tools: string[]; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'User-Agent': 'piut-cli (verify)',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    })
    const latencyMs = Date.now() - start

    if (!res.ok) {
      return { ok: false, tools: [], latencyMs, error: `HTTP ${res.status}` }
    }

    const data = await res.json()
    const result = data?.result
    const tools: string[] = Array.isArray(result?.tools)
      ? result.tools.map((t: { name?: string }) => t.name).filter(Boolean)
      : []

    return { ok: true, tools, latencyMs }
  } catch (err: unknown) {
    return { ok: false, tools: [], latencyMs: Date.now() - start, error: (err as Error).message }
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
        'X-Piut-Hostname': os.hostname(),
        'X-Piut-Machine-Id': getMachineId(),
        'X-Piut-Tool': toolName,
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

// ---------------------------------------------------------------------------
// Brain retrieval
// ---------------------------------------------------------------------------

export async function getBrain(key: string): Promise<{
  sections: { about: string; soul: string; areas: string; projects: string; memory: string }
  hasUnpublishedChanges: boolean
}> {
  const res = await fetch(`${API_BASE}/api/cli/brain`, {
    headers: { Authorization: `Bearer ${key}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Failed to fetch brain (HTTP ${res.status})`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Brain clean
// ---------------------------------------------------------------------------

export interface CleanBrainResult {
  summary: string
  sections: { section: string; content: string }[]
  contradictions: { section: string; description: string }[]
  stats: { duplicatesRemoved: number; contradictionsFound: number; sectionsReorganized: number }
}

export async function cleanBrain(key: string): Promise<CleanBrainResult> {
  const res = await fetch(`${API_BASE}/api/brain/clean`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Failed to clean brain (HTTP ${res.status})`)
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Project registration
// ---------------------------------------------------------------------------

export function getMachineId(): string {
  const hostname = os.hostname()
  return crypto.createHash('sha256').update(hostname).digest('hex').slice(0, 16)
}

export function getHostname(): string {
  return os.hostname()
}

export async function registerProject(
  key: string,
  project: {
    projectName: string
    projectPath: string
    machineId: string
    hostname?: string
    toolsDetected: string[]
    configFiles: string[]
  },
): Promise<{ id: string; projectName: string }> {
  const res = await fetch(`${API_BASE}/api/cli/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(project),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Register project failed (HTTP ${res.status})`)
  }

  return res.json()
}

export async function unregisterProject(
  key: string,
  projectPath: string,
  machineId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cli/projects`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectPath, machineId }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Unregister project failed (HTTP ${res.status})`)
  }
}

export async function deleteConnections(key: string, toolNames: string[]): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/mcp/connections`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toolNames }),
    })
  } catch {
    // Best-effort — don't fail if server is unreachable
  }
}

/**
 * Call the MCP endpoint's update_brain tool to merge new scan data into existing brain.
 * This is a merge update — it preserves existing brain content and integrates new info.
 */
export async function resyncBrain(
  serverUrl: string,
  key: string,
  content: string,
): Promise<{ summary: string }> {
  const res = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'update_brain',
        arguments: { content },
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Resync failed (HTTP ${res.status})`)
  }

  const data = await res.json()
  if (data.error) {
    throw new Error(data.error.message || 'Resync failed')
  }

  // Extract text from MCP tool result
  const resultContent = data.result?.content
  const text = Array.isArray(resultContent) && resultContent[0]?.text
    ? resultContent[0].text
    : 'Brain updated'
  return { summary: text }
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

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

export async function listVaultFiles(key: string): Promise<VaultListResponse> {
  const res = await fetch(`${API_BASE}/api/cli/vault`, {
    headers: { Authorization: `Bearer ${key}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Failed to list vault files (HTTP ${res.status})`)
  }

  return res.json()
}

export async function uploadVaultFile(
  key: string,
  filename: string,
  content: string,
  encoding?: 'base64' | 'utf8',
): Promise<VaultUploadResponse> {
  const payload: Record<string, string> = { filename, content }
  if (encoding) payload.encoding = encoding

  const res = await fetch(`${API_BASE}/api/cli/vault/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Upload failed (HTTP ${res.status})`)
  }

  return res.json()
}

export async function readVaultFile(key: string, filename: string): Promise<VaultReadResponse> {
  const encoded = encodeURIComponent(filename)
  const res = await fetch(`${API_BASE}/api/cli/vault/${encoded}`, {
    headers: { Authorization: `Bearer ${key}` },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Failed to read vault file (HTTP ${res.status})`)
  }

  return res.json()
}

export async function deleteVaultFile(key: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cli/vault`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Delete failed (HTTP ${res.status})`)
  }
}
