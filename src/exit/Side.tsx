import type { CSSProperties } from 'react'
import { exitCost } from '../engine/amm'
import { DEFAULT_POLICY, type BuyRequest, type Check, type Snapshot } from '../engine/policy'
import { EXPLORER, type TxRecord } from '../xrpl/client'
import { safeIcon } from '../xrpl/directory'
import { currencyName } from '../xrpl/token'
import { GLYPH, fresh } from './Sign'
import type { Entry, Trap } from './useExitGuard'
import { QUESTIONS, SIGN, answerLine, claimedDomain, evidence, lookalikeNote, num, pct, resultWords, searchNote } from './words'

export function Questions({ e, empty }: { e?: Entry; empty: string }) {
  if (!e?.decision || !e.snapshot) {
    return (
      <section className="qs">
        <h2>Five questions · 8 checks</h2>
        <p className="muted">{empty}</p>
      </section>
    )
  }
  const s = e.snapshot
  const byId = new Map(e.decision.checks.map(c => [c.id, c]))
  let n = 0
  return (
    <section className={`qs ${fresh(e.decidedAt) ? 'fresh' : ''}`}>
      <h2>Five questions · 8 checks</h2>
      {QUESTIONS.map(q => (
        <div className="q" key={q.title}>
          <h3>{q.title}</h3>
          {q.ids
            .map(id => byId.get(id))
            .filter((c): c is Check => !!c)
            .map(c => (
              <div className="a" key={c.id} style={{ '--i': n++ } as CSSProperties}>
                <span className={`st ${c.status}`}>{GLYPH[c.status]}</span>
                <p>
                  {answerLine(c, s, e.req)}
                  {c.id === 'R5' && <ExitMeter s={s} req={e.req} status={c.status} />}
                  <span className="ev">{evidence(c.id, s, !!e.wallet)}</span>
                </p>
              </div>
            ))}
        </div>
      ))}
    </section>
  )
}

// Where this trade's exit cost sits against the approval and block lines (scale 0-30%).
const METER_MAX = 0.3
function ExitMeter({ s, req, status }: { s: Snapshot; req: BuyRequest; status: Check['status'] }) {
  if (!s.pool) return null
  const { cost } = exitCost(s.pool, req.amountXrp)
  if (!Number.isFinite(cost)) return null
  const at = (x: number) => `${Math.min(x / METER_MAX, 1) * 100}%`
  return (
    <span className="meter" aria-hidden="true">
      <i className={status} style={{ width: at(cost) }} />
      <span className="mark" style={{ left: at(DEFAULT_POLICY.warnExitCost) }} data-l={`approval ${pct(DEFAULT_POLICY.warnExitCost)}`} />
      <span className="mark" style={{ left: at(DEFAULT_POLICY.maxExitCost) }} data-l={`block ${pct(DEFAULT_POLICY.maxExitCost)}`} />
    </span>
  )
}

const TAG_CLASS = { ALLOW: 'allow', REQUIRE_APPROVAL: 'ask', DENY: 'deny' } as const

