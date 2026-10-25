// State and actions for Exit Guard: token checks (the tool) and the agent demo (testnet only).
import { useEffect, useRef, useState } from 'react'
import { exitCost } from '../engine/amm'
import { evaluate, type BuyRequest, type Decision, type Snapshot, type Token } from '../engine/policy'
import { getClient, type Net, type TxRecord } from '../xrpl/client'
import { buy, clearDemo, freezeHolder, loadDemo, sellAll, setupDemo, type Demo } from '../xrpl/demo'
import { UI_TIMEOUT_MS, lookalikes, tokenInfo, type DirToken, type Lookalikes } from '../xrpl/directory'
import { getSnapshot } from '../xrpl/snapshot'

export type Station = 'setup' | 'safe' | 'big' | 'scam' | 'trap' | 'reset'
export type Status = 'checking' | 'checked' | 'executing' | 'awaiting' | 'bought' | 'blocked' | 'rejected' | 'failed'
// Directory facts for a mainnet check: never part of the verdict.
export type DirFacts = { info: DirToken | null; look: Lookalikes } | { error: string }
export type Entry = {
  id: number
  time: string
  mode: 'agent' | 'check'
  net: Net
  wallet: string | null // the wallet whose own freeze state was read (the demo agent), if any
  station?: Station
  req: BuyRequest
  snapshot?: Snapshot
  decision?: Decision
  decidedAt?: number // when the first verdict arrived: motion plays only then
  status: Status
  note?: string
  dir?: DirFacts
  searched?: Searched // the name search this token was picked from, if any
  txs: TxRecord[]
}
export type Searched = { q: string; top: DirToken; holders?: number }
// What is typed in the search bar. Kept here, not in the page, so switching pages does not lose it.
export type Found = { q: string; count: number; tokens: DirToken[] }
export type SearchState = { q: string; amount: string; manual: boolean; issuer: string; net: Net; found: Found | null }
const EMPTY_SEARCH: SearchState = { q: '', amount: '2', manual: false, issuer: '', net: 'mainnet', found: null }
export type Trap = { buy: TxRecord[]; freeze?: TxRecord; agentSell?: TxRecord; buyerBuy?: TxRecord; running: boolean; closedAt?: number; error?: string }
export type DemoView = { kind: 'entry'; id: number } | { kind: 'trap' } | null
export type Guard = ReturnType<typeof useExitGuard>

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const message = (e: unknown) => (e as Error).message

function readError(e: unknown, net: Net): string {
  if ((e as { data?: { error?: string } }).data?.error === 'actNotFound') return `There is no account at this issuer address on ${net}.`
  return message(e)
}

