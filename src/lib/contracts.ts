import type { ContractType } from '../types'

const CONTRACT_PREFIX = /^\s*\(\s*(CDII|CDD|CDI)\s*\)\s*-/i

export function detectContractType(resourceName: string): ContractType | null {
  if (/\(\s*Indep\s*\)/i.test(resourceName)) return 'INDEP'
  const match = resourceName.match(CONTRACT_PREFIX)
  return match ? match[1].toUpperCase() as ContractType : null
}

export function contractTypeLabel(contractType: ContractType | null): string {
  return contractType === 'INDEP' ? 'Indépendant' : contractType ?? 'Non détecté'
}
