import type { CSSProperties } from 'react'
import { exitCost, roundTripQuote } from '../engine/amm'
import { DEFAULT_POLICY, type BuyRequest, type Check, type Snapshot } from '../engine/policy'
import { short } from '../ui/format'
import { EXPLORER, EXPLORER_HOST, type TxRecord } from '../xrpl/client'
import { safeIcon } from '../xrpl/directory'
import { currencyName } from '../xrpl/token'
import { GLYPH, fresh } from './Sign'
import type { Entry, Trap } from './useExitGuard'
import { LIMITS, QUESTIONS, SIGN, answerLine, claimedDomain, evidence, lookalikeNote, num, pct, resultWords, searchNote } from './words'

export function QueryEvidence({ e }: { e: Entry }) {
  const s = e.snapshot!
  const data = s.evidence
  const frozen = s.poolFrozen || s.globalFreeze || s.myLineFrozen === true
  const quote = s.pool && !frozen ? roundTripQuote(s.pool, e.req.amountXrp) : null
  const precise = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 6 })
  return (
    <section className="qs query-evidence">
      <h2>Ledger evidence</h2>
      <p><b>{currencyName(e.req.token.currency)}</b> · {e.net} · {e.req.amountXrp} XRP</p>
      <p className="mono wrap">Issuer: {e.req.token.issuer}</p>
      {data && <p>Ledger <a href={`${EXPLORER_HOST[e.net]}/ledgers/${data.ledgerIndex}`} target="_blank" rel="noreferrer">{data.ledgerIndex}</a> · validated · {new Date(data.queriedAt).toLocaleString()}</p>}
      <p>{!e.wallet ? 'No wallet provided: your own freeze status was not checked.'
        : s.myLineFrozen === null ? 'No matching wallet trust line could be checked. Your freeze status remains unknown.'
          : `Wallet checked: ${e.wallet}`}</p>
      <h3>AMM model: buy, then sell</h3>
      {quote ? <p>{e.req.amountXrp} XRP in → <b>{precise(quote.xrpBack)} XRP back</b> · modelled loss {pct(quote.lossFraction)}. Includes pool trading fees, with reserves updated after the buy. This differs from R5’s original-pool price impact.</p>
        : <p>{frozen ? 'A freeze was detected; no usable sell estimate is shown.' : 'No usable token/XRP AMM estimate. Order books and other pairs were not checked.'}</p>}
      <p className="small">Mathematical AMM estimate only, not an executable quote. Excludes issuer transfer charges, network fees, rounding and other trades. Permissions may prevent either swap.</p>
      <details>
        <summary>Data coverage and raw currency code</summary>
        <p className="mono wrap">Currency: {e.req.token.currency}{e.req.token.currency.length === 40 && ' (40-character hexadecimal encoding)'}</p>
        {data && <><p className="mono wrap">Ledger hash: {data.ledgerHash}</p><p>{data.holderLines} trust lines across {data.holderPages} pages. {data.holdersComplete ? 'All issuer pages read.' : 'Partial sample: more pages remain.'}</p></>}
        <ul>{LIMITS.map(limit => <li key={limit}>{limit}</li>)}</ul>
      </details>
    </section>
  )
}

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
  if (!s.pool || s.poolFrozen) return null
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
                  {e.mode === 'agent' ? `Agent · ${name} · ${e.req.amountXrp} XRP` : `${name} · ${short(e.req.token.issuer)}`}
                  {e.net === 'mainnet' && e.mode === 'agent' && ' · mainnet'}
                  {e.net === 'testnet' && e.mode === 'check' && ' · testnet'}
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

const amount = (x?: number) => (x === undefined ? '—' : num(x))
// Supply and volume can be huge: 100,000,000,000 reads better as 100B in a small box.
const big = (x?: number) => (x === undefined ? '—' : x.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 }))
const price = (x?: number) => (x === undefined ? '—' : `${x.toLocaleString('en-US', { maximumSignificantDigits: 3 })} XRP`)

// What the token directory says about this token: who issues it, how many hold it, and whether others copy its code.
export function TokenFacts({ e }: { e: Entry }) {
  if (e.net !== 'mainnet') return null
  const d = e.dir
  const picked = e.searched && searchNote(e.searched.q, e.searched.top, e.req.token, e.searched.holders)
  const head = (
    <>
      <h2>Token directory</h2>
      {picked && (
        <p className="look warn" role="alert">
          <span className="st warn">!</span>
          {picked}
        </p>
      )}
    </>
  )
  const source = <p className="src">From xrplmeta.org, not read from the ledger. It does not change the verdict.</p>
  if (!d) {
    return (
      <section className="facts">
        {head}
        <p className="muted">Looking up names, holders and prices…</p>
      </section>
    )
  }
  if ('error' in d) {
    return (
      <section className="facts">
        {head}
        <p className="muted">Could not reach the directory: {d.error}</p>
      </section>
    )
  }
  const look = lookalikeNote(e.req.token.issuer, e.req.token.currency, d.look)
  const i = d.info
  const icon = safeIcon(i?.icon)
  return (
    <section className="facts">
      {head}
      <p className={`look ${look.warn ? 'warn' : ''}`} role={look.warn ? 'alert' : undefined}>
        {look.warn && <span className="st warn">!</span>}
        {look.text}
      </p>
      {i ? (
        <>
          <div className="facts-head">
            {icon ? <img src={icon} alt="" width={36} height={36} referrerPolicy="no-referrer" /> : <span className="noicon" />}
            <div>
              <b>{i.name}</b> <span className="mono muted">{currencyName(i.currency)}</span>
              <span className="who">
                {i.issuerName ?? 'Issuer has no name in the directory'}
                {i.domain && ` · ${claimedDomain(i.domain)}`}
                {i.kyc && ' · KYC'}
              </span>
            </div>
            {i.trustLevel !== undefined && <span className="lvl">trust level {i.trustLevel} of 3</span>}
          </div>
          <dl className="nums">
            <div>
              <dt>Holders</dt>
              <dd>{amount(i.holders)}</dd>
            </div>
            <div>
              <dt>Price</dt>
              <dd>{price(i.priceXrp)}</dd>
            </div>
            <div>
              <dt>24h volume</dt>
              <dd>{i.volume24hXrp === undefined ? '—' : `${big(i.volume24hXrp)} XRP`}</dd>
            </div>
            <div>
              <dt>Supply</dt>
              <dd>{big(i.supply)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="muted">This token is not in the directory.</p>
      )}
      {source}
    </section>
  )
}
