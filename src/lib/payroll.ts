export function parsePayrollHours(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const hours = Number(normalized)
  return Number.isFinite(hours) ? Math.round(hours * 100) : null
}

export function formatPayrollHours(hundredths: number): string {
  return (hundredths / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
