import { describe, expect, it } from 'vitest'
import { detectContractType } from './contracts'
import { detectContractType as detectServerContractType } from '../../supabase/functions/_shared/contracts'

describe('detectContractType', () => {
  it.each([
    ['(CDI)-Alice Martin', 'CDI'],
    ['(CDII)-Bob Martin', 'CDII'],
    ['(CDD)-Caroline Martin', 'CDD'],
    ['  (cdd) - Jean Martin', 'CDD'],
  ])('detects %s as %s', (resourceName, expected) => {
    expect(detectContractType(resourceName)).toBe(expected)
    expect(detectServerContractType(resourceName)).toBe(expected)
  })

  it('does not infer a contract without a supported prefix', () => {
    expect(detectContractType('Alice Martin (CDD)')).toBeNull()
    expect(detectContractType('(STAGE)-Alice Martin')).toBeNull()
    expect(detectServerContractType('Alice Martin (CDD)')).toBeNull()
    expect(detectServerContractType('(STAGE)-Alice Martin')).toBeNull()
  })
})
