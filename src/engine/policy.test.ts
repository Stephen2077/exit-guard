import { describe, expect, it } from 'vitest'
import { exitCost, roundTripQuote } from './amm'
import { DEFAULT_POLICY, evaluate, type Snapshot } from './policy'

const token = { currency: 'GOD', issuer: 'rGood' }
const safe: Snapshot = {
  token,
  globalFreeze: false,
  noFreeze: true,
  clawback: false,
  myLineFrozen: false,
  top1Share: 0.2,
  pool: { token: 50000, xrp: 50, fee: 0.005 },
  issuerLpShare: 0,
  transferFee: 0,
}

describe('exitCost', () => {
  it('does not invent a round-trip gain for a small amount in a deep fee-free pool', () => {
    const quote = roundTripQuote({ token: 1e9, xrp: 1e9, fee: 0 }, 0.0001)!
    expect(quote.xrpBack).toBeCloseTo(0.0001, 14)
    expect(Math.abs(quote.lossFraction)).toBeLessThan(1e-10)
  })
  it('is near zero for a tiny trade with no fee', () => {
    expect(exitCost({ token: 1e6, xrp: 1e6, fee: 0 }, 1).cost).toBeCloseTo(0, 5)
  })
  it('is large when the trade is big relative to the pool', () => {
    const c = exitCost({ token: 5000, xrp: 5, fee: 0.005 }, 2).cost
    expect(c).toBeGreaterThan(0.2)
    expect(c).toBeLessThan(0.25)
  })
})

