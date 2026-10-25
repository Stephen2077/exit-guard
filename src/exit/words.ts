// Plain words for Exit Guard: the sign's lines, the five questions, the raw ledger values, and directory notes.
import { exitCost } from '../engine/amm'
import { DEFAULT_POLICY, type BuyRequest, type Check, type Decision, type Outcome, type Snapshot } from '../engine/policy'
import { short } from '../ui/format'
import type { DirToken, Lookalikes } from '../xrpl/directory'
import { currencyName } from '../xrpl/token'

// 0.25 -> "25%", 0.225 -> "22.5%", 0.0001 -> "0.01%". A tiny value that is not 0 never reads as 0%.
export function pct(x: number): string {
  // Round off float noise first: a TransferRate of 1000100000 gives 0.00009999999999998899, which is 0.01%.
  const v = Math.round(x * 1e8) / 1e6
  if (v > 0 && v < 0.01) return '<0.01%'
  return `${Number(v.toFixed(Math.abs(v) < 1 ? 2 : 1))}%`
}
export const num = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 2 })

// The sign's words for each verdict, and the short tag used in lists.
export const SIGN: Record<Outcome, { title: string; sub: string; tag: string }> = {
  ALLOW: { title: 'Checks passed.', sub: 'No current rule blocked this amount. This does not guarantee a future sale.', tag: 'ALLOW' },
  REQUIRE_APPROVAL: { title: 'Review first.', sub: 'Review the risk flags and any missing data before buying.', tag: 'APPROVAL' },
  DENY: { title: 'Blocked.', sub: 'The current policy blocks this request. See the risk or coverage issue below.', tag: 'DENY' },
}

export const QUESTIONS = [
  { title: 'Can they lock you in?', ids: ['R1', 'R2'] },
  { title: 'Can they take it back?', ids: ['R3'] },
  { title: 'How wide is the way out?', ids: ['R5', 'R6', 'R4'] },
  { title: 'Is there a toll?', ids: ['R7'] },
  { title: 'Is it a small buy?', ids: ['R8'] },
]

// The lines that explain the verdict: failures for DENY, warnings for approval, the main passes for ALLOW.
export function signReasons(checks: Check[], outcome: Outcome): Check[] {
  if (outcome === 'DENY') return checks.filter(c => c.status === 'fail')
  if (outcome === 'REQUIRE_APPROVAL') return checks.filter(c => c.status === 'warn')
  return checks.filter(c => ['R2', 'R3', 'R5'].includes(c.id))
}

// One short line for the sign. Falls back to the engine's own sentence.
export function signLine(c: Check, s: Snapshot, req: BuyRequest): string {
  const xrp = `${num(req.amountXrp)} XRP`
  switch (c.id) {
    case 'R1':
      if (c.status === 'pass') return 'Not frozen right now.'
      if (s.myLineFrozen === null && !s.globalFreeze) return 'Wallet-specific freeze status is unknown.'
      return s.globalFreeze ? 'The issuer froze all trading.' : 'The issuer froze the tokens in this wallet.'
    case 'R2':
      if (c.status !== 'pass') return 'The issuer kept the power to freeze.'
      return s.noFreeze ? 'The issuer gave up freezing, forever.' : 'The issuer can freeze, but is on the trusted list.'
    case 'R3':
      return c.status === 'pass' ? 'The issuer cannot take tokens back.' : 'The issuer can take tokens back.'
    case 'R4':
      return s.top1Share === null ? 'Holder distribution is unknown.' : `Largest included holder: ${pct(s.top1Share)} of the balances read${s.evidence?.holdersComplete === false ? ' (partial sample)' : ''}.`
    case 'R5': {
      if (!s.pool) return 'No AMM pool to sell into (order books not counted).'
      if (s.poolFrozen) return 'This AMM is frozen; no usable sell quote is available.'
      const { cost } = exitCost(s.pool, req.amountXrp)
      return Number.isFinite(cost) ? `AMM sell price impact: ${pct(cost)} below the pre-buy spot price.` : c.detail
    }
    case 'R6':
      return s.issuerLpShare === null ? 'The issuer’s liquidity control could not be determined.' : `The issuer owns ${pct(s.issuerLpShare)} of the pool.`
    case 'R7':
      return s.transferFee > 0 ? `Additional token transfer rate: ${pct(s.transferFee)}.` : 'No issuer transfer rate is set.'
    case 'R8':
      return `${xrp} is ${c.status === 'pass' ? 'under' : 'over'} the ${DEFAULT_POLICY.autoLimitXrp} XRP auto-limit.`
    default:
      return c.detail
  }
}

// The answer under each question: the engine's sentence, with numbers made readable where the engine prints raw ones.
export function answerLine(c: Check, s: Snapshot, req: BuyRequest): string {
  if (c.id === 'R5' && s.pool && !s.poolFrozen) {
    const { cost } = exitCost(s.pool, req.amountXrp)
    if (Number.isFinite(cost)) return `AMM sell price impact is ${pct(cost)} below the pre-buy spot price (pool: ${num(s.pool.xrp)} XRP). This is not the buy-then-sell loss.`
  }
  if (c.id === 'R7' && s.transferFee > 0) return `Transfers between holders debit an additional ${pct(s.transferFee)} in tokens. Direct issuer transfers are exempt. This charge is excluded from the AMM model.`
  if (c.id === 'R6' && s.issuerLpShare !== null && c.status === 'pass') return `Issuer owns ${pct(s.issuerLpShare)} of the pool.`
  return c.detail
}