export function useExitGuard() {
  const [demo, setDemo] = useState<Demo | null>(() => loadDemo())
  const [online, setOnline] = useState<boolean | null>(null)
  const [setupLog, setSetupLog] = useState<string[]>([])
  const [settingUp, setSettingUp] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [checkId, setCheckId] = useState<number | null>(null)
  const [search, setSearchState] = useState<SearchState>(EMPTY_SEARCH)
  const [demoView, setDemoView] = useState<DemoView>(null)
  const [txs, setTxs] = useState<TxRecord[]>([])
  const [trap, setTrap] = useState<Trap | null>(null)
  const [done, setDone] = useState<Set<Station>>(() => new Set(demo ? ['setup'] : []))
  const nextId = useRef(1)
  // Token checks whose ledger read is on its way: check key → entry id. A ref, so a second Enter before the next render sees it.
  const reading = useRef(new Map<string, number>())

  useEffect(() => {
    getClient().then(() => setOnline(true), () => setOnline(false))
  }, [])

  const patch = (id: number, p: Partial<Entry>) => setEntries(es => es.map(e => (e.id === id ? { ...e, ...p } : e)))
  const setSearch = (p: Partial<SearchState>) => setSearchState(s => ({ ...s, ...p }))

  // Home: an empty search and no result on screen. The amount and the demo stay as they are.
  function goHome() {
    setSearchState(s => ({ ...EMPTY_SEARCH, amount: s.amount }))
    setCheckId(null)
  }
  const record = (list: TxRecord[]) => setTxs(t => [...[...list].reverse(), ...t])
  const markDone = (s: Station) => setDone(d => new Set(d).add(s))

  function add(e: Omit<Entry, 'id' | 'time' | 'txs'>, select: boolean): number {
    const id = nextId.current++
    setEntries(es => [{ ...e, id, time: now(), txs: [] }, ...es])
    if (select && e.mode === 'check') setCheckId(id)
    if (select && e.mode === 'agent') setDemoView({ kind: 'entry', id })
    return id
  }

  async function startSetup() {
    setSettingUp(true)
    setSetupLog([])
    try {
      setDemo(await setupDemo(msg => setSetupLog(l => [...l, msg])))
      markDone('setup')
    } catch (e) {
      setSetupLog(l => [...l, `Setup failed: ${message(e)}`])
    } finally {
      setSettingUp(false)
    }
  }

  async function execute(id: number, req: BuyRequest, snapshot: Snapshot, net: Net) {
    // Buying happens on testnet only. Mainnet is read-only in this app.
    if (net !== 'testnet') throw new Error('Exit Guard only buys on testnet.')
    patch(id, { status: 'executing' })
    // Accept at most 10% fewer tokens than the checked pool promised, so a pool change after the check cannot slip through.
    const minTokens = snapshot.pool ? exitCost(snapshot.pool, req.amountXrp).tokens * 0.9 : undefined
    const sent = await buy(demo!.agent, req.token, req.amountXrp, `Agent buys ${req.token.currency} with ${req.amountXrp} XRP`, minTokens)
    record(sent)
    const ok = sent[sent.length - 1].result === 'tesSUCCESS'
    patch(id, { status: ok ? 'bought' : 'failed', txs: sent })
  }

  // The agent asks to buy: check, then buy at once on ALLOW, wait for a human on NEEDS APPROVAL, stop on DENY.
  async function agentBuy(req: BuyRequest, station?: Station, select = true) {
    const wallet = demo!.agent.address
    const id = add({ mode: 'agent', net: 'testnet', wallet, station, req, status: 'checking' }, select)
    try {
      const snapshot = await getSnapshot(req.token, wallet)
      const decision = evaluate(snapshot, req)
      patch(id, { snapshot, decision, decidedAt: Date.now() })
      if (station) markDone(station)
      if (decision.outcome === 'ALLOW') await execute(id, req, snapshot, 'testnet')
      else patch(id, { status: decision.outcome === 'DENY' ? 'blocked' : 'awaiting' })
    } catch (e) {
      patch(id, { status: 'failed', note: message(e) })
    }
  }

  async function loadDirectory(id: number, token: Token) {
    try {
      const [info, look] = await Promise.all([tokenInfo(token, UI_TIMEOUT_MS), lookalikes(token, UI_TIMEOUT_MS)])
      patch(id, { dir: { info, look } })
    } catch (e) {
      const slow = (e as Error).name === 'TimeoutError'
      patch(id, { dir: { error: slow ? `no answer in ${UI_TIMEOUT_MS / 1000} s` : message(e) } })
    }
  }

  // Check any token on either network. Read-only: it never buys.
  async function checkToken(req: BuyRequest, net: Net, searched?: Searched) {
    // The same check already on its way (a double Enter): show it instead of reading the ledger twice.
    const key = `${net}|${req.token.currency}|${req.token.issuer}|${req.amountXrp}`
    const same = reading.current.get(key)
    if (same !== undefined) return setCheckId(same)
    // The demo agent only exists on testnet. On mainnet there is no wallet of ours to look at.
    const wallet = net === 'testnet' ? (demo?.agent.address ?? null) : null
    const id = add({ mode: 'check', net, wallet, req, searched, status: 'checking' }, true)
    reading.current.set(key, id)
    // Directory facts (mainnet only) load next to the ledger read. They never change the verdict.
    if (net === 'mainnet') void loadDirectory(id, req.token)
    try {
      const snapshot = await getSnapshot(req.token, wallet, net)
      patch(id, { snapshot, decision: evaluate(snapshot, req), decidedAt: Date.now(), status: 'checked' })
    } catch (e) {
      patch(id, { status: 'failed', note: readError(e, net) })
    } finally {
      reading.current.delete(key)
    }
  }

  // Try a read again after it failed. Never repeats a buy.
  function retry(e: Entry) {
    if (e.mode === 'check') return void checkToken(e.req, e.net, e.searched)
    void agentBuy(e.req, e.station)
  }

  async function approve(e: Entry) {
    patch(e.id, { status: 'executing' })
    try {
      // Re-check right before buying: if the ledger changed for the worse, the approval no longer counts.
      const snapshot = await getSnapshot(e.req.token, e.wallet, e.net)
      const decision = evaluate(snapshot, e.req)
      patch(e.id, { snapshot, decision })
      if (decision.outcome === 'DENY') return patch(e.id, { status: 'blocked', note: 'Re-checked before buying: conditions changed.' })
      await execute(e.id, e.req, snapshot, e.net)
    } catch (err) {
      patch(e.id, { status: 'failed', note: message(err) })
    }
  }

  const reject = (e: Entry) => patch(e.id, { status: 'rejected' })

  // The no-guard demo: the agent buys SCM without a check, the issuer freezes only the agent,
  // then the agent tries to sell while a new buyer buys, at the same moment.
  async function runTrap() {
    const d = demo!
    setDemoView({ kind: 'trap' })
    const state: Trap = { buy: [], running: true }
    setTrap({ ...state })
    try {
      state.buy = await buy(d.agent, d.SCAM, 2, 'Agent buys SCM with 2 XRP, no check')
      record(state.buy)
      setTrap({ ...state })
      if (state.buy[state.buy.length - 1].result !== 'tesSUCCESS') throw new Error('The agent buy failed, so the demo stopped.')
      state.freeze = await freezeHolder(d.scamIssuer, d.agent.address, d.SCAM, true)
      record([state.freeze])
      setTrap({ ...state })
      if (state.freeze.result !== 'tesSUCCESS') throw new Error('The freeze failed, so the demo stopped.')
      const [agentSell, buyerBuy] = await Promise.all([
        sellAll(d.agent, d.SCAM, 'Agent sells all its SCM'),
        buy(d.buyer, d.SCAM, 1, 'New buyer buys SCM with 1 XRP').then(r => r[r.length - 1]),
      ])
      Object.assign(state, { agentSell, buyerBuy, running: false, closedAt: Date.now() })
      record([agentSell, buyerBuy])
      setTrap({ ...state })
      markDone('trap')
      // What Exit Guard says about SCM now: the agent's own holding is frozen.
      await agentBuy({ token: d.SCAM, amountXrp: 2 }, undefined, false)
    } catch (e) {
      setTrap({ ...state, running: false, error: message(e) })
    }
  }

  // Unfreeze the agent and start a new run with the same wallets.
  async function resetTrap() {
    setTrap(t => t && { ...t, running: true, error: undefined })
    try {
      const t = await freezeHolder(demo!.scamIssuer, demo!.agent.address, demo!.SCAM, false)
      record([t])
      // tecNO_LINE_REDUNDANT: the agent never held SCM, so there is nothing to unfreeze.
      if (t.result !== 'tesSUCCESS' && t.result !== 'tecNO_LINE_REDUNDANT') throw new Error(`Unfreeze failed: ${t.result}`)
      setTrap(null)
      setDemoView(null)
      setDone(new Set(['setup']))
    } catch (e) {
      setTrap(h => h && { ...h, running: false, error: message(e) })
    }
  }

  function run(s: Station) {
    if (s === 'setup') return void startSetup()
    const d = demo
    if (!d) return
    if (s === 'safe') return void agentBuy({ token: d.GOOD, amountXrp: 2 }, 'safe')
    if (s === 'big') return void agentBuy({ token: d.GOOD, amountXrp: 8 }, 'big')
    if (s === 'scam') return void agentBuy({ token: d.SCAM, amountXrp: 2 }, 'scam')
    // One trap at a time: a second run would buy into a frozen line.
    if (s === 'trap') return void (trap ? undefined : runTrap())
    void resetTrap()
  }

  function newWallets() {
    clearDemo()
    setDemo(null)
    // Keep mainnet checks. Testnet checks read the old demo wallet, so they go with it.
    setEntries(es => es.filter(e => e.mode === 'check' && e.net === 'mainnet'))
    setTxs([])
    setTrap(null)
    setDemoView(null)
    setSetupLog([])
    setDone(new Set())
  }

  const checkEntries = entries.filter(e => e.mode === 'check')
  const demoEntries = entries.filter(e => e.mode === 'agent')
  const checkEntry = entries.find(e => e.id === checkId)
  const demoEntry = demoView?.kind === 'entry' ? entries.find(e => e.id === demoView.id) : undefined
  const here: Station | undefined = demoView?.kind === 'trap' ? 'trap' : demoEntry?.station
  const demoBusy = settingUp || !!trap?.running || demoEntries.some(e => e.status === 'checking' || e.status === 'executing')
  const checking = checkEntries.some(e => e.status === 'checking')

  return {
    demo,
    online,
    setupLog,
    settingUp,
    entries,
    checkEntries,
    demoEntries,
    checkEntry,
    setCheckId,
    search,
    setSearch,
    goHome,
    demoEntry,
    demoView,
    setDemoView,
    txs,
    trap,
    done,
    here,
    demoBusy,
    checking,
    run,
    checkToken,
    retry,
    approve,
    reject,
    newWallets,
  }
}
