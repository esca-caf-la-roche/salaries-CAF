import { describe, expect, it, vi } from 'vitest'
import { createReplacementBooking, type BookingEvent } from './replacementBooking'

const resourceId = 'replacement@resource.calendar.google.com'
const event = (responseStatus = 'declined'): BookingEvent => ({ id: 'replacement-id', attendees: [{ email: resourceId, responseStatus }] })

function setup({ busy = false, status = 'declined' } = {}) {
  const created = event(status)
  let clock = 0
  const sleep = vi.fn(async (ms: number) => { clock += ms })
  const create = vi.fn(async () => structuredClone(created))
  const request = vi.fn(async (url: URL, method: 'GET' | 'POST', body: unknown, signal: AbortSignal): Promise<Record<string, unknown>> => {
    signal.throwIfAborted()
    if (method === 'POST' && !body) throw new Error('Missing freeBusy payload')
    if (url.pathname.endsWith('/freeBusy')) return { calendars: { [resourceId]: { busy: busy ? [{}] : [] } } }
    return structuredClone(created) as unknown as Record<string, unknown>
  })
  const options = { resourceId, timeMin: '2026-11-12T09:00:00Z', timeMax: '2026-11-12T10:00:00Z', deadline: 12_000, now: () => clock, sleep, create, request, eventUrl: (id: string) => new URL(`https://www.googleapis.com/calendar/v3/calendars/replacements/events/${id}`) }
  return { options, create, request, sleep, created, advance: (ms: number) => { clock += ms } }
}

describe('replacement resource booking', () => {
  it('checks availability before creating once and never edits an accepted booking', async () => {
    const test = setup({ status: 'accepted' })
    expect((await createReplacementBooking(test.options)).bookingWarning).toBeNull()
    expect(test.create).toHaveBeenCalledOnce()
    expect(test.request).toHaveBeenCalledOnce()
    expect(test.request.mock.invocationCallOrder[0]).toBeLessThan(test.create.mock.invocationCallOrder[0])
    expect(test.sleep).not.toHaveBeenCalled()
  })

  it('waits for busy state to clear before creating the invitation', async () => {
    const test = setup({ status: 'accepted' })
    test.request.mockResolvedValueOnce({ calendars: { [resourceId]: { busy: [{}] } } })
    test.request.mockResolvedValueOnce({ calendars: { [resourceId]: { busy: [{}] } } })
    await createReplacementBooking(test.options)
    expect(test.sleep.mock.calls).toEqual([[400], [1000]])
    expect(test.create).toHaveBeenCalledOnce()
  })

  it('keeps a genuinely busy resource attached and declined for the overview safeguard', async () => {
    const test = setup({ busy: true })
    const result = await createReplacementBooking(test.options)
    expect(result.bookingWarning).toContain('vue d’ensemble')
    expect(result.event.attendees).toEqual([{ email: resourceId, responseStatus: 'declined' }])
    expect(test.request.mock.calls.every((call) => call[1] === 'GET' || call[0].pathname.endsWith('/freeBusy'))).toBe(true)
    expect(test.create).toHaveBeenCalledOnce()
  })

  it('recognizes asynchronous acceptance without removing or forcing the resource', async () => {
    const test = setup({ status: 'needsAction' })
    const original = test.request.getMockImplementation()!
    test.request.mockImplementation((url, ...args) => url.pathname.endsWith('/freeBusy') ? original(url, ...args) : Promise.resolve(event('accepted') as unknown as Record<string, unknown>))
    expect((await createReplacementBooking(test.options)).bookingWarning).toBeNull()
    expect(test.sleep.mock.calls).toEqual([[400]])
    expect(test.create).toHaveBeenCalledOnce()
  })

  it.each(['needsAction', 'declined', 'tentative'])('leaves %s unchanged after bounded checks', async (status) => {
    const test = setup({ status })
    const result = await createReplacementBooking(test.options)
    expect(result.bookingWarning).toBeTruthy()
    expect(result.event.attendees?.[0].responseStatus).toBe(status)
    expect(test.sleep.mock.calls).toEqual([[400], [1000]])
    expect(test.create).toHaveBeenCalledOnce()
  })

  it.each([{ calendars: {} }, { calendars: { [resourceId]: { errors: [{ reason: 'notFound' }] } } }, { calendars: { [resourceId]: {} } }])('does not treat incomplete freeBusy as available: %j', async (availability) => {
    const test = setup({ status: 'accepted' })
    test.request.mockResolvedValueOnce(availability)
    const result = await createReplacementBooking(test.options)
    expect(result.bookingWarning).toContain('contrôle préalable')
    expect(result.event.attendees?.[0].responseStatus).toBe('accepted')
    expect(test.create).toHaveBeenCalledOnce()
  })

  it('creates with its resource after availability failure and never recreates after verification failure', async () => {
    const test = setup()
    test.request.mockRejectedValue(new Error('Google unavailable'))
    const result = await createReplacementBooking(test.options)
    expect(result.event.attendees).toEqual([{ email: resourceId, responseStatus: 'declined' }])
    expect(result.bookingWarning).toContain('Ne recréez pas')
    expect(test.create).toHaveBeenCalledOnce()
  })

  it('skips advisory calls when the shared batch budget is exhausted but still assigns', async () => {
    const test = setup()
    expect((await createReplacementBooking({ ...test.options, deadline: 0 })).bookingWarning).toBeTruthy()
    expect(test.request).not.toHaveBeenCalled()
    expect(test.sleep).not.toHaveBeenCalled()
    expect(test.create).toHaveBeenCalledOnce()
  })

  it('does not start more advisory requests after a slow call consumes the deadline', async () => {
    const test = setup({ busy: true })
    const original = test.request.getMockImplementation()!
    test.request.mockImplementation(async (...args) => { test.advance(12_000); return original(...args) })
    const result = await createReplacementBooking(test.options)
    expect(result.event.attendees?.[0].email).toBe(resourceId)
    expect(test.request).toHaveBeenCalledOnce()
    expect(test.create).toHaveBeenCalledOnce()
    expect(test.request.mock.calls[0][3]).toBeInstanceOf(AbortSignal)
  })

  it('preserves assignment after an advisory timeout', async () => {
    const test = setup()
    test.request.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'))
    const result = await createReplacementBooking(test.options)
    expect(result.event.attendees?.[0].email).toBe(resourceId)
    expect(result.bookingWarning).toBeTruthy()
    expect(test.create).toHaveBeenCalledOnce()
  })

  it('keeps all-day bookings without guessing date-only freeBusy boundaries', async () => {
    const test = setup()
    expect((await createReplacementBooking({ ...test.options, timeMin: undefined, timeMax: undefined })).bookingWarning).toBeTruthy()
    expect(test.request.mock.calls.some((call) => call[0].pathname.endsWith('/freeBusy'))).toBe(false)
    expect(test.created.attendees?.[0].email).toBe(resourceId)
  })

  it('propagates creation failure without retrying the insertion', async () => {
    const test = setup()
    test.create.mockRejectedValue(new Error('Create failed'))
    await expect(createReplacementBooking(test.options)).rejects.toThrow('Create failed')
    expect(test.create).toHaveBeenCalledOnce()
  })
})
