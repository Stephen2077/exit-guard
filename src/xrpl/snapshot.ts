// Read everything the policy engine needs from the ledger. Read-only.
import type { Pool } from '../engine/amm'
import type { Snapshot, Token } from '../engine/policy'
import { getClient } from './client'

type IssuedAmount = { currency: string; issuer: string; value: string }
type AmmAmount = string | IssuedAmount

export async function getSnapshot(token: Token, agent: string | null): Promise<Snapshot> {
  const c = await getClient()

  const info = await c.request({ command: 'account_info', account: token.issuer, ledger_index: 'validated' })
  const flags = info.result.account_flags

  let pool: Pool | null = null
  let ammAccount: string | null = null
  try {
    const r = await c.request({
      command: 'amm_info',
      asset: { currency: token.currency, issuer: token.issuer },
      asset2: { currency: 'XRP' },
      ledger_index: 'validated',
    })
    const a = r.result.amm
    const amounts = [a.amount, a.amount2] as AmmAmount[]
    const xrp = amounts.find((x): x is string => typeof x === 'string')!
    const tok = amounts.find((x): x is IssuedAmount => typeof x !== 'string')!
    pool = { token: Number(tok.value), xrp: Number(xrp) / 1e6, fee: (a.trading_fee ?? 0) / 100000 }
    ammAccount = a.account
  } catch {
    // no AMM pool for this pair
  }

  // Holders are the issuer's trust lines with a negative balance (from the issuer's side).
  // First page only (up to 400 lines): enough for demo tokens, an approximation for big ones.
  const lines = await c.request({ command: 'account_lines', account: token.issuer, ledger_index: 'validated', limit: 400 })
  const holdings = lines.result.lines
    .filter(l => l.currency === token.currency && l.account !== ammAccount && l.account !== agent)
    .map(l => -Number(l.balance))
    .filter(b => b > 0)
  const total = holdings.reduce((a, b) => a + b, 0)
  const top1Share = total > 0 ? Math.max(...holdings) / total : null

  let myLineFrozen = false
  if (agent) {
    try {
      const r = await c.request({ command: 'account_lines', account: agent, peer: token.issuer, ledger_index: 'validated' })
      myLineFrozen = !!r.result.lines.find(l => l.currency === token.currency)?.freeze_peer
    } catch (e) {
      // Only "agent account not funded yet" is safe to ignore; anything else must not read as "not frozen".
      if ((e as { data?: { error?: string } }).data?.error !== 'actNotFound') throw e
    }
  }

  return {
    token,
    globalFreeze: !!flags?.globalFreeze,
    noFreeze: !!flags?.noFreeze,
    clawback: !!flags?.allowTrustLineClawback,
    myLineFrozen,
    top1Share,
    pool,
  }
}

export async function tokenBalance(account: string, token: Token): Promise<number> {
  const c = await getClient()
  try {
    const r = await c.request({ command: 'account_lines', account, peer: token.issuer, ledger_index: 'validated' })
    return Number(r.result.lines.find(l => l.currency === token.currency)?.balance ?? 0)
  } catch {
    return 0
  }
}
