// Testnet check: what can a holder still do after the issuer freezes or claws back?
// Usage: node freeze-test.mjs  (writes results.json)
import fs from 'node:fs'
import { Client } from 'xrpl'

const NET = 'wss://s.altnet.rippletest.net:51233'
const CUR = 'SCM'
const tfSetFreeze = 0x00100000
const tfClearFreeze = 0x00200000
const tfSell = 0x00080000
const tfIOC = 0x00020000
const asfDefaultRipple = 8
const asfGlobalFreeze = 7
const asfAllowTrustLineClawback = 16

const client = new Client(NET)
const results = []

async function submit(label, wallet, tx) {
  let result
  try {
    const res = await client.submitAndWait({ ...tx, Account: wallet.address }, { wallet, autofill: true })
    result = res.result.meta.TransactionResult
  } catch (e) {
    result = `ERROR: ${e.data?.engine_result ?? e.message}`
  }
  const holderScm = holder ? await scmBalance(holder.address) : null
  results.push({ label, result, holderScm })
  console.log(`${label.padEnd(48)} ${result.padEnd(22)} holder SCM=${holderScm}`)
  return result
}

async function scmBalance(addr) {
  const r = await client.request({ command: 'account_lines', account: addr, peer: issuer.address })
  return r.result.lines.find(l => l.currency === CUR)?.balance ?? '0'
}

const scm = v => ({ currency: CUR, issuer: issuer.address, value: String(v) })
const sellScm = v => ({ TransactionType: 'OfferCreate', TakerGets: scm(v), TakerPays: '1000', Flags: tfSell | tfIOC })
const buyScm = v => ({ TransactionType: 'OfferCreate', TakerGets: '1000000', TakerPays: scm(v), Flags: tfIOC })
const globalFreeze = on => ({ TransactionType: 'AccountSet', [on ? 'SetFlag' : 'ClearFlag']: asfGlobalFreeze })

let issuer, holder, lp, buyer

await client.connect()
console.log('Funding 4 wallets from faucet...')
issuer = (await client.fundWallet()).wallet
holder = (await client.fundWallet()).wallet
lp = (await client.fundWallet()).wallet
buyer = (await client.fundWallet()).wallet

// Setup. Clawback must be enabled before any trust line exists.
await submit('setup: issuer DefaultRipple', issuer, { TransactionType: 'AccountSet', SetFlag: asfDefaultRipple })
await submit('setup: issuer AllowTrustLineClawback', issuer, { TransactionType: 'AccountSet', SetFlag: asfAllowTrustLineClawback })
for (const w of [holder, lp, buyer]) {
  await submit('setup: TrustSet', w, { TransactionType: 'TrustSet', LimitAmount: scm(1e9) })
}
await submit('setup: issue 10000 SCM to holder', issuer, { TransactionType: 'Payment', Destination: holder.address, Amount: scm(10000) })
await submit('setup: issue 10000 SCM to lp', issuer, { TransactionType: 'Payment', Destination: lp.address, Amount: scm(10000) })

// A. Order book only (no AMM yet). Buyer posts a standing bid: 5 XRP for 500 SCM.
await submit('A0: buyer posts bid on order book', buyer, { TransactionType: 'OfferCreate', TakerGets: '5000000', TakerPays: scm(500) })
await submit('A1: holder sells 100 SCM into book (baseline)', holder, sellScm(100))
await submit('A2: issuer GLOBAL FREEZE on', issuer, globalFreeze(true))
await submit('A3: holder sells 100 SCM into book (frozen)', holder, sellScm(100))
await submit('A4: holder sends 10 SCM to buyer (frozen)', holder, { TransactionType: 'Payment', Destination: buyer.address, Amount: scm(10) })
await submit('A5: holder sends 10 SCM back to issuer (frozen)', holder, { TransactionType: 'Payment', Destination: issuer.address, Amount: scm(10) })
await submit('A6: issuer GLOBAL FREEZE off', issuer, globalFreeze(false))
const offers = (await client.request({ command: 'account_offers', account: buyer.address })).result.offers
for (const o of offers) await submit('A7: buyer cancels remaining bid', buyer, { TransactionType: 'OfferCancel', OfferSequence: o.seq })

// B. AMM. LP creates a 5000 SCM / 20 XRP pool.
await submit('B0: lp creates AMM 5000 SCM / 20 XRP', lp, { TransactionType: 'AMMCreate', Amount: scm(5000), Amount2: '20000000', TradingFee: 500 })
await submit('B1: holder sells 100 SCM into AMM (baseline)', holder, sellScm(100))
await submit('B2: issuer GLOBAL FREEZE on', issuer, globalFreeze(true))
await submit('B3: holder sells 100 SCM into AMM (frozen)', holder, sellScm(100))
await submit('B4: buyer buys SCM from AMM with 1 XRP (frozen)', buyer, buyScm(1))
await submit('B5: lp withdraws all from AMM (frozen)', lp, { TransactionType: 'AMMWithdraw', Asset: { currency: CUR, issuer: issuer.address }, Asset2: { currency: 'XRP' }, Flags: 0x00020000 })
await submit('B6: issuer GLOBAL FREEZE off', issuer, globalFreeze(false))

// C. Individual freeze on the holder's trust line only.
await submit('C0: issuer freezes holder trust line', issuer, { TransactionType: 'TrustSet', LimitAmount: { currency: CUR, issuer: holder.address, value: '0' }, Flags: tfSetFreeze })
await submit('C1: holder sells 100 SCM into AMM (line frozen)', holder, sellScm(100))
await submit('C2: buyer buys SCM from AMM (holder frozen only)', buyer, buyScm(1))
await submit('C3: issuer unfreezes holder trust line', issuer, { TransactionType: 'TrustSet', LimitAmount: { currency: CUR, issuer: holder.address, value: '0' }, Flags: tfClearFreeze })

// D. Clawback. Note: Amount.issuer is the HOLDER address.
await submit('D0: issuer claws back 1000 SCM from holder', issuer, { TransactionType: 'Clawback', Amount: { currency: CUR, issuer: holder.address, value: '1000' } })

// E. What a checker can read before buying.
const info = (await client.request({ command: 'account_info', account: issuer.address })).result
const amm = (await client.request({ command: 'amm_info', asset: { currency: CUR, issuer: issuer.address }, asset2: { currency: 'XRP' } })).result
const gb = (await client.request({ command: 'gateway_balances', account: issuer.address })).result
const readable = { issuerFlags: info.account_flags, amm: amm.amm, obligations: gb.obligations }
console.log(JSON.stringify(readable, null, 2))

const out = { network: NET, issuer: issuer.address, holder: holder.address, lp: lp.address, buyer: buyer.address, results, readable }
fs.writeFileSync('results.json', JSON.stringify(out, null, 2))
await client.disconnect()
