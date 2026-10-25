import { describe, expect, it } from 'vitest'
import { exitCost } from './amm'
import { evaluate, type Snapshot } from './policy'

const token = { currency: 'GOD', issuer: 'rGood' }
const safe: Snapshot = {
  token,
  globalFreeze: false,
  noFreeze: true,
  clawback: false,
  myLineFrozen: false,
  top1Share: null,
  pool: { token: 50000, xrp: 50, fee: 0.005 },
}

describe('exitCost', () => {
  it('is near zero for a tiny trade with no fee', () => {
    expect(exitCost({ token: 1e6, xrp: 1e6, fee: 0 }, 1).cost).toBeCloseTo(0, 5)
  })
  it('is large when the trade is big relative to the pool', () => {
    const c = exitCost({ token: 5000, xrp: 5, fee: 0.005 }, 2).cost
    expect(c).toBeGreaterThan(0.2)
    expect(c).toBeLessThan(0.25)
  })
})

describe('evaluate', () => {
  it('ALLOWs a small buy of a safe token', () => {
    expect(evaluate(safe, { token, amountXrp: 2 }).outcome).toBe('ALLOW')
  })

  it('REQUIREs APPROVAL above the auto-limit', () => {
    const d = evaluate(safe, { token, amountXrp: 8 })
    expect(d.outcome).toBe('REQUIRE_APPROVAL')
    expect(d.checks.find(c => c.id === 'R6')?.status).toBe('warn')
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

  it('DENYs when there is no pool to sell into', () => {
    expect(evaluate({ ...safe, pool: null }, { token, amountXrp: 1 }).outcome).toBe('DENY')
  })

  it('DENYs when exit cost is too high, even if amount alone would need approval', () => {
    const shallow = { ...safe, pool: { token: 5000, xrp: 5, fee: 0.005 } }
    expect(evaluate(shallow, { token, amountXrp: 8 }).outcome).toBe('DENY')
  })

  it('trusted issuer turns clawback/freeze into pass, but a live freeze still DENYs', () => {
    const p = { autoLimitXrp: 5, warnExitCost: 0.05, maxExitCost: 0.2, maxTop1Share: 0.5, trustedIssuers: ['rGood'] }
    const s = { ...safe, noFreeze: false, clawback: true }
    expect(evaluate(s, { token, amountXrp: 1 }, p).outcome).toBe('ALLOW')
    expect(evaluate({ ...s, globalFreeze: true }, { token, amountXrp: 1 }, p).outcome).toBe('DENY')
  })
})
