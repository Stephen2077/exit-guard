import { exitCost } from '../engine/amm'
import { DEFAULT_POLICY, type Check, type Outcome } from '../engine/policy'
import type { Entry } from '../App'
import { TxRow } from './Evidence'
import { short } from './format'

// Small bar under the exit-cost row: how far this trade's exit cost is toward the approval and block lines.
const METER_MAX = 0.3
function ExitMeter({ cost, status }: { cost: number; status: Check['status'] }) {
  const at = (x: number) => `${Math.min(x / METER_MAX, 1) * 100}%`
  return (
    <div className="meter" aria-hidden="true">
      <div className={`meter-fill ${status}`} style={{ width: at(cost) }} />
      <div className="meter-mark" style={{ left: at(DEFAULT_POLICY.warnExitCost) }}>
        <span>ask {DEFAULT_POLICY.warnExitCost * 100}%</span>
      </div>
      <div className="meter-mark" style={{ left: at(DEFAULT_POLICY.maxExitCost) }}>
        <span>block {DEFAULT_POLICY.maxExitCost * 100}%</span>
      </div>
    </div>
  )
}

const VERDICT: Record<Outcome, { icon: string; title: string; sub: string }> = {
  ALLOW: { icon: '✓', title: 'ALLOW', sub: 'Safe and small. The agent buys automatically.' },
  REQUIRE_APPROVAL: { icon: '⏸', title: 'NEEDS APPROVAL', sub: 'Some risk or a large amount. A human must say yes.' },
  DENY: { icon: '✕', title: 'DENY', sub: 'Blocked. This is final and cannot be approved.' },
}

const STATUS_ICON: Record<Check['status'], string> = { pass: '✓', warn: '!', fail: '✕' }

type Props = { entry: Entry; busy: boolean; onApprove: () => void; onReject: () => void }

export function RiskCard({ entry, busy, onApprove, onReject }: Props) {
  const { req, decision, status, snapshot } = entry
  const v = decision && VERDICT[decision.outcome]
  const cost = snapshot?.pool ? exitCost(snapshot.pool, req.amountXrp).cost : null

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
                <td className="check-detail">
                  {c.detail}
                  {c.id === 'R5' && cost !== null && Number.isFinite(cost) && <ExitMeter cost={cost} status={c.status} />}
                </td>
                <td className="check-status">{STATUS_ICON[c.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="card-foot">
        {status === 'awaiting' && (
          <div className="actions">
            <button className="primary" onClick={onApprove} disabled={busy}>
              Approve and buy
            </button>
            <button onClick={onReject} disabled={busy}>
              Reject
            </button>
            <span className="muted">
              {busy ? 'Wait for the current transaction to finish.' : 'Exit Guard re-checks the ledger right before buying.'}
            </span>
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
