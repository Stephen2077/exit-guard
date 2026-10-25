// Testnet demo world: two tokens (GOD = safe, SCM = scam), an agent wallet and an outside buyer.
// Seeds are testnet-only and kept in localStorage so a page reload does not re-run setup.
import { Wallet } from 'xrpl'
import type { Token } from '../engine/policy'
import { getClient, mustSend, send, type TxRecord } from './client'
import { tokenBalance } from './snapshot'

const asfNoFreeze = 6
const asfDefaultRipple = 8
const asfAllowTrustLineClawback = 16
const tfSell = 0x00080000
const tfImmediateOrCancel = 0x00020000
const tfSetFreeze = 0x00100000
const tfClearFreeze = 0x00200000

export type Demo = { goodIssuer: Wallet; scamIssuer: Wallet; agent: Wallet; buyer: Wallet; GOOD: Token; SCAM: Token }

const KEY = 'exit-guard-demo-v1'

export function loadDemo(): Demo | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return s ? build(s) : null
  } catch {
    return null
  }
}

export function clearDemo() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // storage blocked: nothing to clear
  }
}

function build(seeds: Record<'goodIssuer' | 'scamIssuer' | 'agent' | 'buyer', string>): Demo {
  const w = (k: keyof typeof seeds) => Wallet.fromSeed(seeds[k])
  const goodIssuer = w('goodIssuer')
  const scamIssuer = w('scamIssuer')
  return {
    goodIssuer,
    scamIssuer,
    agent: w('agent'),
    buyer: w('buyer'),
    GOOD: { currency: 'GOD', issuer: goodIssuer.address },
    SCAM: { currency: 'SCM', issuer: scamIssuer.address },
  }
}

const amt = (t: Token, v: number | string) => ({ currency: t.currency, issuer: t.issuer, value: String(v) })

// xrpl.js fundWallet() fails in the browser, so call the testnet faucet directly and wait for the account.
async function fundFromFaucet(): Promise<Wallet> {
  const wallet = Wallet.generate()
  const ask = () =>
    fetch('https://faucet.altnet.rippletest.net/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: wallet.address }),
    })
  // The faucet rejects bursts (and the rejection has no CORS header, so it shows as "Failed to fetch").
  const res = await ask().catch(() => new Promise(r => setTimeout(r, 3000)).then(ask))
  if (!res.ok) throw new Error(`Faucet returned ${res.status}`)
  const c = await getClient()
  for (let i = 0; i < 20; i++) {
    try {
      await c.request({ command: 'account_info', account: wallet.address, ledger_index: 'validated' })
      return wallet
    } catch {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  throw new Error('Faucet account did not appear on the ledger')
}

export async function setupDemo(log: (msg: string) => void): Promise<Demo> {
  log('Getting 4 testnet wallets from the faucet...')
  const funded: Wallet[] = []
  for (let i = 0; i < 4; i++) {
    funded.push(await fundFromFaucet())
    log(`Wallet ${i + 1} of 4 funded.`)
  }
  const [goodIssuer, scamIssuer, agent, buyer] = funded
  const demo = build({ goodIssuer: goodIssuer.seed!, scamIssuer: scamIssuer.seed!, agent: agent.seed!, buyer: buyer.seed! })
  const { GOOD, SCAM } = demo

  log('GOD issuer: gives up freezing forever, opens a deep pool (50 XRP)...')
  await mustSend('GOD issuer: DefaultRipple', goodIssuer, { TransactionType: 'AccountSet', SetFlag: asfDefaultRipple })
  await mustSend('GOD issuer: NoFreeze', goodIssuer, { TransactionType: 'AccountSet', SetFlag: asfNoFreeze })
  await mustSend('GOD pool', goodIssuer, { TransactionType: 'AMMCreate', Amount: amt(GOOD, 50000), Amount2: '50000000', TradingFee: 500 })

  // Clawback must be switched on before any trust line exists (the pool creates one).
  log('SCM issuer: turns on clawback, opens a shallow pool (5 XRP), gives a whale most of the supply...')
  await mustSend('SCM issuer: DefaultRipple', scamIssuer, { TransactionType: 'AccountSet', SetFlag: asfDefaultRipple })
  await mustSend('SCM issuer: Clawback on', scamIssuer, { TransactionType: 'AccountSet', SetFlag: asfAllowTrustLineClawback })
  await mustSend('SCM pool', scamIssuer, { TransactionType: 'AMMCreate', Amount: amt(SCAM, 5000), Amount2: '5000000', TradingFee: 500 })
  await mustSend('Buyer trusts SCM', buyer, { TransactionType: 'TrustSet', LimitAmount: amt(SCAM, 1e9) })
  await mustSend('SCM whale', scamIssuer, { TransactionType: 'Payment', Destination: buyer.address, Amount: amt(SCAM, 50000) })

  try {
    localStorage.setItem(KEY, JSON.stringify({ goodIssuer: goodIssuer.seed, scamIssuer: scamIssuer.seed, agent: agent.seed, buyer: buyer.seed }))
  } catch {
    // storage blocked: demo still works until reload
  }
  log('Demo ready.')
  return demo
}

async function ensureTrust(wallet: Wallet, token: Token): Promise<TxRecord[]> {
  const c = await getClient()
  const r = await c.request({ command: 'account_lines', account: wallet.address, peer: token.issuer, ledger_index: 'validated' })
  if (r.result.lines.some(l => l.currency === token.currency)) return []
  return [await send(`Trust ${token.currency}`, wallet, { TransactionType: 'TrustSet', LimitAmount: amt(token, 1e9) })]
}

// Spend exactly `xrp` on the token at whatever the pool gives (the guard already priced it).
export async function buy(wallet: Wallet, token: Token, xrp: number, label: string): Promise<TxRecord[]> {
  const trust = await ensureTrust(wallet, token)
  const offer = await send(label, wallet, {
    TransactionType: 'OfferCreate',
    TakerGets: String(Math.round(xrp * 1e6)),
    TakerPays: amt(token, '0.000001'),
    Flags: tfSell | tfImmediateOrCancel,
  })
  return [...trust, offer]
}

export async function sellAll(wallet: Wallet, token: Token, label: string): Promise<TxRecord> {
  const bal = await tokenBalance(wallet.address, token)
  return send(label, wallet, {
    TransactionType: 'OfferCreate',
    TakerGets: amt(token, bal),
    TakerPays: '1',
    Flags: tfSell | tfImmediateOrCancel,
  })
}

export function freezeHolder(issuer: Wallet, holder: string, token: Token, on: boolean): Promise<TxRecord> {
  return send(on ? `Issuer freezes agent's ${token.currency}` : `Issuer unfreezes agent's ${token.currency}`, issuer, {
    TransactionType: 'TrustSet',
    LimitAmount: { currency: token.currency, issuer: holder, value: '0' },
    Flags: on ? tfSetFreeze : tfClearFreeze,
  })
}
