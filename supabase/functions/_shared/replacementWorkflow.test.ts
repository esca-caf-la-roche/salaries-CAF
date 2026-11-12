import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  vi.stubGlobal('Deno', { env: { get: () => undefined } })
  return { requireActiveUser: vi.fn(), getAccessToken: vi.fn() }
})
vi.mock('./supabase.ts', () => ({ requireActiveUser: mocks.requireActiveUser }))
vi.mock('./google.ts', () => ({
  getAccessToken: mocks.getAccessToken,
  googleFetch: (url: URL) => fetch(url),
}))
import { handleCalendarSync } from './googleCalendarSync'

const absent = 'absent@resource.calendar.google.com'
const replacement = 'replacement@resource.calendar.google.com'
const organizer = 'organizer@example.org'
const original = {
  id: 'original', summary: 'Cours', organizer: { email: organizer },
  start: { dateTime: '2026-11-12T09:00:00+01:00' }, end: { dateTime: '2026-11-12T10:00:00+01:00' },
  attendees: [{ email: absent, resource: true }, { email: 'guest@example.org' }],
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const call = () => handleCalendarSync(new Request('https://example.org', { method: 'POST', body: JSON.stringify({ action: 'processReplacements', resourceId: absent, assignments: [{ eventId: 'original', replacementResourceId: replacement }] }) }))

describe('replacement workflow Google request order', () => {
  beforeEach(() => {
    mocks.getAccessToken.mockResolvedValue('test-token')
    mocks.requireActiveUser.mockResolvedValue({ user: { id: 'admin' }, role: 'admin', admin: {
      from: (table: string) => {
        const query = {
          select: (fields: string) => { if (fields === 'id' && table === 'calendars') throw new Error('Sync unavailable in test'); return query },
          is: () => query, order: () => query, limit: () => query, eq: () => query,
          maybeSingle: async () => ({ data: { id: 'connection' }, error: null }),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ google_calendar_id: absent }, { google_calendar_id: replacement }], error: null }).then(resolve),
        }
        return query
      },
    } })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks() })

  it('awaits original resource removal before absence creation and replacement invitation', async () => {
    const operations: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (!init || init.method === 'GET') return response(original)
      const body = JSON.parse(String(init.body))
      if (init.method === 'PATCH') {
        operations.push('remove-source')
        expect(body.attendees).toEqual([{ email: 'guest@example.org' }])
        expect(url.searchParams.get('sendUpdates')).toBe('all')
        await Promise.resolve()
        operations.push('source-removed')
        return response({ ...original, ...body })
      }
      if (url.pathname.endsWith('/freeBusy')) {
        operations.push('check-free')
        expect(init.signal).toBeInstanceOf(AbortSignal)
        return response({ calendars: { [replacement]: { busy: [] } } })
      }
      if (body.summary === 'Absence avec prépa') { operations.push('create-absence'); return response({ id: 'absence' }) }
      operations.push('create-replacement')
      expect(body.attendees).toEqual([{ email: replacement, resource: true, responseStatus: 'needsAction' }])
      expect(url.searchParams.get('sendUpdates')).toBe('all')
      return response({ id: 'replacement', attendees: [{ email: replacement, responseStatus: 'accepted' }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await (await call()).json()
    expect(result.failed).toBe(0)
    expect(operations).toEqual(['remove-source', 'source-removed', 'create-absence', 'check-free', 'create-replacement'])
    expect(result.syncWarning).not.toContain('acceptation Google non confirmée')
  })

  it('keeps a declined resource without adding a duplicate acceptance warning', async () => {
    let invitations = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/events/replacement')) return response({ id: 'replacement', attendees: [{ email: replacement, responseStatus: 'declined' }] })
      if (!init || init.method === 'GET') return response(original)
      const body = JSON.parse(String(init.body))
      if (init.method === 'PATCH') return response({ ...original, ...body })
      if (url.pathname.endsWith('/freeBusy')) return response({ calendars: { [replacement]: { busy: [{}] } } })
      if (body.summary === 'Absence avec prépa') return response({ id: 'absence' })
      invitations++
      expect(body.attendees[0].email).toBe(replacement)
      return response({ id: 'replacement', attendees: [{ email: replacement, responseStatus: 'declined' }] })
    }))
    const result = await (await call()).json()
    expect(invitations).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.results[0].ok).toBe(true)
    expect(result.syncWarning).toBe('Les données du site n’ont pas pu être actualisées. Vérifiez Google avant de réessayer.')
  })

  it('never creates absence or replacement when original resource removal fails', async () => {
    const methods: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET')
      return init?.method === 'PATCH' ? response({ error: { message: 'Conflict' } }, 412) : response(original)
    }))
    const result = await (await call()).json()
    expect(result.failed).toBe(1)
    expect(methods).toEqual(['GET', 'GET', 'PATCH'])
  })

  it('keeps creating later assignments when the shared batch deadline is exhausted', async () => {
    let clock = 0
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    let freeBusyCalls = 0
    let invitations = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (!init || init.method === 'GET') {
        if (url.pathname.endsWith('/original-2')) clock = 12_000
        return response(original)
      }
      const body = JSON.parse(String(init.body))
      if (init.method === 'PATCH') return response({ ...original, ...body })
      if (url.pathname.endsWith('/freeBusy')) { freeBusyCalls++; return response({ calendars: { [replacement]: { busy: [] } } }) }
      if (body.summary === 'Absence avec prépa') return response({ id: 'absence' })
      invitations++
      expect(body.attendees[0].email).toBe(replacement)
      return response({ id: `replacement-${invitations}`, attendees: [{ email: replacement, responseStatus: 'accepted' }] })
    }))
    const result = await (await handleCalendarSync(new Request('https://example.org', { method: 'POST', body: JSON.stringify({
      action: 'processReplacements', resourceId: absent,
      assignments: ['original', 'original-2'].map((eventId) => ({ eventId, replacementResourceId: replacement })),
    }) }))).json()
    expect(result.failed).toBe(0)
    expect(result.results).toHaveLength(2)
    expect(invitations).toBe(2)
    expect(freeBusyCalls).toBe(1)
  })
})
