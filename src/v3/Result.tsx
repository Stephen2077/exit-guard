// The result: who decided what (Claude, Jev, the rules), the verdict, and the ledger values behind it.
import { useState } from 'react'
import type { Outcome } from '../engine/policy'
import { SIGN } from '../exit/words'
import { short } from '../ui/format'
import { Shark } from './Shark'
import type { AgentResult, Candidate, Step } from './types'

const ACTOR: Record<Step['actor'], string> = { parser: 'parser', claude: 'claude', jev: 'jev', rules: 'rules' }
const GLYPH = { pass: '✓', warn: '!', fail: '✕' } as const
const EXPLORER = { mainnet: 'https://livenet.xrpl.org', testnet: 'https://testnet.xrpl.org' }

// "████████░░ 0.82": confidence as a bar of 10 characters.
function Confidence({ value }: { value: number }) {
  const on = Math.round(value * 10)
  return (
    <span className="conf" role="img" aria-label={`confidence ${value.toFixed(2)}`}>
      <span className="conf-label">sure </span>
      <span className="conf-on">{'█'.repeat(on)}</span>
      <span className="conf-off">{'░'.repeat(10 - on)}</span> {value.toFixed(2)}
    </span>
  )
}

export function Pipeline({ steps, running }: { steps: Step[]; running?: number }) {
  return (
    <ol className="pipe">
      {steps.map((s, i) => {
        const state = running === undefined || i < running ? 'done' : i === running ? 'run' : 'wait'
        const outcome = s.actor === 'rules' && state === 'done' && s.result in SIGN ? (s.result as Outcome) : undefined
        return (
          <li key={i} className={`pipe-step ${state}`}>
            <div className="pipe-head">
              <span className="pipe-n">{String(i + 1).padStart(2, '0')}</span> {ACTOR[s.actor]}
              {s.actor === 'rules' && <span className="pipe-final">final say</span>}
            </div>
            <div className="pipe-task">{s.task}</div>
            <div className={`pipe-result ${outcome ? `o-${outcome}` : ''}`}>
              {state === 'run' ? <span className="spin">reading…</span> : state === 'wait' ? '—' : s.result}
            </div>
            {state === 'done' && s.confidence !== undefined && <Confidence value={s.confidence} />}
            {s.note && <div className="pipe-note">{s.note}</div>}
          </li>
        )
      })}
    </ol>
  )
}

// What the page can do next. Without handlers (the design preview), the buttons do nothing.
export type Handlers = { onAnother?: () => void; onBuy?: (xrp: number) => void; onPick?: (c: Candidate) => void }

function Action({ r, h }: { r: AgentResult; h: Handlers }) {
  // A person's answer to an approval. Exit Guard never buys on mainnet, so this only records the decision on the page.
  const [said, setSaid] = useState<'approved' | 'rejected' | null>(null)
  if (!r.outcome || !r.action) return null
  if (r.outcome === 'DENY')
    return (
      <div className="act">
        <p className="act-line">Final. No model can override a DENY, so there is no approve button.</p>
        <div className="act-row">
          <button className="ghost" onClick={h.onAnother}>
            Check another token
          </button>
        </div>
      </div>
    )
  if (r.outcome === 'REQUIRE_APPROVAL')
    return (
      <div className="act">
        <p className="act-line">
          {r.action.by === 'jev' && r.action.jevChoice && r.action.jevChoice !== r.action.choice ? (
            <>
              Jev leaned <b>{ACT[r.action.jevChoice]}</b> but was only {Math.round((r.action.confidence ?? 0) * 100)}% sure, so the agent asks a human. You decide.
            </>
          ) : (
            <>
              Jev's call for the agent: <b>{ACT[r.action.choice]}</b>
              {r.action.confidence !== undefined && <> ({Math.round(r.action.confidence * 100)}% sure)</>}. You decide.
            </>
          )}
        </p>
        {said ? (
          <p className="act-said" role="status">
            {said === 'approved' ? `Approved by you: the agent may buy ${r.amountXrp} XRP of ${r.token?.name}.` : 'Rejected by you: the agent will not buy.'}{' '}
            <button className="text" onClick={() => setSaid(null)}>
              Undo
            </button>
          </p>
        ) : (
          <div className="act-row">
            <button className="ghost" onClick={() => setSaid('approved')}>
              Approve {r.amountXrp} XRP
            </button>
            {r.maxSafeXrp !== null && r.maxSafeXrp > 0 && r.maxSafeXrp < r.amountXrp && (
              <button className="ghost" onClick={() => h.onBuy?.(Math.floor(r.maxSafeXrp! * 100) / 100)}>
                Check {fmt(r.maxSafeXrp)} XRP instead
              </button>
            )}
            <button className="text" onClick={() => setSaid('rejected')}>
              Reject
            </button>
          </div>
        )}
      </div>
    )
  return (
    <div className="act">
      <p className="act-line">The rules allow it, so the agent goes ahead without asking.</p>
      <div className="act-row">
        <CopyCall r={r} />
        <button className="text" onClick={h.onAnother}>
          Check another token
        </button>
      </div>
    </div>
  )
}

