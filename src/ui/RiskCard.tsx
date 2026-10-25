import type { Check, Outcome } from '../engine/policy'
import type { Entry } from '../App'
import { TxRow } from './Evidence'
import { short } from './format'

const VERDICT: Record<Outcome, { icon: string; title: string; sub: string }> = {
  ALLOW: { icon: '✓', title: 'ALLOW', sub: 'Safe and small. The agent buys automatically.' },
  REQUIRE_APPROVAL: { icon: '⏸', title: 'NEEDS APPROVAL', sub: 'Some risk or a large amount. A human must say yes.' },
  DENY: { icon: '✕', title: 'DENY', sub: 'Blocked. This is final and cannot be approved.' },
}

const STATUS_ICON: Record<Check['status'], string> = { pass: '✓', warn: '!', fail: '✕' }

export function RiskCard({ entry, onApprove, onReject }: { entry: Entry; onApprove: () => void; onReject: () => void }) {
  const { req, decision, status } = entry
  const v = decision && VERDICT[decision.outcome]

  return (
    <section className="card">
      <div className="card-head">
        <div className="eyebrow-plain">Agent request</div>
        <h1>
          Buy {req.token.currency} with {req.amountXrp} XRP
        </h1>
        <div className="muted mono-sm">issuer {short(req.token.issuer)}</div>
      </div>

      {!decision ? (
        <div className="verdict pending">Checking the ledger…</div>
      ) : (
        <div className={`verdict ${decision.outcome}`}>
          <span className="verdict-icon">{v!.icon}</span>
          <div>
            <div className="verdict-title">{v!.title}</div>
            <div className="verdict-sub">{v!.sub}</div>
          </div>
        </div>
      )}

      {decision && (
        <table className="checks">
          <tbody>
            {decision.checks.map(c => (
              <tr key={c.id} className={c.status}>
                <td className="rule">{c.id}</td>
                <td className="check-label">{c.label}</td>
                <td className="check-detail">{c.detail}</td>
                <td className="check-status">{STATUS_ICON[c.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="card-foot">
        {status === 'awaiting' && (
          <div className="actions">
            <button className="primary" onClick={onApprove}>
              Approve and buy
            </button>
            <button onClick={onReject}>Reject</button>
            <span className="muted">Exit Guard re-checks the ledger right before buying.</span>
          </div>
        )}
        {status === 'executing' && <p className="muted">Sending to the ledger…</p>}
        {status === 'blocked' && <p className="final">DENY is final. There is no approve button. {entry.note}</p>}
        {status === 'rejected' && <p className="muted">You rejected this request. Nothing was sent.</p>}
        {status === 'bought' && <p className="ok-text">Bought. Proof is on the ledger:</p>}
        {status === 'failed' && <p className="final">The buy did not go through. {entry.note}</p>}
        {entry.txs.length > 0 && (
          <ul className="tx-list">
            {entry.txs.map((t, i) => (
              <TxRow key={(t.hash ?? t.label) + i} tx={t} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
