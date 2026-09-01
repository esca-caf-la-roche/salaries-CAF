import type { ContractType } from '../types'

const CONTRACT_PREFIX = /^\s*\(\s*(CDII|CDD|CDI)\s*\)\s*-/i

export function detectContractType(resourceName: string): ContractType | null {
  const match = resourceName.match(CONTRACT_PREFIX)
  return match ? match[1].toUpperCase() as ContractType : null
}