// The same request as a curl command, so a developer can repeat it from their agent.
function CopyCall({ r }: { r: AgentResult }) {
  const [done, setDone] = useState(false)
  const cmd = `curl -X POST ${location.origin}/api/agent -H 'Content-Type: application/json' -d '${JSON.stringify({ text: r.input })}'`
  return (
    <button
      className="ghost"
      onClick={() => navigator.clipboard?.writeText(cmd).then(() => setDone(true), () => setDone(false))}
    >
      {done ? 'Copied' : 'Copy API call'}
    </button>
  )
}

const ACT = { human: 'ask a human', continue: 'go ahead', abort: 'give up' } as const
const fmt = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: x < 10 ? 2 : 0 })

export function Verdict({ r, h = {} }: { r: AgentResult; h?: Handlers }) {
  if (!r.outcome || !r.token) return null
  const sign = SIGN[r.outcome]
  const reasons = r.checks.filter(c => (r.outcome === 'DENY' ? c.status === 'fail' : c.status !== 'pass'))
  const time = r.ledger ? new Date(r.ledger.time).toISOString().slice(11, 19) + ' UTC' : ''
  return (
    <section className={`verdict o-${r.outcome}`}>
      <div className="v-main">
        <div className="v-meta">
          <span className={`tag o-${r.outcome}`}>{r.outcome}</span>
          <span>{r.token.name}</span>
          <a href={`${EXPLORER[r.net]}/accounts/${r.token.issuer}`} target="_blank" rel="noreferrer">
            {short(r.token.issuer)}
          </a>
          <span>{r.amountXrp} XRP</span>
          <span>{r.net}</span>
          {time && <span>{time}</span>}
        </div>
        <div className="v-word-row">
          <h2 className="v-word">{sign.title}</h2>
          {r.outcome === 'DENY' && <Shark />}
        </div>
        <ul className="v-reasons">
          {reasons.slice(0, 3).map(c => (
            <li key={c.id} className={c.status}>
              <span className="g">{GLYPH[c.status]}</span> {c.detail}
            </li>
          ))}
          {reasons.length === 0 && <li className="pass">All 8 checks pass.</li>}
        </ul>
        {/* No "safe size" for a DENY: a smaller buy of a trap is still a trap. */}
        {r.maxSafeXrp !== null && r.outcome !== 'DENY' && (
          <p className="v-safe">
            Max safe buy: <b>{r.maxSafeXrp > 0 ? `${fmt(r.maxSafeXrp)} XRP` : 'none'}</b>
            <span> · keeps exit cost under 5%</span>
          </p>
        )}
        {r.event && (
          <p className="v-tx">
            <span className={r.event.result === 'tesSUCCESS' ? 'ok' : 'bad'}>{r.event.result}</span> {r.event.label} · ledger {r.event.ledger}{' '}
            {r.event.hash && (
              <a href={`${EXPLORER[r.net]}/transactions/${r.event.hash}`} target="_blank" rel="noreferrer">
                {short(r.event.hash)}
              </a>
            )}
          </p>
        )}
        <Action r={r} h={h} />
      </div>
      <div className="v-side">
        <h3>$ exit-guard check --rules 8</h3>
        <ul className="rules">
          {r.checks.map(c => (
            <li key={c.id} className={c.status} title={c.ledger}>
              <span className="g">[{GLYPH[c.status]}]</span>
              <span className="k">
                {c.id} {c.label.toLowerCase()}
              </span>
              <span className="dots" />
              <span className="v">{c.ledger}</span>
            </li>
          ))}
        </ul>
        {r.directory && (
          <p className="dir">
            Directory (xrplmeta.org, not ledger data): {r.directory.holders?.toLocaleString('en-US')} holders
            {r.directory.domain && <> · says {r.directory.domain}</>}
            {r.directory.trustLevel !== undefined && <> · trust {r.directory.trustLevel}/3</>}
          </p>
        )}
      </div>
    </section>
  )
}

export function Candidates({ list, onPick }: { list: Candidate[]; onPick?: (c: Candidate) => void }) {
  return (
    <section className="cands">
      <h2>Which one did you mean? Jev was not sure enough, so you pick.</h2>
      <ul>
        {list.map(c => (
          <li key={c.issuer}>
            <button className="cand" onClick={() => onPick?.(c)}>
              <span className="cand-name">{c.name}</span>
              <span className="cand-by">{c.issuerName ?? 'unknown issuer'} · {short(c.issuer)}</span>
              <span className="cand-meta">
                {c.holders?.toLocaleString('en-US')} holders{c.domain && <> · says {c.domain}</>} · trust {c.trustLevel ?? 0}/3
              </span>
              {c.probability !== undefined && <span className="cand-p">Jev {Math.round(c.probability * 100)}%</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
