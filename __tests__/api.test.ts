import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateKey, buildBrain, publishServer, verifyMcpEndpoint } from '../src/lib/api.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('validateKey', () => {
  it('sends correct request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ slug: 'testuser', displayName: 'Test', serverUrl: 'https://piut.com/api/mcp/testuser' }),
    })

    await validateKey('pb_test123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://piut.com/api/cli/validate',
      { headers: { Authorization: 'Bearer pb_test123' } }
    )
  })

  it('returns validation response on success', async () => {
    const response = { slug: 'testuser', displayName: 'Test User', serverUrl: 'https://piut.com/api/mcp/testuser' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    })

    const result = await validateKey('pb_test123')
    expect(result).toEqual(response)
  })

  it('throws on 401 with error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Invalid or revoked API key' }),
    })

    await expect(validateKey('pb_bad')).rejects.toThrow('Invalid or revoked API key')
  })

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    await expect(validateKey('pb_test')).rejects.toThrow('Network error')
  })
})

describe('buildBrain', () => {
  it('sends correct POST request to build-brain endpoint', async () => {
    const sections = { about: 'test', soul: '', areas: '', projects: '', memory: '' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sections }),
    })

    const input = {
      summary: {
        projects: [{ name: 'test', path: '~/test' }],
        configFiles: [],
      },
    }

    await buildBrain('pb_test', input)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://piut.com/api/cli/build-brain',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer pb_test',
          'Content-Type': 'application/json',
        },
      })
    )
  })

  it('returns brain sections on success', async () => {
    const sections = { about: 'About me', soul: 'Soul text', areas: 'Areas', projects: 'Projects', memory: 'Memory' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sections }),
    })

    const result = await buildBrain('pb_test', { summary: { projects: [], configFiles: [] } })
    expect(result).toEqual(sections)
  })

  it('throws with rate limit message on 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: 'Rate limit: maximum 3 brain builds per day' }),
    })

    await expect(buildBrain('pb_test', { summary: { projects: [], configFiles: [] } }))
      .rejects.toThrow('Rate limit: maximum 3 brain builds per day')
  })

  it('throws on other errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'AI generation failed' }),
    })

    await expect(buildBrain('pb_test', { summary: { projects: [], configFiles: [] } }))
      .rejects.toThrow('AI generation failed')
  })
})

describe('verifyMcpEndpoint', () => {
  it('returns ok with tool names on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            { name: 'get_context' },
            { name: 'get_section' },
            { name: 'search_brain' },
          ],
        },
      }),
    })

    const result = await verifyMcpEndpoint('https://piut.com/api/mcp/test', 'pb_key')
    expect(result.ok).toBe(true)
    expect(result.tools).toEqual(['get_context', 'get_section', 'search_brain'])
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeUndefined()
  })

  it('returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    })

    const result = await verifyMcpEndpoint('https://piut.com/api/mcp/test', 'pb_bad')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('HTTP 401')
    expect(result.tools).toEqual([])
  })

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'))

    const result = await verifyMcpEndpoint('https://piut.com/api/mcp/test', 'pb_key')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('fetch failed')
    expect(result.tools).toEqual([])
  })

  it('handles empty tools list gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: {} }),
    })

    const result = await verifyMcpEndpoint('https://piut.com/api/mcp/test', 'pb_key')
    expect(result.ok).toBe(true)
    expect(result.tools).toEqual([])
  })
})

describe('publishServer', () => {
  it('sends correct POST request to publish endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ published: true }),
    })

    await publishServer('pb_test')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://piut.com/api/mcp/publish',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer pb_test',
          'Content-Type': 'application/json',
        },
      })
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.published).toBe(true)
  })

  it('returns published status on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ published: true }),
    })

    const result = await publishServer('pb_test')
    expect(result.published).toBe(true)
  })

  it('throws REQUIRES_SUBSCRIPTION on 402', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: () => Promise.resolve({ error: 'Subscription required' }),
    })

    await expect(publishServer('pb_test')).rejects.toThrow('REQUIRES_SUBSCRIPTION')
  })

  it('throws on other errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    })

    await expect(publishServer('pb_test')).rejects.toThrow('Internal error')
  })
})
