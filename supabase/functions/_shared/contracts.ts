export type ContractType = "CDI" | "CDII" | "CDD";

const CONTRACT_PREFIX = /^\s*\(\s*(CDII|CDD|CDI)\s*\)\s*-/i;

export function detectContractType(resourceName: unknown): ContractType | null {
  const match = String(resourceName ?? "").match(CONTRACT_PREFIX);
  return match ? match[1].toUpperCase() as ContractType : null;
}
