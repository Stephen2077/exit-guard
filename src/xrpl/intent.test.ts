import { describe, expect, it } from 'vitest'
import { detect } from './intent'

const SOLO_ISSUER = 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz'

describe('detect', () => {
  it('reads exact forms without a model', () => {
    expect(detect(` ${SOLO_ISSUER} `)).toEqual({ kind: 'issuer', issuer: SOLO_ISSUER })
    expect(detect(`SOLO.${SOLO_ISSUER}`)).toEqual({ kind: 'token', code: 'SOLO', issuer: SOLO_ISSUER })
    expect(detect(`SOLO ${SOLO_ISSUER}`)).toEqual({ kind: 'token', code: 'SOLO', issuer: SOLO_ISSUER })
    expect(detect('RLUSD')).toEqual({ kind: 'name', name: 'RLUSD' })
  })

  it('treats sentences as instructions and keeps the amount and address it finds', () => {
    expect(detect('buy 50 XRP of SOLO')).toEqual({ kind: 'instruction', text: 'buy 50 XRP of SOLO', amountXrp: 50, issuer: undefined })
    expect(detect(`is the token from ${SOLO_ISSUER} safe for 2.5 xrp?`)).toMatchObject({ kind: 'instruction', issuer: SOLO_ISSUER, amountXrp: 2.5 })
  })

  it('does not take XRP or an invalid address as a token', () => {
    expect(detect('XRP').kind).toBe('instruction')
    expect(detect('rNotAValidAddressxxxxxxxxxxxxxxx').kind).toBe('instruction')
    expect(detect('   ').kind).toBe('empty')
  })
})
