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
}

export type BuyRequest = { token: Token; amountXrp: number }

export type Policy = {
  autoLimitXrp: number // above this, a human must approve
  warnExitCost: number
  maxExitCost: number
  maxTop1Share: number
  trustedIssuers: string[] // e.g. regulated stablecoins that need clawback for compliance
}

export const DEFAULT_POLICY: Policy = {
  autoLimitXrp: 5,
  warnExitCost: 0.05,
  maxExitCost: 0.2,
  maxTop1Share: 0.5,
  trustedIssuers: [],
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
  else add('R2', 'Can freeze later', 'warn', 'Issuer can freeze your tokens at any time.')

  if (!s.clawback) add('R3', 'Can take tokens back', 'pass', 'Issuer cannot claw back.')
  else if (trusted) add('R3', 'Can take tokens back', 'pass', 'Clawback is on, but issuer is on your trusted list.')
  else add('R3', 'Can take tokens back', 'fail', 'Issuer can pull tokens out of your wallet.')

  if (s.top1Share === null) add('R4', 'Holder concentration', 'pass', 'Not enough other holders to judge.')
  else if (s.top1Share > p.maxTop1Share) add('R4', 'Holder concentration', 'warn', `One wallet holds ${pct(s.top1Share)} of supply.`)
  else add('R4', 'Holder concentration', 'pass', `Largest holder: ${pct(s.top1Share)}.`)

  if (!s.pool) add('R5', 'Exit cost', 'fail', 'No AMM pool. There is nowhere to sell.')
  else {
    const e = exitCost(s.pool, req.amountXrp)
    if (!Number.isFinite(e.cost) || !(req.amountXrp > 0)) add('R5', 'Exit cost', 'fail', 'Could not price the exit (empty pool or bad amount).')
    else {
      const detail = `Selling this many tokens into the pool gets ${pct(e.cost)} below market price (pool: ${s.pool.xrp.toFixed(1)} XRP).`
      const status = e.cost > p.maxExitCost ? 'fail' : e.cost > p.warnExitCost ? 'warn' : 'pass'
      add('R5', 'Exit cost', status, detail)
    }
  }

  if (req.amountXrp > p.autoLimitXrp) add('R6', 'Amount', 'warn', `${req.amountXrp} XRP is above the ${p.autoLimitXrp} XRP auto-limit.`)
  else add('R6', 'Amount', 'pass', `${req.amountXrp} XRP is within the ${p.autoLimitXrp} XRP auto-limit.`)

  // Any fail is final: approval can never override it.
  const outcome: Outcome = checks.some(c => c.status === 'fail')
    ? 'DENY'
    : checks.some(c => c.status === 'warn')
      ? 'REQUIRE_APPROVAL'
      : 'ALLOW'
  return { outcome, checks }
}
