import { describe, expect, it } from 'vitest'
import { currencyCode, currencyName, parseToken } from './token'

const RLUSD_HEX = '524C555344000000000000000000000000000000'
const ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'

describe('currency codes', () => {
  it('keeps 3-character codes as they are', () => {
    expect(currencyCode('USD')).toBe('USD')
    expect(currencyCode(' SCM ')).toBe('SCM')
  })

  it('turns longer codes into 40 hex characters', () => {
    expect(currencyCode('RLUSD')).toBe(RLUSD_HEX)
    expect(currencyCode(RLUSD_HEX.toLowerCase())).toBe(RLUSD_HEX)
  })

  it('reads hex codes back as names', () => {
    expect(currencyName(RLUSD_HEX)).toBe('RLUSD')
    expect(currencyName('USD')).toBe('USD')
    // Hex codes starting with 00 are not ASCII names: show them as they are.
    expect(currencyName('0158415500000000C1F76FF6ECB0BAC600000000')).toBe('0158415500000000C1F76FF6ECB0BAC600000000')
  })
})

describe('parseToken', () => {
  it('accepts a code and a valid issuer', () => {
    expect(parseToken('RLUSD', ISSUER)).toEqual({ ok: true, token: { currency: RLUSD_HEX, issuer: ISSUER } })
  })

  it('rejects XRP, empty codes, long codes and bad issuers', () => {
    expect(parseToken('xrp', ISSUER).ok).toBe(false)
    expect(parseToken('0'.repeat(40), ISSUER).ok).toBe(false)
    expect(parseToken('  ', ISSUER).ok).toBe(false)
    expect(parseToken('THIS_CODE_IS_WAY_TOO_LONG', ISSUER).ok).toBe(false)
    expect(parseToken('USD', 'not-an-address').ok).toBe(false)
  })
})
