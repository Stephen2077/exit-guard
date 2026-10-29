// Deterministic policy engine. No network, no LLM, no clock: same input -> same decision.
import { exitCost, type Pool } from './amm'

export type Token = { currency: string; issuer: string }

export type Snapshot = {
  token: Token
  globalFreeze: boolean // issuer froze all trading of this token right now
  noFreeze: boolean // issuer gave up the power to freeze, forever
  clawback: boolean // issuer can take tokens back out of holders' wallets
  myLineFrozen: boolean // issuer froze the agent's own holding
  top1Share: number | null // biggest other holder's share of supply (AMM pool and agent excluded)
  pool: Pool | null // token/XRP AMM pool, null if none
  issuerLpShare: number | null // issuer's share of the pool's LP tokens (can withdraw that much liquidity), null if no pool
  transferFee: number // fee the issuer takes on every transfer between holders, incl. selling into the pool (0.25 = 25%)
}

export type BuyRequest = { token: Token; amountXrp: number }

export type Policy = {
  autoLimitXrp: number // above this, a human must approve
  warnExitCost: number
  maxExitCost: number
  maxTop1Share: number
  maxIssuerLpShare: number
  warnTransferFee: number
  maxTransferFee: number
  trustedIssuers: string[] // e.g. regulated stablecoins that need clawback for compliance
}

export const DEFAULT_POLICY: Policy = {
  autoLimitXrp: 5,
  warnExitCost: 0.05,
  maxExitCost: 0.2,
  maxTop1Share: 0.5,
  maxIssuerLpShare: 0.5,
  warnTransferFee: 0.01,
  maxTransferFee: 0.1,
  trustedIssuers: ['rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'], // RLUSD (Ripple USD)
}

export type CheckStatus = 'pass' | 'warn' | 'fail'
export type Check = { id: string; label: string; status: CheckStatus; detail: string }
export type Outcome = 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY'
export type Decision = { outcome: Outcome; checks: Check[] }

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function evaluate(s: Snapshot, req: BuyRequest, p: Policy = DEFAULT_POLICY): Decision {
  const trusted = p.trustedIssuers.includes(s.token.issuer)
  const checks: Check[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail })

  if (s.globalFreeze) add('R1', 'Frozen now', 'fail', 'Issuer has frozen all trading. Nobody can sell.')
  else if (s.myLineFrozen) add('R1', 'Frozen now', 'fail', 'Issuer has frozen the tokens in this wallet. You cannot sell.')
  else add('R1', 'Frozen now', 'pass', 'Not frozen.')

  if (s.noFreeze) add('R2', 'Can freeze later', 'pass', 'Issuer gave up freezing forever.')
  else if (trusted) add('R2', 'Can freeze later', 'pass', 'Issuer can freeze, but is on your trusted list.')
  else add('R2', 'Can freeze later', 'warn', 'Issuer kept the power to freeze. Most regulated stablecoins keep it too.')

  if (!s.clawback) add('R3', 'Can take tokens back', 'pass', 'Issuer cannot claw back.')
  // A regulated stablecoin keeps clawback for compliance: a human should know, but it is not a trap.
  else if (trusted) add('R3', 'Can take tokens back', 'warn', 'Clawback is on. The issuer is a regulated stablecoin on your trusted list.')
  else add('R3', 'Can take tokens back', 'fail', 'Issuer can pull tokens out of your wallet.')

  if (s.top1Share === null) add('R4', 'Holder concentration', 'pass', 'Not enough other holders to judge.')
  else if (s.top1Share > p.maxTop1Share) add('R4', 'Holder concentration', 'warn', `One wallet holds ${pct(s.top1Share)} of supply.`)
  else add('R4', 'Holder concentration', 'pass', `Largest holder: ${pct(s.top1Share)}.`)

  if (!s.pool) add('R5', 'Exit cost', 'fail', 'No AMM pool to sell into. Order books are not checked yet.')
  else {
    const e = exitCost(s.pool, req.amountXrp)
    if (!Number.isFinite(e.cost) || !(req.amountXrp > 0)) add('R5', 'Exit cost', 'fail', 'Could not price the exit (empty pool or bad amount).')
    else {
      const detail = `Selling this many tokens into the pool gets ${pct(e.cost)} below market price (pool: ${s.pool.xrp.toFixed(1)} XRP).`
      const status = e.cost > p.maxExitCost ? 'fail' : e.cost > p.warnExitCost ? 'warn' : 'pass'
      add('R5', 'Exit cost', status, detail)
    }
  }

  if (s.issuerLpShare === null) add('R6', 'Can pull the pool', 'pass', 'No pool to pull.')
  else if (s.issuerLpShare > p.maxIssuerLpShare && !trusted)
    add('R6', 'Can pull the pool', 'warn', `Issuer owns ${pct(s.issuerLpShare)} of the pool and can withdraw it at any time.`)
  else add('R6', 'Can pull the pool', 'pass', `Issuer owns ${pct(s.issuerLpShare)} of the pool.`)

  if (s.transferFee > p.maxTransferFee) add('R7', 'Transfer fee', 'fail', `Issuer takes ${pct(s.transferFee)} of every sale.`)
  else if (s.transferFee > p.warnTransferFee) add('R7', 'Transfer fee', 'warn', `Issuer takes ${pct(s.transferFee)} of every sale.`)
  else add('R7', 'Transfer fee', 'pass', s.transferFee > 0 ? `Issuer takes ${pct(s.transferFee)} of every sale.` : 'No transfer fee.')

  if (req.amountXrp > p.autoLimitXrp) add('R8', 'Amount', 'warn', `${req.amountXrp} XRP is above the ${p.autoLimitXrp} XRP limit for automatic buys.`)
  else add('R8', 'Amount', 'pass', `${req.amountXrp} XRP is within the ${p.autoLimitXrp} XRP limit for automatic buys.`)

  // Any fail is final: approval can never override it.
  const outcome: Outcome = checks.some(c => c.status === 'fail')
    ? 'DENY'
    : checks.some(c => c.status === 'warn')
      ? 'REQUIRE_APPROVAL'
      : 'ALLOW'
  return { outcome, checks }
}
