import { describe, expect, it, vi } from 'vitest'
import { isResourceStillDeclined, verifyCachedRefusals } from './declinedResource'

describe('live resource alert verification', () => {
  const email = 'room@resource.calendar.google.com'
  const read = (event: unknown) => async () => Response.json(event)

  it('dismisses a cached refusal after removing and reinviting an accepted resource', async () => {
    expect(await isResourceStillDeclined(read({ attendees: [{ email: email.toUpperCase(), responseStatus: 'accepted' }] }), email)).toBe(false)
  })

  it('retains declined and pending invitations', async () => {
    for (const responseStatus of ['declined', 'needsAction', 'tentative']) {
      expect(await isResourceStillDeclined(read({ attendees: [{ email, responseStatus }] }), email)).toBe(true)
    }
  })

  it('dismisses cancelled events and explicitly removed resources', async () => {
    expect(await isResourceStillDeclined(read({ status: 'cancelled' }), email)).toBe(false)
    expect(await isResourceStillDeclined(read({ attendees: [] }), email)).toBe(false)
  })

  it('preserves alerts on inaccessible events, outages and incomplete responses', async () => {
    for (const status of [403, 404, 429, 500]) {
      expect(await isResourceStillDeclined(async () => new Response(null, { status }), email)).toBe(true)
    }
    expect(await isResourceStillDeclined(async () => { throw new Error('offline') }, email)).toBe(true)
    expect(await isResourceStillDeclined(read({}), email)).toBe(true)
    expect(await isResourceStillDeclined(read({ attendees: [], attendeesOmitted: true }), email)).toBe(true)
  })
})

describe('bounded Google verification', () => {
  const candidates = Array.from({ length: 40 }, (_, id) => ({ eventId: `event-${id}`, calendarId: 'room', organizer: 'organizer@example.org' }))

  it('caps requests and rotates candidates across minutes without dropping unverified alerts', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ attendees: [] }))
    expect(await verifyCachedRefusals(candidates, async () => 'token', request, () => 0)).toEqual(candidates.slice(20))
    expect(request).toHaveBeenCalledTimes(20)
    expect(await verifyCachedRefusals(candidates, async () => 'token', request, () => 20 * 60_000)).toEqual(candidates.slice(0, 20))
    expect(request).toHaveBeenCalledTimes(40)
    const [url, init] = request.mock.calls[0]
    expect(String(url)).toContain('/calendars/organizer%40example.org/events/event-0')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer token' })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('preserves all alerts when credentials fail or consume the deadline', async () => {
    const request = vi.fn<typeof fetch>()
    expect(await verifyCachedRefusals(candidates, async () => { throw new Error('credentials') }, request)).toEqual(candidates)
    let clock = 0
    expect(await verifyCachedRefusals(candidates, async () => { clock = 8_001; return 'token' }, request, () => clock)).toEqual(candidates)
    expect(request).not.toHaveBeenCalled()
  })

  it('stops on the overall deadline, preserving the rest', async () => {
    let clock = 0
    const request = vi.fn<typeof fetch>().mockImplementation(async () => { clock += 4_001; return Response.json({ attendees: [] }) })
    expect(await verifyCachedRefusals(candidates, async () => 'token', request, () => clock)).toEqual(candidates.slice(2))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('aborts a hung request and keeps its alert', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
    }))
    expect(await verifyCachedRefusals(candidates.slice(0, 1), async () => 'token', request)).toEqual(candidates.slice(0, 1))
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('keeps a resolved alert visible when durable reconciliation fails', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ attendees: [] }))
    expect(await verifyCachedRefusals(candidates.slice(0, 1), async () => 'token', request, () => 0, async () => false)).toEqual(candidates.slice(0, 1))
  })

  it('eventually checks every starting position even when the budget allows only one read', async () => {
    const visited = new Set<string>()
    for (let minute = 0; minute < candidates.length; minute++) {
      let clock = minute * 60_000
      const request: typeof fetch = async (url) => {
        visited.add(String(url))
        clock += 8_001
        return new Response(null, { status: 503 })
      }
      await verifyCachedRefusals(candidates, async () => 'token', request, () => clock)
    }
    expect(visited.size).toBe(candidates.length)
  })
})
