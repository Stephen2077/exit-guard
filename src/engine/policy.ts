// Deterministic policy engine. No network, no LLM, no clock: same input -> same decision.
import { exitCost, type Pool } from './amm'

export type Token = { currency: string; issuer: string }

export type SnapshotEvidence = {
  ledgerIndex: number
  ledgerHash: string
  queriedAt: string
  holderPages: number
  holderLines: number
  holdersComplete: boolean
  walletChecked: boolean
}

export type Snapshot = {
  token: Token
  globalFreeze: boolean // issuer froze all trading of this token right now
  noFreeze: boolean // issuer gave up the power to freeze, forever
  clawback: boolean // issuer can take tokens back out of holders' wallets
  myLineFrozen: boolean | null // null when this wallet was not checked
  top1Share: number | null // largest sampled holder share among read balances (AMM pool and agent excluded)
  pool: Pool | null // token/XRP AMM pool, null if none
  poolFrozen?: boolean // AMM asset is frozen; no executable sell can be estimated
  issuerLpShare: number | null // issuer's share of the pool's LP tokens (can withdraw that much liquidity), null if no pool
  transferFee: number // extra token debit on holder-to-holder transfers (0.25 = 25%)
  evidence?: SnapshotEvidence
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
  trustedIssuers: [],
}

export type CheckStatus = 'pass' | 'warn' | 'fail'
export type Check = { id: string; label: string; status: CheckStatus; detail: string }
export type Outcome = 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY'
export type Decision = { outcome: Outcome; checks: Check[] }

const pct = (x: number) => `${(x * 100).toFixed(2)}%`

const validPool = (pool: Pool) =>
  Number.isFinite(pool.token) && pool.token > 0 &&
  Number.isFinite(pool.xrp) && pool.xrp > 0 &&
  Number.isFinite(pool.fee) && pool.fee >= 0 && pool.fee < 1

export function evaluate(s: Snapshot, req: BuyRequest, p: Policy = DEFAULT_POLICY): Decision {
  const trusted = p.trustedIssuers.includes(s.token.issuer)
  const amountValid = Number.isFinite(req.amountXrp) && req.amountXrp > 0
  const checks: Check[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail })

  if (s.globalFreeze) add('R1', 'Frozen now', 'fail', 'Issuer has frozen all trading. Nobody can sell.')
  else if (s.myLineFrozen === null) add('R1', 'Frozen now', 'warn', 'Wallet-specific freeze status was not checked.')
  else if (s.myLineFrozen) add('R1', 'Frozen now', 'fail', 'Issuer has frozen the tokens in this wallet. You cannot sell.')
  else add('R1', 'Frozen now', 'pass', 'Not frozen.')

  if (s.noFreeze) add('R2', 'Can freeze later', 'pass', 'Issuer gave up freezing forever.')
  else if (trusted) add('R2', 'Can freeze later', 'pass', 'Issuer can freeze, but is on your trusted list.')
  else add('R2', 'Can freeze later', 'warn', 'Issuer can freeze your tokens at any time.')

  if (!s.clawback) add('R3', 'Can take tokens back', 'pass', 'Issuer cannot claw back.')
  else if (trusted) add('R3', 'Can take tokens back', 'pass', 'Clawback is on, but issuer is on your trusted list.')
  else add('R3', 'Can take tokens back', 'fail', 'Issuer can pull tokens out of your wallet.')

  if (s.top1Share === null) add('R4', 'Holder concentration', 'warn', 'Holder concentration is unknown; no holder sample was available.')
  else if (s.evidence?.holdersComplete === false)
    add('R4', 'Holder concentration', 'warn', `Largest sampled holder: ${pct(s.top1Share)}. Holder pages are incomplete, so this cannot be cleared.`)
  else if (s.top1Share > p.maxTop1Share)
    add('R4', 'Holder concentration', 'warn', `Largest sampled holder: ${pct(s.top1Share)}.`)
  else add('R4', 'Holder concentration', 'pass', `Largest sampled holder: ${pct(s.top1Share)}.`)

  if (!s.pool) add('R5', 'AMM sell price impact', 'fail', 'AMM not found; order books were not checked, so sell price impact cannot be estimated.')
  else if (s.poolFrozen)
    add('R5', 'AMM sell price impact', 'fail', 'AMM is frozen; an executable sell cannot be estimated from this pool.')
  else if (!amountValid || !validPool(s.pool))
    add('R5', 'AMM sell price impact', 'fail', 'Could not estimate AMM sell price impact (invalid pool reserves or amount).')
  else {
    const e = exitCost(s.pool, req.amountXrp)
    if (!Number.isFinite(e.cost))
      add('R5', 'AMM sell price impact', 'fail', 'Could not estimate AMM sell price impact (invalid pool reserves or amount).')
    else {
      const detail = `Estimated AMM sell price impact is ${pct(e.cost)} below the pre-trade spot price (pool: ${s.pool.xrp.toFixed(1)} XRP).`
      const status = e.cost > p.maxExitCost ? 'fail' : e.cost > p.warnExitCost ? 'warn' : 'pass'
      add('R5', 'AMM sell price impact', status, detail)
    }
  }

  if (!s.pool || s.issuerLpShare === null)
    add('R6', 'Can pull the pool', 'warn', 'Issuer LP share is unknown; pool liquidity control was not checked.')
  else if (s.issuerLpShare > p.maxIssuerLpShare && !trusted)
    add('R6', 'Can pull the pool', 'warn', `Issuer owns ${pct(s.issuerLpShare)} of the pool and can withdraw it at any time.`)
  else add('R6', 'Can pull the pool', 'pass', `Issuer owns ${pct(s.issuerLpShare)} of the pool.`)

  const transferDetail = s.transferFee > 0
    ? `Transfers between holders debit an additional ${pct(s.transferFee)} in tokens. Transfers directly to/from the issuer are exempt. Route costs are not included in the AMM estimate.`
    : 'No issuer transfer fee is reported. Route costs are not included in the AMM estimate.'
  if (s.transferFee > p.maxTransferFee) add('R7', 'Transfer fee', 'fail', transferDetail)
  else if (s.transferFee > p.warnTransferFee) add('R7', 'Transfer fee', 'warn', transferDetail)
  else add('R7', 'Transfer fee', 'pass', transferDetail)

  if (!amountValid) add('R8', 'Amount', 'fail', 'Amount must be a finite number greater than zero.')
  else if (req.amountXrp > p.autoLimitXrp) add('R8', 'Amount', 'warn', `${req.amountXrp} XRP is above the ${p.autoLimitXrp} XRP auto-limit.`)
  else add('R8', 'Amount', 'pass', `${req.amountXrp} XRP is within the ${p.autoLimitXrp} XRP auto-limit.`)

  // Any fail is final: approval can never override it.
  const outcome: Outcome = checks.some(c => c.status === 'fail')
    ? 'DENY'
    : checks.some(c => c.status === 'warn')
      ? 'REQUIRE_APPROVAL'
      : 'ALLOW'
  return { outcome, checks }
}
