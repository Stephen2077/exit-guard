import type { CSSProperties, ReactNode } from 'react'
import { short } from '../ui/format'
import { EXPLORER, EXPLORER_HOST, type TxRecord } from '../xrpl/client'
import { currencyName } from '../xrpl/token'
import type { Entry, Guard, Trap } from './useExitGuard'
import { NO_POOL, SIGN, looksEmpty, lookalikeNote, onlyNoPool, resultWords, searchNote, signLine, signReasons } from './words'

// Motion plays only when a result first arrives, not when an old one is opened again.
export const fresh = (t?: number) => !!t && Date.now() - t < 1500
export const GLYPH = { pass: '✓', warn: '!', fail: '✕' } as const

const Dots = ({ n }: { n: number }) => (
  <span className="dots" aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <i key={i} style={{ '--i': i } as CSSProperties} />
    ))}
  </span>
)

// The big panel. Unlit (dark) while idle or reading; lit green, yellow or red by the verdict.
export function IdleSign({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <section className="sign dark">
      <h1 className="h-mid">{title}</h1>
      <p className="sub">{sub}</p>
      {children}
    </section>
  )
}

// What was asked, in one white strip: verdict, token and amount, issuer (links to the explorer), network and time.
function Meta({ e }: { e: Entry }) {
  const name = currencyName(e.req.token.currency)
  const look = e.dir && 'look' in e.dir ? lookalikeNote(e.req.token.issuer, e.req.token.currency, e.dir.look) : null
  const picked = e.searched && searchNote(e.searched.q, e.searched.top, e.req.token, e.searched.holders)
  return (
    <div className="meta">
      <p className="meta-strip">
        {e.decision && <b className="mono">{e.decision.outcome}</b>}
        <span>{e.mode === 'agent' ? `Agent buys ${name} with ${e.req.amountXrp} XRP` : `${name}, buy with ${e.req.amountXrp} XRP`}</span>
        <a className="mono" href={`${EXPLORER_HOST[e.net]}/accounts/${e.req.token.issuer}`} target="_blank" rel="noreferrer">
          {short(e.req.token.issuer)}
        </a>
        <span>
          {e.net === 'mainnet' ? 'Mainnet' : 'Testnet'} {e.time}
        </span>
      </p>
      {(look?.warn || picked) && <p className="meta-strip warn">! Possible lookalike</p>}
    </div>
  )
}

export function EntrySign({ e, g }: { e: Entry; g: Guard }) {
  if (!e.decision || !e.snapshot) {
    if (e.status === 'failed') {
      return (
        <section className="sign dark failed">
          <Meta e={e} />
          <h1 className="h-mid">Could not read the ledger.</h1>
          <p className="sub" role="alert">
            {e.note}
          </p>
          <div className="actions">
            <button className="btn-line" onClick={() => g.retry(e)} disabled={e.mode === 'check' ? g.checking : g.demoBusy}>
              Try again
            </button>
          </div>
        </section>
      )
    }
    return (
      <section className="sign dark">
        <Meta e={e} />
        <h1 className="h-mid">Reading the ledger…</h1>
        <p className="sub">The issuer's settings, its pool and its holders.</p>
        <Dots n={8} />
      </section>
    )
  }

  const { outcome, checks } = e.decision
  const words = onlyNoPool(e.decision, e.snapshot) ? NO_POOL : SIGN[outcome]
  return (
    <section className={`sign ${outcome} ${fresh(e.decidedAt) ? 'fresh' : ''}`}>
      <Meta e={e} />
      <h1>{words.title}</h1>
      <p className="sub">{words.sub}</p>
      <ul className="why">
        {signReasons(checks, outcome).map((c, i) => (
          <li key={c.id} style={{ '--i': i } as CSSProperties}>
            <span className="x">{GLYPH[c.status]}</span>
            {signLine(c, e.snapshot!, e.req)}
          </li>
        ))}
      </ul>
      <Foot e={e} g={g} />
    </section>
  )
}

