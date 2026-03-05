import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateKey } from '../src/lib/api.js'

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
