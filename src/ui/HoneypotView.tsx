import type { TxRecord } from '../xrpl/client'
import { TxRow } from './Evidence'

export type Honeypot = { buy: TxRecord[]; freeze?: TxRecord; agentSell?: TxRecord; buyerBuy?: TxRecord; running: boolean; error?: string }

function Lane({ title, tx, okText, badText }: { title: string; tx?: TxRecord; okText: string; badText: string }) {
  const ok = tx?.result === 'tesSUCCESS'
  return (
    <div className={`lane ${tx ? (ok ? 'lane-ok' : 'lane-bad') : ''}`}>
      <div className="lane-title">{title}</div>
      <div className="lane-big">{tx ? (ok ? okText : badText) : '…'}</div>
      {tx && <ul className="tx-list"><TxRow tx={tx} /></ul>}
    </div>
  )
}

function TrustLine({ frozen }: { frozen: boolean }) {
  return (
    <div className={`trustline ${frozen ? 'frozen' : ''}`}>
      <span className="trustline-label">Agent's SCM holding</span>
      <span className="trustline-state">
        {frozen && (
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" />
            <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.8" fill="none" />
          </svg>
        )}
        {frozen ? 'Frozen · agent only' : 'Normal'}
      </span>
    </div>
  )
}

export function HoneypotView({ hp, onUnfreeze }: { hp: Honeypot; onUnfreeze: () => void }) {
  return (
    <section className="card">
      <div className="card-head">
        <div className="eyebrow-plain">What if the agent ignored Exit Guard?</div>
        <h1>Buyers can get in. The agent can't get out.</h1>
      </div>

      <ol className="steps">
        <li>
          The agent buys SCM with 2 XRP, skipping the check.
          {hp.buy.length > 0 && <ul className="tx-list">{hp.buy.map((t, i) => <TxRow key={i} tx={t} />)}</ul>}
        </li>
        <li>
          The SCM issuer freezes <b>only the agent's</b> SCM.
          <TrustLine frozen={hp.freeze?.result === 'tesSUCCESS'} />
          {hp.freeze && <ul className="tx-list"><TxRow tx={hp.freeze} /></ul>}
        </li>
        <li>Both try to trade at the same moment:</li>
      </ol>

      <div className="lanes">
        <Lane title="Agent sells all its SCM" tx={hp.agentSell} okText="Sold" badText="Can't sell" />
        <Lane title="New buyer buys SCM with 1 XRP" tx={hp.buyerBuy} okText="Can still buy" badText="Can't buy" />
      </div>

      {hp.error && <p className="final">{hp.error}</p>}
      {!hp.running && (
        <div className="actions">
          {hp.agentSell && <span>Exit Guard blocks this buy before it happens (see the new DENY on the left).</span>}
          <button onClick={onUnfreeze}>Unfreeze (reset)</button>
        </div>
      )}
    </section>
  )
}
