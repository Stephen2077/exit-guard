import { describe, expect, it } from 'vitest'
import { evaluate, type Snapshot } from '../engine/policy'
import type { DirToken } from '../xrpl/directory'
import { answerLine, evidence, lookalikeNote, onlyNoPool, pct, resultWords, searchNote, signLine, signReasons } from './words'

// The SCM demo token as read from testnet on 2026-10-25: clawback, 25% fee, issuer-owned 5 XRP pool, one whale.
const scm: Snapshot = {
  token: { currency: 'SCM', issuer: 'rDGevRAqv5itU4BzbVxVZ2a4xAS5WtnUFF' },
  globalFreeze: false,
  noFreeze: false,
  clawback: true,
  myLineFrozen: false,
  top1Share: 1,
  pool: { token: 5000, xrp: 5, fee: 0.005 },
  issuerLpShare: 1,
  transferFee: 0.25,
}
const req = { token: scm.token, amountXrp: 2 }

describe('pct', () => {
  it('drops trailing zeros and keeps small fees visible', () => {
    expect(pct(0.25)).toBe('25%')
    expect(pct(0.225)).toBe('22.5%')
    expect(pct(0.0001)).toBe('0.01%')
    expect(pct(0.0015)).toBe('0.15%')
    expect(pct(0.00001)).toBe('<0.01%')
    expect(pct(1000100000 / 1e9 - 1)).toBe('0.01%') // SOLO's TransferRate, with float noise
    expect(pct(0)).toBe('0%')
  })
})

describe('the sign for SCM', () => {
  const d = evaluate(scm, req)

  it('lists the three failures in plain words', () => {
    const lines = signReasons(d.checks, d.outcome).map(c => signLine(c, scm, req))
    expect(d.outcome).toBe('DENY')
    expect(lines).toEqual([
      'The issuer can take tokens back.',
      'AMM sell price impact: 22.5% below the pre-buy spot price.',
      'Additional token transfer rate: 25%.',
    ])
  })

  it('shows the raw ledger values', () => {
    expect(evidence('R3', scm, false)).toBe('allowTrustLineClawback: true')
    expect(evidence('R5', scm, false)).toBe('AMM pool 5,000 SCM / 5 XRP · fee 0.5%')
    expect(evidence('R7', scm, false)).toBe('TransferRate: 1250000000')
    expect(evidence('R1', scm, true)).toBe('globalFreeze: false · this wallet frozen: false')
  })

  it('says why there is no exit when there is no pool', () => {
    const noPool = { ...scm, pool: null, issuerLpShare: null }
    const r5 = evaluate(noPool, req).checks.find(c => c.id === 'R5')!
    expect(signLine(r5, noPool, req)).toBe('No AMM pool to sell into. Order books are not counted yet.')
  })
})

describe('answerLine', () => {
  it('formats big pools and tiny fees the engine prints raw', () => {
    const big: Snapshot = { ...scm, clawback: false, pool: { token: 2398667.99, xrp: 21897.7, fee: 0.00766 }, issuerLpShare: 0, transferFee: 0.0001 }
    const checks = evaluate(big, req).checks
    expect(answerLine(checks.find(c => c.id === 'R5')!, big, req)).toContain('(pool: 21,897.7 XRP)')
    expect(answerLine(checks.find(c => c.id === 'R7')!, big, req)).toContain('Transfers between holders debit an additional 0.01% in tokens.')
  })

  it('does not describe an unchecked wallet as frozen or a holder sample as full supply', () => {
    const unknown: Snapshot = { ...scm, myLineFrozen: null, top1Share: null }
    const checks = evaluate(unknown, req).checks
    expect(signLine(checks.find(c => c.id === 'R1')!, unknown, req)).toBe('Wallet-specific freeze status is unknown.')
    expect(signLine(checks.find(c => c.id === 'R4')!, unknown, req)).toBe('Holder distribution is unknown.')
    expect(signLine(checks.find(c => c.id === 'R6')!, { ...unknown, issuerLpShare: null }, req)).toContain('could not be determined')
  })
})

describe('lookalikeNote', () => {
  const real: DirToken = { currency: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', name: 'Ripple USD', issuerName: 'RLUSD', holders: 67878 }
  const fake: DirToken = { currency: 'RLUSD', issuer: 'rLUSDv9MRcCwPdBUZCGkG4u4EtdMMA1qYM', name: 'RLUSD', holders: 1018 }
  const all = (same: DirToken[]) => ({ same, scanned: 40, total: 40 })

  it('is calm for the most-held token', () => {
    expect(lookalikeNote(real.issuer, 'RLUSD', all([real, fake]))).toEqual({
      warn: false,
      text: '2 tokens in the directory use the code RLUSD. This one has the most holders.',
    })
  })

  it('warns for a token that is not the most-held one', () => {
    const n = lookalikeNote(fake.issuer, 'RLUSD', all([real, fake]))
    expect(n.warn).toBe(true)
    expect(n.text).toContain('RLUSD has 67,878 holders')
  })

  it('is calm when no other token uses the code', () => {
    expect(lookalikeNote(real.issuer, 'RLUSD', all([real])).warn).toBe(false)
    expect(lookalikeNote(real.issuer, 'RLUSD', all([])).warn).toBe(false)
  })

  it('says when it only read part of the directory', () => {
    expect(lookalikeNote(real.issuer, 'USD', { same: [], scanned: 50, total: 3127 }).text).toBe(
      'No other token in the 50 closest name matches (of 3,127) uses the code USD.',
    )
  })

  it('does not claim anything for a code that is not plain text', () => {
    const hex = '0158415500000000C1F76FF6ECB0BAC600000000'
    expect(lookalikeNote(real.issuer, hex, all([])).text).toContain('cannot be searched')
  })
})

describe('onlyNoPool', () => {
  it('is true when the missing pool is the only failure', () => {
    const s = { ...scm, clawback: false, transferFee: 0, pool: null, issuerLpShare: null }
    expect(onlyNoPool(evaluate(s, req), s)).toBe(true)
  })

  it('is false when other checks fail too', () => {
    const s = { ...scm, pool: null, issuerLpShare: null }
    expect(onlyNoPool(evaluate(s, req), s)).toBe(false)
  })
})

describe('searchNote', () => {
  const real: DirToken = { currency: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', name: 'Ripple USD', issuerName: 'RLUSD', holders: 67878 }

  it('says nothing when the most-held match was picked', () => {
    expect(searchNote('RLUSD', real, real, 67878)).toBeNull()
  })

  it('warns when a less-held match was picked, even with another code', () => {
    const mint = { currency: '526970706C65204D696E74000000000000000000', issuer: 'rLUSDv9MRcCwPdBUZCGkG4u4EtdMMA1qYM' }
    expect(searchNote('RLUSD', real, mint, 1018)).toBe(
      'You searched "RLUSD". The most-held match is Ripple USD from RLUSD, with 67,878 holders. This one has 1,018. Make sure this is the token you mean.',
    )
  })
})

describe('resultWords', () => {
  it('says what a result code means', () => {
    expect(resultWords('tesSUCCESS')).toEqual({ ok: true, text: 'Done' })
    expect(resultWords('tecUNFUNDED_OFFER').ok).toBe(false)
    expect(resultWords('ERROR tefPAST_SEQ').text).toBe('Not sent')
  })
})
