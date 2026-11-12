import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  vi.stubGlobal('Deno', { env: { get: () => undefined } })
  return { requireActiveUser: vi.fn(), getAccessToken: vi.fn() }
})
vi.mock('./supabase.ts', () => ({ requireActiveUser: mocks.requireActiveUser }))
vi.mock('./google.ts', () => ({ getAccessToken: mocks.getAccessToken, googleFetch: vi.fn() }))
import { handleCalendarSync } from './googleCalendarSync'
import { cachedRefusalRevision } from './declinedResource'

describe('declinedResourceEvents Edge action', () => {
  const resource = 'room@resource.calendar.google.com'
  const row = { id: 'row-1', resource_decline_resolved_revision: null as string | null, google_event_id: 'event-1', summary: 'Cours', starts_at: '2027-01-01T10:00:00Z', raw: { etag: 'revision-1', organizer: { email: 'organizer@example.org' }, attendees: [{ email: resource, responseStatus: 'declined' }] }, calendars: { google_calendar_id: resource, name: 'Salle' } }
  let rows = [row]
  const call = () => handleCalendarSync(new Request('https://example.org', { method: 'POST', body: JSON.stringify({ action: 'declinedResourceEvents' }) }))
  beforeEach(() => {
    row.resource_decline_resolved_revision = null
    row.raw.etag = 'revision-1'
    rows = [row]
    mocks.getAccessToken.mockResolvedValue('token')
    mocks.requireActiveUser.mockResolvedValue({ user: { id: 'admin' }, role: 'admin', admin: {
      from: () => {
        let update: { resource_decline_resolved_revision: string } | undefined
        let id: string | undefined
        const query = {
          select: () => query, is: () => query, order: () => query, limit: () => query,
          eq: (field: string, value: string) => { if (field === 'id') id = value; return query }, neq: () => query, or: () => query,
          update: (value: { resource_decline_resolved_revision: string }) => { update = value; return query },
          maybeSingle: async () => ({ data: { id: 'connection' }, error: null }),
          then: (resolve: (value: unknown) => unknown) => {
            if (update) Object.assign(rows.find((item) => item.id === id)!, update)
            return Promise.resolve({ data: rows, error: null }).then(resolve)
          },
        }
        return query
      },
    } })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('reads the organizer instead of trusting the stale resource copy', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ attendees: [{ email: resource, responseStatus: 'accepted' }] }))
    vi.stubGlobal('fetch', request)
    const response = await call()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ events: [] })
    expect(String(request.mock.calls[0][0])).toContain('/calendars/organizer%40example.org/events/event-1')
  })

  it('retains cached alerts when the organizer is inaccessible or credentials fail', async () => {
    const request = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', request)
    const result = await (await call()).json()
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).not.toHaveProperty('organizer')
    mocks.getAccessToken.mockRejectedValueOnce(new Error('credentials unavailable'))
    expect((await (await call()).json()).events).toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not restore reconciled snapshots across reads and checks a newer decline again', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ attendees: [{ email: resource, responseStatus: 'accepted' }] }))
    vi.stubGlobal('fetch', request)
    expect((await (await call()).json()).events).toEqual([])
    expect(row.resource_decline_resolved_revision).toBe(await cachedRefusalRevision(row.raw))
    expect((await (await call()).json()).events).toEqual([])
    expect(request).toHaveBeenCalledTimes(1)
    row.raw.etag = 'revision-2'
    request.mockImplementation(async () => Response.json({ attendees: [{ email: resource, responseStatus: 'declined' }] }))
    expect((await (await call()).json()).events).toHaveLength(1)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('never reintroduces resolved events while reconciling more than one batch', async () => {
    rows = Array.from({ length: 40 }, (_, index) => ({ ...row, id: `row-${index}`, google_event_id: `event-${index}` }))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ attendees: [{ email: resource, responseStatus: 'accepted' }] })))
    const remaining = (await (await call()).json()).events
    expect(remaining).toHaveLength(20)
    expect((await (await call()).json()).events).toEqual([])
    expect((await (await call()).json()).events).toEqual([])
  })
})