function Foot({ e, g }: { e: Entry; g: Guard }) {
  const last = e.txs[e.txs.length - 1]
  switch (e.status) {
    case 'awaiting':
      return (
        <div className="foot">
          <div className="actions">
            <button className="btn-ink" onClick={() => g.approve(e)} disabled={g.demoBusy}>
              Approve and buy
            </button>
            <button className="btn-line" onClick={() => g.reject(e)} disabled={g.demoBusy}>
              Reject
            </button>
          </div>
          <p className="small">Exit Guard reads the ledger again right before it buys.</p>
        </div>
      )
    case 'executing':
      return (
        <p className="foot">
          Buying, waiting for the ledger <Dots n={3} />
        </p>
      )
    case 'bought':
      return (
        <p className="foot">
          Bought.{' '}
          <a href={EXPLORER + last?.hash} target="_blank" rel="noreferrer">
            See the receipt
          </a>
        </p>
      )
    case 'blocked':
      return <p className="foot">Denied. Final. Nothing was sent to the ledger.{e.note && ` ${e.note}`}</p>
    case 'rejected':
      return <p className="foot">Rejected. Nothing was sent.</p>
    case 'failed':
      return <p className="foot">The buy did not go through. {e.note ?? (last && `${resultWords(last.result).text} (${last.result}).`)}</p>
    case 'checked':
      return (
        <p className="foot">
          Check only. Nothing was bought.
          {e.snapshot && looksEmpty(e.snapshot) && ' No holders and no pool for this code here: is the code right?'}
        </p>
      )
    default:
      return null
  }
}

export function SetupSign({ g }: { g: Guard }) {
  return (
    <section className="sign dark">
      <h1 className="h-mid">Set up the demo.</h1>
      <p className="sub">
        Creates two tokens on the XRPL testnet. GOD is safe. SCM is a trap: the issuer can claw back, keeps 25% of every sale, owns its own
        shallow pool, and one wallet holds most of the supply. Takes about a minute.
      </p>
      <div className="actions">
        <button className="btn-green" onClick={() => g.run('setup')} disabled={g.settingUp || g.online === false}>
          {g.settingUp ? 'Setting up…' : 'Create demo tokens'}
        </button>
      </div>
      {g.setupLog.length > 0 && (
        <ol className="log">
          {g.setupLog.map((l, i) => (
            <li key={i} className={l.startsWith('Setup failed') ? 'bad' : ''}>
              {l}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function TrapSign({ trap, busy, onReset }: { trap: Trap; busy: boolean; onReset: () => void }) {
  return (
    <section className={`sign dark trap ${fresh(trap.closedAt) ? 'fresh' : ''}`}>
      <div className="meta">
        <p className="meta-strip">
          <b className="mono">NO GUARD</b>
          <span>Agent buys SCM with 2 XRP</span>
        </p>
      </div>
      <h1 className="h-trap">Buyers can get in. The agent can't get out.</h1>
      <ol className="trap-steps">
        <li className={trap.buy.length ? 'ok' : ''}>The agent buys SCM without asking Exit Guard.</li>
        <li className={trap.freeze?.result === 'tesSUCCESS' ? 'ok' : ''}>The issuer freezes only the agent's SCM.</li>
        <li>Both trade at the same moment:</li>
      </ol>
      <div className="doors">
        <Door label="Way in · a new buyer buys with 1 XRP" tx={trap.buyerBuy} okText="Can still buy." badText="Can't buy." />
        <Door label="Way out · the agent sells all its SCM" tx={trap.agentSell} okText="Sold." badText="Can't sell." />
      </div>
      {trap.error && (
        <p className="foot" role="alert">
          {trap.error}
        </p>
      )}
      {!trap.running && (
        <div className="foot foot-row">
          {!trap.error && <p>Exit Guard says no before the agent buys.</p>}
          <button className="btn-line" onClick={onReset} disabled={busy}>
            Reset: unfreeze
          </button>
        </div>
      )}
    </section>
  )
}

function Door({ label, tx, okText, badText }: { label: string; tx?: TxRecord; okText: string; badText: string }) {
  const state = !tx ? 'wait' : tx.result === 'tesSUCCESS' ? 'open' : 'shut'
  return (
    <div className={`door ${state}`}>
      <span className="door-label">{label}</span>
      <span className="big">{state === 'wait' ? '…' : state === 'open' ? okText : badText}</span>
      {tx && (
        <a className="door-code" href={tx.hash ? EXPLORER + tx.hash : undefined} target="_blank" rel="noreferrer">
          {tx.result}
          {tx.ledger ? ` · ledger ${tx.ledger}` : ''}
        </a>
      )}
    </div>
  )
}
