export type ContractType = "CDI" | "CDII" | "CDD" | "INDEP";

const CONTRACT_PREFIX = /^\s*\(\s*(CDII|CDD|CDI)\s*\)\s*-/i;

export function detectContractType(resourceName: unknown): ContractType | null {
  if (/\(\s*Indep\s*\)/i.test(String(resourceName ?? ""))) return "INDEP";
  const match = String(resourceName ?? "").match(CONTRACT_PREFIX);
  return match ? match[1].toUpperCase() as ContractType : null;
}