// The raw ledger values behind each answer, so we can check the check.
export function evidence(id: string, s: Snapshot, wallet: boolean): string {
  switch (id) {
    case 'R1':
      return `globalFreeze: ${s.globalFreeze}` + (wallet ? ` · this wallet frozen: ${s.myLineFrozen === null ? 'unknown' : s.myLineFrozen}` : ' · no wallet checked')
    case 'R2':
      return `noFreeze: ${s.noFreeze}`
    case 'R3':
      return `allowTrustLineClawback: ${s.clawback}`
    case 'R4':
      return s.top1Share === null
        ? 'no included holder balance was available'
        : `largest included holder: ${pct(s.top1Share)} · ${s.evidence?.holderLines ?? 'unknown number of'} lines read · ${s.evidence?.holdersComplete ? 'all pages read' : 'partial or unknown coverage'}`
    case 'R5':
      return s.pool
        ? `AMM pool ${num(s.pool.token)} ${currencyName(s.token.currency)} / ${num(s.pool.xrp)} XRP · fee ${pct(s.pool.fee)}`
        : 'no AMM pool · order books not counted'
    case 'R6':
      return s.issuerLpShare === null ? 'issuer LP share unknown' : `issuer holds ${pct(s.issuerLpShare)} of the LP tokens`
    case 'R7':
      return s.transferFee > 0 ? `TransferRate: ${Math.round((1 + s.transferFee) * 1e9)}` : 'TransferRate: not set'
    case 'R8':
      return `auto-limit: ${DEFAULT_POLICY.autoLimitXrp} XRP`
    default:
      return ''
  }
}

// An issuer sets its own domain, so anyone can claim ripple.com. Show it as a claim, without the URL parts.
export const claimedDomain = (domain: string) => `says ${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`

// No holders in the first 400 trust lines and no pool: the code or the issuer is probably wrong.
export const looksEmpty = (s: Snapshot) => s.top1Share === null && !s.pool && s.evidence?.holdersComplete === true

// Is this the token people usually mean by this code? Impostors reuse a well-known code under a new issuer.
// `look.same` = directory tokens with the same code, most holders first, from the closest name matches only.
export function lookalikeNote(issuer: string, code: string, look: Lookalikes): { warn: boolean; text: string } {
  const name = currencyName(code)
  if (name === code && code.length === 40) return { warn: false, text: 'This code is not plain text, so the directory cannot be searched for copies.' }
  const where = look.total > look.scanned ? `the ${look.scanned} closest name matches (of ${num(look.total)})` : 'the directory'
  const n = look.same.length
  if (!look.same.some(t => t.issuer !== issuer)) return { warn: false, text: `No other token in ${where} uses the code ${name}.` }
  if (look.same[0].issuer === issuer) return { warn: false, text: `${n} tokens in ${where} use the code ${name}. This one has the most holders.` }
  const top = look.same[0]
  const who = top.issuerName ?? short(top.issuer)
  return {
    warn: true,
    text: `${n} tokens in ${where} use the code ${name}, and this is not the most-held one. ${who} has ${num(top.holders ?? 0)} holders. Make sure this is the issuer you mean.`,
  }
}

// DENY only because no AMM pool was found. The token may still trade on the order book, which is not counted yet.
export const onlyNoPool = (d: Decision, s: Snapshot) =>
  d.outcome === 'DENY' && !s.pool && d.checks.filter(c => c.status === 'fail').every(c => c.id === 'R5')

export const NO_POOL = {
  title: 'Coverage incomplete.',
  sub: 'No token/XRP AMM was found. Order books and other routes were not checked; this does not prove the token cannot be sold.',
  api: 'DENY only because no AMM pool was found. Order books are not counted yet: the token may still be sellable there.',
}

export const LIMITS = [
  'Holder reads stop after five pages of up to 400 trust lines; a remaining marker means a partial sample.',
  'Holder percentages describe included balances read, excluding the AMM and optional wallet, not total issued supply.',
  'AMM estimates exclude issuer transfer charges, network fees, rounding, order books, other routes and competing trades.',
  'Authorization requirements and liquidity-provider concentration beyond the issuer are not checked.',
]

// Picked from a name search, but not the most-held match: the easy way to buy a copy by mistake.
export function searchNote(q: string, top: DirToken, picked: { currency: string; issuer: string }, pickedHolders?: number): string | null {
  if (top.issuer === picked.issuer && top.currency === picked.currency) return null
  const who = top.issuerName ?? short(top.issuer)
  const mine = pickedHolders === undefined ? '' : ` This one has ${num(pickedHolders)}.`
  return `You searched "${q}". The most-held match is ${top.name} from ${who}, with ${num(top.holders ?? 0)} holders.${mine} Make sure this is the token you mean.`
}

// Recent checks as pills: one per token and network, newest first. Copies share a name, so each pill also shows
// the end of its issuer's address.
type Checked = { mode: 'agent' | 'check'; net: string; req: { token: { currency: string; issuer: string } } }
export function recentPills<T extends Checked>(entries: T[], max = 8): T[] {
  const seen = new Set<string>()
  return entries
    .filter(e => {
      const key = `${e.net}|${e.req.token.currency}|${e.req.token.issuer}`
      if (e.mode !== 'check' || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, max)
}
export const issuerTail = (issuer: string) => `…${issuer.slice(-4)}`

// What a transaction result means, in words. The raw code is still shown next to it.
export function resultWords(result: string): { ok: boolean; text: string } {
  if (result === 'tesSUCCESS') return { ok: true, text: 'Done' }
  if (result === 'tecUNFUNDED_OFFER') return { ok: false, text: 'Failed: no balance it can use' }
  if (result === 'tecFROZEN') return { ok: false, text: 'Failed: frozen' }
  if (result.startsWith('ERROR')) return { ok: false, text: 'Not sent' }
  return { ok: false, text: 'Failed' }
}
