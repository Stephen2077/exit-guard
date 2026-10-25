// The API behind /api/check and /api/search: the same checks as the page, as JSON for AI agents.
// Read-only on both networks: nothing here can send a transaction.
import { evaluate } from '../engine/policy'
import { roundTripQuote } from '../engine/amm'
import { LIMITS, NO_POOL, answerLine, evidence, lookalikeNote, onlyNoPool } from '../exit/words'
import type { Net } from '../xrpl/client'
import { lookalikes, searchTokens, tokenInfo } from '../xrpl/directory'
import { getSnapshot } from '../xrpl/snapshot'
import { currencyName, parseToken, validateWallet } from '../xrpl/token'

type Reply = { status: number; body: unknown }

const DIRECTORY = 'xrplmeta.org token directory. Not ledger data; it does not change the outcome.'
// Ledger errors that mean the question itself was wrong, not that the ledger failed.
const BAD_INPUT = ['malformedCurrency', 'actMalformed', 'invalidParams', 'srcActMalformed']

export async function checkFromQuery(q: URLSearchParams): Promise<Reply> {
  const net = q.get('net') ?? 'mainnet'
  if (net !== 'mainnet' && net !== 'testnet') return { status: 400, body: { error: 'net must be mainnet or testnet.' } }
  const p = parseToken(q.get('currency') ?? '', q.get('issuer') ?? '')
  if (!p.ok) return { status: 400, body: { error: p.error } }
  const amountXrp = Number(q.get('amount') ?? '2')
  if (!(Number.isFinite(amountXrp) && amountXrp > 0)) return { status: 400, body: { error: 'amount must be a number of XRP above 0.' } }
  let wallet: string | null
  try { wallet = validateWallet(q.get('wallet') ?? '') }
  catch (error) { return { status: 400, body: { error: (error as Error).message } } }

  const token = p.token
  const req = { token, amountXrp }
  try {
    // The directory is only a hint, with its own time limit. If it is down, the check still answers.
    const directory = net === 'mainnet' ? readDirectory(token) : Promise.resolve(undefined)
    const snapshot = await getSnapshot(token, wallet, net as Net)
    const decision = evaluate(snapshot, req)
    return {
      status: 200,
      body: {
        outcome: decision.outcome,
        note: onlyNoPool(decision, snapshot) ? NO_POOL.api : undefined,
        token: { currency: token.currency, name: currencyName(token.currency), issuer: token.issuer },
        net,
        amountXrp,
        wallet,
        evidence: snapshot.evidence,
        ammRoundTrip: snapshot.pool && !snapshot.poolFrozen && !snapshot.globalFreeze && snapshot.myLineFrozen !== true
          ? roundTripQuote(snapshot.pool, amountXrp) : null,
        checks: decision.checks.map(c => ({ ...c, detail: answerLine(c, snapshot, req), ledger: evidence(c.id, snapshot, !!wallet) })),
        directory: await directory,
        limits: LIMITS,
        checkedAt: snapshot.evidence?.queriedAt,
        meaning: 'Policy only: ALLOW means no current rule blocked this amount; REQUIRE_APPROVAL means review risks or missing data; DENY blocks buying. No transaction is sent, and no outcome guarantees sellability.',
      },
    }
  } catch (e) {
    const code = (e as { data?: { error?: string } }).data?.error
    if (code === 'actNotFound') return { status: 404, body: { error: `There is no account at this issuer address on ${net}.` } }
    return { status: code && BAD_INPUT.includes(code) ? 400 : 502, body: { error: (e as Error).message } }
  }
}

async function readDirectory(token: { currency: string; issuer: string }) {
  try {
    const [info, look] = await Promise.all([tokenInfo(token), lookalikes(token)])
    return { source: DIRECTORY, info, lookalike: lookalikeNote(token.issuer, token.currency, look) }
  } catch (e) {
    return { source: DIRECTORY, error: (e as Error).message }
  }
}

export async function searchFromQuery(q: URLSearchParams): Promise<Reply> {
  const name = (q.get('q') ?? '').trim()
  if (!name) return { status: 400, body: { error: 'Add ?q= with a token name, like ?q=SOLO.' } }
  try {
    const r = await searchTokens(name, 20)
    return { status: 200, body: { source: DIRECTORY, count: r.count, tokens: r.tokens } }
  } catch (e) {
    return { status: 502, body: { error: (e as Error).message } }
  }
}