describe('roundTripQuote', () => {
  it('returns the input with no AMM fee after updating reserves', () => {
    const q = roundTripQuote({ token: 50000, xrp: 50, fee: 0 }, 2)
    expect(q).not.toBeNull()
    expect(q?.xrpBack).toBeCloseTo(2, 10)
    expect(q?.lossXrp).toBeCloseTo(0, 10)
    expect(q?.lossFraction).toBeCloseTo(0, 10)
  })

  it('shows fee loss while keeping the fee in the pool', () => {
    const q = roundTripQuote({ token: 50000, xrp: 50, fee: 0.005 }, 2)
    expect(q).not.toBeNull()
    expect(q?.xrpBack).toBeLessThan(2)
    expect(q?.lossXrp).toBeGreaterThan(0)
    expect(q?.lossFraction).toBeGreaterThan(0)
  })

  it('is distinct from the legacy exitCost quote', () => {
    const pool = { token: 50000, xrp: 50, fee: 0.005 }
    const roundTrip = roundTripQuote(pool, 2)
    const legacy = exitCost(pool, 2)
    expect(roundTrip).not.toBeNull()
    expect(Math.abs(roundTrip!.xrpBack - legacy.xrpBack)).toBeGreaterThan(1e-6)
  })

  it('returns null for invalid reserves and inputs', () => {
    expect(roundTripQuote({ token: 0, xrp: 50, fee: 0 }, 2)).toBeNull()
    expect(roundTripQuote({ token: 50, xrp: 0, fee: 0 }, 2)).toBeNull()
    expect(roundTripQuote({ token: 50, xrp: 50, fee: 1 }, 2)).toBeNull()
    expect(roundTripQuote({ token: 50, xrp: 50, fee: 0 }, 0)).toBeNull()
    expect(roundTripQuote({ token: 50, xrp: 50, fee: 0 }, Number.NaN)).toBeNull()
    expect(roundTripQuote({ token: 50, xrp: 50, fee: 0 }, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('evaluate', () => {
  it('ALLOWs a small buy of a safe token', () => {
    expect(evaluate(safe, { token, amountXrp: 2 }).outcome).toBe('ALLOW')
  })

  it('REQUIREs APPROVAL above the auto-limit', () => {
    const d = evaluate(safe, { token, amountXrp: 8 })
    expect(d.outcome).toBe('REQUIRE_APPROVAL')
    expect(d.checks.find(c => c.id === 'R8')?.status).toBe('warn')
  })

  it('REQUIREs APPROVAL when the issuer can still freeze', () => {
    expect(evaluate({ ...safe, noFreeze: false }, { token, amountXrp: 1 }).outcome).toBe('REQUIRE_APPROVAL')
  })

  it('DENYs when clawback is on', () => {
    expect(evaluate({ ...safe, noFreeze: false, clawback: true }, { token, amountXrp: 1 }).outcome).toBe('DENY')
  })

  it('DENYs when the agent holding is frozen', () => {
    expect(evaluate({ ...safe, myLineFrozen: true }, { token, amountXrp: 1 }).outcome).toBe('DENY')
  })

  it('requires approval when this wallet was not checked', () => {
    const d = evaluate({ ...safe, myLineFrozen: null }, { token, amountXrp: 1 })
    expect(d.outcome).toBe('REQUIRE_APPROVAL')
    expect(d.checks.find(c => c.id === 'R1')).toMatchObject({ status: 'warn' })
    expect(d.checks.find(c => c.id === 'R1')?.detail).toMatch(/not checked/i)
  })

  it('keeps a live global freeze as a hard denial even without wallet data', () => {
    const d = evaluate({ ...safe, globalFreeze: true, myLineFrozen: null }, { token, amountXrp: 1 })
    expect(d.outcome).toBe('DENY')
    expect(d.checks.find(c => c.id === 'R1')).toMatchObject({ status: 'fail' })
  })

  it('warns when holder concentration is unknown or sampled pages are incomplete', () => {
    const unknown = evaluate({ ...safe, top1Share: null }, { token, amountXrp: 1 })
    expect(unknown.checks.find(c => c.id === 'R4')).toMatchObject({ status: 'warn' })
    expect(unknown.checks.find(c => c.id === 'R4')?.detail).toMatch(/unknown/i)

    const incomplete = evaluate({
      ...safe,
      top1Share: 0.2,
      evidence: {
        ledgerIndex: 1,
        ledgerHash: 'hash',
        queriedAt: '2026-01-01T00:00:00.000Z',
        holderPages: 1,
        holderLines: 400,
        holdersComplete: false,
        walletChecked: true,
      },
    }, { token, amountXrp: 1 })
    expect(incomplete.checks.find(c => c.id === 'R4')).toMatchObject({ status: 'warn' })
    expect(incomplete.outcome).toBe('REQUIRE_APPROVAL')
  })

  it('DENYs when there is no pool to sell into', () => {
    const d = evaluate({ ...safe, pool: null, issuerLpShare: null }, { token, amountXrp: 1 })
    expect(d.outcome).toBe('DENY')
    expect(d.checks.find(c => c.id === 'R5')).toMatchObject({ status: 'fail' })
    expect(d.checks.find(c => c.id === 'R5')?.detail).toMatch(/AMM not found/i)
    expect(d.checks.find(c => c.id === 'R5')?.detail).toMatch(/order books were not checked/i)
    expect(d.checks.find(c => c.id === 'R6')).toMatchObject({ status: 'warn' })
  })

  it('DENYs when the AMM is frozen and does not present an executable quote', () => {
    const d = evaluate({ ...safe, poolFrozen: true }, { token, amountXrp: 1 })
    expect(d.outcome).toBe('DENY')
    expect(d.checks.find(c => c.id === 'R5')).toMatchObject({ status: 'fail' })
    expect(d.checks.find(c => c.id === 'R5')?.detail).toMatch(/frozen/i)
  })

  it('REQUIREs APPROVAL when the issuer owns most of the pool', () => {
    const d = evaluate({ ...safe, issuerLpShare: 1 }, { token, amountXrp: 1 })
    expect(d.outcome).toBe('REQUIRE_APPROVAL')
    expect(d.checks.find(c => c.id === 'R6')?.status).toBe('warn')
  })

  it('transfer fee: small passes, medium needs approval, large DENYs', () => {
    const small = evaluate({ ...safe, transferFee: 0.005 }, { token, amountXrp: 1 })
    expect(small.outcome).toBe('ALLOW')
    expect(small.checks.find(c => c.id === 'R7')?.detail).toContain('Transfers between holders debit an additional 0.50% in tokens')
    expect(small.checks.find(c => c.id === 'R7')?.detail).toContain('Transfers directly to/from the issuer are exempt')
    expect(evaluate({ ...safe, transferFee: 0.05 }, { token, amountXrp: 1 }).outcome).toBe('REQUIRE_APPROVAL')
    expect(evaluate({ ...safe, transferFee: 0.25 }, { token, amountXrp: 1 }).outcome).toBe('DENY')
  })

  it('DENYs when the exit cannot be priced (empty pool or bad amount)', () => {
    expect(evaluate({ ...safe, pool: { token: 0, xrp: 0, fee: 0.005 } }, { token, amountXrp: 1 }).outcome).toBe('DENY')
    expect(evaluate(safe, { token, amountXrp: NaN }).outcome).toBe('DENY')
    expect(evaluate(safe, { token, amountXrp: 0 }).outcome).toBe('DENY')
    expect(evaluate(safe, { token, amountXrp: Infinity }).outcome).toBe('DENY')
  })

  it('DENYs when exit cost is too high, even if amount alone would need approval', () => {
    const shallow = { ...safe, pool: { token: 5000, xrp: 5, fee: 0.005 } }
    expect(evaluate(shallow, { token, amountXrp: 8 }).outcome).toBe('DENY')
  })

  it('trusted issuer turns clawback/freeze into pass, but a live freeze still DENYs', () => {
    const p = { ...DEFAULT_POLICY, trustedIssuers: ['rGood'] }
    const s = { ...safe, noFreeze: false, clawback: true }
    expect(evaluate(s, { token, amountXrp: 1 }, p).outcome).toBe('ALLOW')
    expect(evaluate({ ...s, globalFreeze: true }, { token, amountXrp: 1 }, p).outcome).toBe('DENY')
  })
})
