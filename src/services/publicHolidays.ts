import {
  getFrenchPublicHolidaysForSchoolSeason,
  type FrenchPublicHoliday,
  type SchoolSeason,
} from '../lib/annualSummary'

const PUBLIC_HOLIDAY_API_ROOT = 'https://calendrier.api.gouv.fr/jours-feries/metropole'

export async function getGovernmentPublicHolidaysForSchoolSeason(
  season: SchoolSeason,
): Promise<FrenchPublicHoliday[]> {
  getFrenchPublicHolidaysForSchoolSeason(season)
  const seasonStart = Date.UTC(season.startYear, 8, 1)
  const seasonEnd = Date.UTC(season.startYear + 1, 7, 31)

  const responses = await Promise.all([season.startYear, season.startYear + 1].map(async (year) => {
    const response = await fetch(`${PUBLIC_HOLIDAY_API_ROOT}/${year}.json`)
    if (!response.ok) throw new Error(`Public holiday API returned ${response.status}`)
    return response.json() as Promise<Record<string, string>>
  }))

  const holidays = responses.flatMap((payload) => Object.entries(payload).map(([date, name]) => ({
    name,
    date: new Date(`${date}T00:00:00.000Z`),
  }))).filter(({ date, name }) => {
    const timestamp = date.getTime()
    return name.trim().length > 0
      && Number.isFinite(timestamp)
      && timestamp >= seasonStart
      && timestamp <= seasonEnd
  }).sort((left, right) => left.date.getTime() - right.date.getTime())

  if (holidays.length === 0) throw new Error('Public holiday API returned no holiday')

  return holidays
}
