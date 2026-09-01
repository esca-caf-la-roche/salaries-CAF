import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGovernmentPublicHolidaysForSchoolSeason } from './publicHolidays'

describe('getGovernmentPublicHolidaysForSchoolSeason', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads both calendar years and keeps only dates in the school season', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ '2026-01-01': "Jour de l'an", '2026-11-11': 'Armistice 1918' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ '2027-05-01': 'Fête du Travail', '2027-11-11': 'Armistice 1918' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const holidays = await getGovernmentPublicHolidaysForSchoolSeason({ startYear: 2026 })

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://calendrier.api.gouv.fr/jours-feries/metropole/2026.json')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://calendrier.api.gouv.fr/jours-feries/metropole/2027.json')
    expect(holidays.map(({ name }) => name)).toEqual(['Armistice 1918', 'Fête du Travail'])
  })

  it('fails explicitly when the government endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    await expect(getGovernmentPublicHolidaysForSchoolSeason({ startYear: 2026 }))
      .rejects.toThrow('Public holiday API returned 503')
  })
})
