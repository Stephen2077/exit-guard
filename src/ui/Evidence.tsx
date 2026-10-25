import { EXPLORER, type TxRecord } from '../xrpl/client'

export function TxRow({ tx }: { tx: TxRecord }) {
  const ok = tx.result === 'tesSUCCESS'
  return (
    <li className="tx">
      <div className="tx-top">
        <span className="tx-label">{tx.label}</span>
        <span className={`tx-result ${ok ? 'ok' : 'bad'}`}>{tx.result}</span>
      </div>
      <div className="tx-meta">
        <span>{tx.type}</span>
        {tx.ledger && <span>ledger {tx.ledger}</span>}
        <span>{tx.validated ? 'validated ✓' : 'not validated'}</span>
      </div>
      {tx.hash && (
        <a className="mono hash" href={EXPLORER + tx.hash} target="_blank" rel="noreferrer">
          {tx.hash}
        </a>
      )}
    </li>
  )
}

export function Evidence({ txs }: { txs: TxRecord[] }) {
  return (
    <aside className="col evidence">
      <h2>On-chain evidence</h2>
      {txs.length === 0 ? (
        <p className="muted">Every transaction the agent or issuer sends shows up here, with a link to the testnet explorer.</p>
      ) : (
        <ul className="tx-list">
          {/* Keys count from the oldest receipt, so only a new receipt mounts (and feeds in). */}
          {txs.map((t, i) => (
            <TxRow key={t.hash ?? `${t.label}-${txs.length - i}`} tx={t} />
          ))}
        </ul>
      )}
    </aside>
  )
}
