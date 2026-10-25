import { useEffect, useRef, useState } from 'react'
import { exitCost } from './engine/amm'
import { evaluate, type BuyRequest, type Decision, type Snapshot } from './engine/policy'
import { NETWORK, getClient, type TxRecord } from './xrpl/client'
import { buy, clearDemo, freezeHolder, loadDemo, sellAll, setupDemo, type Demo } from './xrpl/demo'
import { getSnapshot } from './xrpl/snapshot'
import { Evidence } from './ui/Evidence'
import { HoneypotView, type Honeypot } from './ui/HoneypotView'
import { RiskCard } from './ui/RiskCard'

type Status = 'checking' | 'executing' | 'awaiting' | 'bought' | 'blocked' | 'rejected' | 'failed'
export type Entry = {
  id: number
  time: string
  req: BuyRequest
  snapshot?: Snapshot
  decision?: Decision
  status: Status
  note?: string
  txs: TxRecord[]
}

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const OUTCOME_SHORT = { ALLOW: 'ALLOW', REQUIRE_APPROVAL: 'APPROVAL', DENY: 'DENY' } as const

export default function App() {
  const [demo, setDemo] = useState<Demo | null>(() => loadDemo())
  const [online, setOnline] = useState<boolean | null>(null)
  const [setupLog, setSetupLog] = useState<string[]>([])
  const [settingUp, setSettingUp] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [selected, setSelected] = useState<number | 'honeypot' | null>(null)
  const [txs, setTxs] = useState<TxRecord[]>([])
  const [hp, setHp] = useState<Honeypot | null>(null)
  const [flip, setFlip] = useState(false)
  const nextId = useRef(1)

  useEffect(() => {
    getClient().then(() => setOnline(true), () => setOnline(false))
  }, [])

  const patch = (id: number, p: Partial<Entry>) => setEntries(es => es.map(e => (e.id === id ? { ...e, ...p } : e)))
  const record = (list: TxRecord[]) => setTxs(t => [...[...list].reverse(), ...t])

  async function startSetup() {
    setSettingUp(true)
    setSetupLog([])
    try {
      setDemo(await setupDemo(msg => setSetupLog(l => [...l, msg])))
    } catch (e) {
      setSetupLog(l => [...l, `Setup failed: ${(e as Error).message}`])
    } finally {
      setSettingUp(false)
    }
  }

  async function execute(id: number, req: BuyRequest, snapshot: Snapshot) {
    patch(id, { status: 'executing' })
    // Accept at most 10% fewer tokens than the checked pool promised, so a pool change after the check cannot slip through.
    const minTokens = snapshot.pool ? exitCost(snapshot.pool, req.amountXrp).tokens * 0.9 : undefined
    const sent = await buy(demo!.agent, req.token, req.amountXrp, `Agent buys ${req.token.currency} (${req.amountXrp} XRP)`, minTokens)
    record(sent)
    const ok = sent[sent.length - 1].result === 'tesSUCCESS'
    patch(id, { status: ok ? 'bought' : 'failed', txs: sent })
  }

  async function check(req: BuyRequest, select = true): Promise<number> {
    const id = nextId.current++
    setEntries(es => [{ id, time: now(), req, status: 'checking', txs: [] }, ...es])
    if (select) setSelected(id)
    try {
      const snapshot = await getSnapshot(req.token, demo!.agent.address)
      const decision = evaluate(snapshot, req)
      patch(id, { snapshot, decision })
      if (decision.outcome === 'ALLOW') await execute(id, req, snapshot)
      else patch(id, { status: decision.outcome === 'DENY' ? 'blocked' : 'awaiting' })
    } catch (e) {
      patch(id, { status: 'failed', note: (e as Error).message })
    }
    return id
  }

  async function approve(e: Entry) {
    patch(e.id, { status: 'executing' })
    try {
      // Re-check right before buying: if the ledger changed for the worse, the approval no longer counts.
      const snapshot = await getSnapshot(e.req.token, demo!.agent.address)
      const decision = evaluate(snapshot, e.req)
      patch(e.id, { snapshot, decision })
      if (decision.outcome === 'DENY') return patch(e.id, { status: 'blocked', note: 'Re-checked before buying: conditions changed.' })
      await execute(e.id, e.req, snapshot)
    } catch (err) {
      patch(e.id, { status: 'failed', note: (err as Error).message })
    }
  }

  async function runHoneypot() {
    const d = demo!
    setSelected('honeypot')
    const state: Honeypot = { buy: [], running: true }
    setHp({ ...state })
    try {
      state.buy = await buy(d.agent, d.SCAM, 2, 'Agent buys SCM, no guard (2 XRP)')
      record(state.buy)
      setHp({ ...state })
      if (state.buy[state.buy.length - 1].result !== 'tesSUCCESS') throw new Error('The agent buy failed, so the demo stopped.')
      state.freeze = await freezeHolder(d.scamIssuer, d.agent.address, d.SCAM, true)
      record([state.freeze])
      setHp({ ...state })
      if (state.freeze.result !== 'tesSUCCESS') throw new Error('The freeze failed, so the demo stopped.')
      const [agentSell, buyerBuy] = await Promise.all([
        sellAll(d.agent, d.SCAM, 'Agent tries to sell all SCM'),
        buy(d.buyer, d.SCAM, 1, 'New buyer buys SCM (1 XRP)').then(r => r[r.length - 1]),
      ])
      Object.assign(state, { agentSell, buyerBuy, running: false })
      record([agentSell, buyerBuy])
      setHp({ ...state })
      // The one bold moment: the page goes dark for a beat when the trap closes.
      if (agentSell.result !== 'tesSUCCESS') {
        setFlip(true)
        setTimeout(() => setFlip(false), 2500)
      }
      await check({ token: d.SCAM, amountXrp: 2 }, false)
    } catch (e) {
      setHp({ ...state, running: false, error: (e as Error).message })
    }
  }

  async function unfreeze() {
    const t = await freezeHolder(demo!.scamIssuer, demo!.agent.address, demo!.SCAM, false)
    record([t])
    if (t.result !== 'tesSUCCESS') return setHp(h => h && { ...h, error: `Unfreeze failed: ${t.result}` })
    setHp(null)
    setSelected(entries[0]?.id ?? null)
  }

  function resetDemo() {
    clearDemo()
    setDemo(null)
    setEntries([])
    setTxs([])
    setHp(null)
    setSelected(null)
  }

  const current = typeof selected === 'number' ? entries.find(e => e.id === selected) : undefined
  const busy = settingUp || hp?.running || entries.some(e => e.status === 'checking' || e.status === 'executing')

  return (
    <div className={`app ${flip ? 'flip' : ''}`}>
      <header className="top">
        <div className="brand">Exit Guard</div>
        <div className="built-on">
          built on <img src="/brand/xrpl-tertiary-black.svg" alt="XRPL" height={20} />
        </div>
        <div className="tagline">Checks if an AI agent can sell a token before it buys it.</div>
        <div className="net">
          <span className={`dot ${online === null ? '' : online ? 'on' : 'off'}`} />
          XRPL testnet · {NETWORK.includes('quiknode') ? 'QuickNode' : 'public node'}
          {demo && (
            <button className="link" onClick={resetDemo} disabled={!!busy}>
              New demo wallets
            </button>
          )}
        </div>
      </header>

      <main className="grid">
        <aside className="col requests">
          <h2>Agent requests</h2>
          {demo && (
            <div className="presets">
              <button disabled={!!busy} onClick={() => check({ token: demo.GOOD, amountXrp: 2 })}>
                Buy GOD · 2 XRP
              </button>
              <button disabled={!!busy} onClick={() => check({ token: demo.GOOD, amountXrp: 8 })}>
                Buy GOD · 8 XRP
              </button>
              <button disabled={!!busy} onClick={() => check({ token: demo.SCAM, amountXrp: 2 })}>
                Buy SCM · 2 XRP
              </button>
              <button className="danger" disabled={!!busy || !!hp} onClick={runHoneypot}>
                What if the agent ignored Exit Guard?
              </button>
            </div>
          )}
          <ul className="feed">
            {hp && (
              <li className={selected === 'honeypot' ? 'sel' : ''} onClick={() => setSelected('honeypot')}>
                <span className="time">demo</span>
                <span className="what">No-guard demo</span>
                <span className={`chip ${hp.agentSell && hp.agentSell.result !== 'tesSUCCESS' ? 'DENY' : ''}`}>
                  {hp.running ? '…' : hp.agentSell && hp.agentSell.result !== 'tesSUCCESS' ? 'TRAPPED' : 'STOPPED'}
                </span>
              </li>
            )}
            {entries.map(e => (
              <li key={e.id} className={selected === e.id ? 'sel' : ''} onClick={() => setSelected(e.id)}>
                <span className="time">{e.time}</span>
                <span className="what">
                  {e.req.token.currency} · {e.req.amountXrp} XRP
                </span>
                {e.decision ? (
                  <span className={`chip ${e.decision.outcome}`}>{OUTCOME_SHORT[e.decision.outcome]}</span>
                ) : (
                  <span className="chip">…</span>
                )}
              </li>
            ))}
          </ul>
        </aside>

        <div className="col center">
          {!demo ? (
            <section className="card">
              <div className="card-head">
                <h1>Set up the demo</h1>
                <p className="muted">
                  Creates two tokens on the XRPL testnet. <b>GOD</b> is safe: the issuer gave up freezing, and an outside
                  wallet owns a deep pool. <b>SCM</b> is a trap: the issuer can claw back, takes 25% of every sale, owns
                  its own shallow pool, and one wallet holds most of the supply. Takes about a minute.
                </p>
              </div>
              <button className="primary" onClick={startSetup} disabled={settingUp || online === false}>
                {settingUp ? 'Setting up…' : 'Create demo tokens'}
              </button>
              {setupLog.length > 0 && (
                <ul className="log">
                  {setupLog.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
            </section>
          ) : selected === 'honeypot' && hp ? (
            <HoneypotView hp={hp} onUnfreeze={unfreeze} />
          ) : current ? (
            <RiskCard
              entry={current}
              busy={!!busy}
              onApprove={() => approve(current)}
              onReject={() => patch(current.id, { status: 'rejected' })}
            />
          ) : (
            <section className="card">
              <h1>Pick an agent request on the left</h1>
              <p className="muted">Exit Guard reads the ledger, runs eight fixed rules, and decides: allow, ask a human, or block.</p>
            </section>
          )}
        </div>

        <Evidence txs={txs} />
      </main>
    </div>
  )
}
