import { afterEach, describe, expect, it, vi } from 'vitest'
import { googleFetch } from './google'

vi.mock('./http.ts', () => ({
  HttpError: class extends Error {},
}))

describe('bounded scheduled Google requests', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not fetch when the execution budget is already exhausted', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    controller.abort(new Error('budget exhausted'))
    await expect(googleFetch(new URL('https://example.com'), 'token', controller.signal)).rejects.toThrow('budget exhausted')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('interrupts a long Retry-After instead of waiting beyond the budget', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '30' } }))
    vi.stubGlobal('fetch', fetch)
    const result = googleFetch(new URL('https://example.com'), 'token', controller.signal)
    const assertion = expect(result).rejects.toThrow('budget exhausted')
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort(new Error('budget exhausted'))
    await assertion
    expect(fetch).toHaveBeenCalledOnce()
  })
})
