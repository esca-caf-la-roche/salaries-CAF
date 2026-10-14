import { describe, expect, it, vi } from 'vitest'
import { handleScheduledSync } from './scheduledSync'

describe('scheduled synchronization', () => {
  const secret = 'a'.repeat(64)
  const calendarId = '00000000-0000-0000-0000-000000000001'
  const request = (token = secret, method = 'POST') => new Request('https://example.com', {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ calendarId }) } : {}),
  })

  it.each([
    [request(secret, 'GET'), secret, 405],
    [request(), undefined, 503],
    [request(), 'short', 503],
    [request('wrong'), secret, 401],
    [new Request('https://example.com', { method: 'POST' }), secret, 401],
  ])('rejects unauthorized or unconfigured calls without touching the database', async (req, configured, status) => {
    const synchronize = vi.fn()
    expect((await handleScheduledSync(req, configured, synchronize)).status).toBe(status)
    expect(synchronize).not.toHaveBeenCalled()
  })

  it('runs an authorized sync and returns only a summary', async () => {
    const synchronize = vi.fn().mockResolvedValue({ results: [{ calendarId: 'private' }, { skipped: 'recently_synced' }] })
    const response = await handleScheduledSync(request(), secret, synchronize)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, calendars: 2, failed: 0 })
    expect(synchronize).toHaveBeenCalledOnce()
    expect(synchronize).toHaveBeenCalledWith(calendarId)
  })

  it('rejects an authorized request without a valid calendar UUID', async () => {
    const synchronize = vi.fn()
    const req = new Request('https://example.com', { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: '{}' })
    expect((await handleScheduledSync(req, secret, synchronize)).status).toBe(400)
    expect(synchronize).not.toHaveBeenCalled()
  })

  it('reports a running lock as retryable rather than successful', async () => {
    const response = await handleScheduledSync(request(), secret, async () => ({ results: [{ skipped: 'already_running' }] }))
    expect(response.status).toBe(502)
  })

  it('does not report an unknown or disabled calendar as synchronized', async () => {
    const response = await handleScheduledSync(request(), secret, async () => ({ results: [] }))
    expect(response.status).toBe(404)
  })

  it('reports partial errors as failures without leaking provider details', async () => {
    const response = await handleScheduledSync(request(), secret, async () => ({ results: [{ error: 'private error' }] }))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ ok: false, calendars: 1, failed: 1 })
  })

  it('handles connection and token failures without leaking credentials', async () => {
    const response = await handleScheduledSync(request(), secret, async () => { throw new Error('private token') })
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('private token')
  })
})