// The demo's history: every agent request and the no-guard run.
export function Recent({
  entries,
  currentId,
  onPick,
  trap,
}: {
  entries: Entry[]
  currentId?: number
  onPick: (id: number) => void
  trap?: { trap: Trap; selected: boolean; onPick: () => void }
}) {
  if (!entries.length && !trap) return null
  const shut = trap?.trap.agentSell && trap.trap.agentSell.result !== 'tesSUCCESS'
  return (
    <section className="recent">
      <h2>Recent</h2>
      <ul>
        {trap && (
          <li>
            <button className={trap.selected ? 'sel' : ''} onClick={trap.onPick}>
              <span className="time">no guard</span>
              <span className="what">The trap · SCM</span>
              <span className={`tag ${shut ? 'deny' : ''}`}>{trap.trap.running ? '…' : shut ? 'TRAPPED' : 'STOPPED'}</span>
            </button>
          </li>
        )}
        {entries.map(e => {
          const name = currencyName(e.req.token.currency)
          return (
            <li key={e.id}>
              <button
                className={currentId === e.id ? 'sel' : ''}
                onClick={() => onPick(e.id)}
                aria-label={`${e.time}, ${name}, ${e.decision ? SIGN[e.decision.outcome].title : e.status === 'failed' ? 'error' : 'reading'}`}
              >
                <span className="time">{e.time}</span>
                <span className="what">
                  Agent · {name} · {e.req.amountXrp} XRP
                </span>
                <span className={`tag ${e.decision ? TAG_CLASS[e.decision.outcome] : ''}`}>
                  {e.decision ? SIGN[e.decision.outcome].tag : e.status === 'failed' ? 'ERROR' : '…'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function Receipts({ txs }: { txs: TxRecord[] }) {
  return (
    <section className="receipts">
      <h2>Ledger receipts</h2>
      {txs.length === 0 ? (
        <p className="muted">Every transaction the demo sends shows up here, with a link to the testnet explorer.</p>
      ) : (
        <ol>
          {/* Keys count from the oldest receipt, so only a new receipt mounts (and feeds in). */}
          {txs.map((t, i) => {
            const w = resultWords(t.result)
            return (
              <li key={t.hash ?? `${t.label}-${txs.length - i}`}>
                <b>{t.label}</b>
                <span className={`res ${w.ok ? 'ok' : 'bad'}`}>{w.text}</span>
                <span className="m">
                  {t.type}
                  {t.ledger ? ` · ledger ${t.ledger}` : ''}
                  {!w.ok && ` · ${t.result}`}
                  {!t.validated && ' · not validated'}
                  {t.hash && (
                    <>
                      <br />
                      <a href={EXPLORER + t.hash} target="_blank" rel="noreferrer">
                        {t.hash.slice(0, 8)}…{t.hash.slice(-8)}
                      </a>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

const whole = (x?: number) => (x === undefined ? '—' : num(x))
// Supply and volume can be huge: 100,000,000,000 reads better as 100B.
const compact = (x?: number) => (x === undefined ? '—' : x.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 }))
const price = (x?: number) => (x === undefined ? '—' : x.toLocaleString('en-US', { maximumSignificantDigits: 3 }))

// What the token directory says about this token: who issues it, how many hold it, and whether others copy its code.
export function TokenFacts({ e }: { e: Entry }) {
  if (e.net !== 'mainnet') return null
  const d = e.dir
  const picked = e.searched && searchNote(e.searched.q, e.searched.top, e.req.token, e.searched.holders)
  const look = d && 'look' in d ? lookalikeNote(e.req.token.issuer, e.req.token.currency, d.look) : null
  const i = d && 'info' in d ? d.info : null
  const icon = safeIcon(i?.icon)
  return (
    <section className="facts">
      <h2>Token directory</h2>
      {picked && (
        <p className="warnbox" role="alert">
          <span className="st warn">!</span>
          {picked}
        </p>
      )}
      {look?.warn && (
        <p className="warnbox" role="alert">
          <span className="st warn">!</span>
          {look.text}
        </p>
      )}
      {!d && <p className="muted">Looking up names, holders and prices…</p>}
      {d && 'error' in d && <p className="muted">Could not reach the directory: {d.error}</p>}
      {d && !('error' in d) && !i && <p className="muted">This token is not in the directory.</p>}
      {i && (
        <>
          <div className="facts-head">
            {icon ? <img src={icon} alt="" width={32} height={32} referrerPolicy="no-referrer" /> : <span className="noicon" />}
            <div className="facts-who">
              <b>{i.name}</b> <span className="mono muted">{currencyName(i.currency)}</span>
              <span className="who">
                {i.issuerName ?? 'Issuer has no name in the directory'}
                {i.domain && ` · ${claimedDomain(i.domain)}`}
                {i.kyc && ' · KYC'}
                {i.trustLevel !== undefined && ` · trust level ${i.trustLevel} of 3`}
              </span>
            </div>
          </div>
          <dl className="strip">
            <div>
              <dt>Holders</dt>
              <dd>{whole(i.holders)}</dd>
            </div>
            <div>
              <dt>Price (XRP)</dt>
              <dd>{price(i.priceXrp)}</dd>
            </div>
            <div>
              <dt>24h volume (XRP)</dt>
              <dd>{compact(i.volume24hXrp)}</dd>
            </div>
            <div>
              <dt>Supply</dt>
              <dd>{compact(i.supply)}</dd>
            </div>
          </dl>
        </>
      )}
      {look && !look.warn && <p className="note">{look.text}</p>}
      <p className="note">From xrplmeta.org, not read from the ledger. It does not change the verdict.</p>
    </section>
  )
}
