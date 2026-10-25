// The home page: one box. Type anything, see how it will be read, then who decided what.
// Live by default (POST /api/agent). ?state=... shows the design preview with sample data instead.
import { useRef, useState } from 'react'
import type { Outcome } from '../engine/policy'
import { detect, hint } from '../xrpl/intent'
import { APPROVAL, ALLOW, CHOOSE, DENY } from './fixtures'
import { Candidates, Pipeline, Verdict, type Handlers } from './Result'
import type { AgentResult, Candidate, Step } from './types'

export type Preview = 'empty' | 'checking' | 'allow' | 'approval' | 'deny' | 'choose'

// Each example shows the verdict it got on a real mainnet check, so the page shows output before any click.
const EXAMPLES: { text: string; label?: string; outcome?: Outcome }[] = [
  { text: 'buy 50 XRP of SOLO', outcome: 'REQUIRE_APPROVAL' },
  { text: 'is RLUSD safe to buy?', outcome: 'REQUIRE_APPROVAL' },
  // A copy that reuses the RLUSD name: 19 holders and no AMM pool (mainnet check, 2026-10-25).
  { text: 'buy 2 XRP of RLUSD from rLUSDv9MRcCwPdBUZCGkG4u4EtdMMA1qYM', label: 'buy a fake RLUSD', outcome: 'DENY' },
  { text: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz' },
]
const TAG: Record<Outcome, string> = { ALLOW: 'ALLOW', REQUIRE_APPROVAL: 'APPROVAL', DENY: 'DENY' }

const SAMPLE: Record<Exclude<Preview, 'empty' | 'checking'>, AgentResult> = { allow: ALLOW, approval: APPROVAL, deny: DENY, choose: CHOOSE }

// What the pipeline looks like before anything runs: the order every request goes through.
const HOW: Step[] = [
  { actor: 'claude', task: 'Reads the words', result: 'intent · token · amount' },
  { actor: 'jev', task: 'A decision model: picks from fixed options and says how sure it is', result: 'buy or check · which token' },
  { actor: 'rules', task: '8 ledger checks', result: 'ALLOW · REQUIRE_APPROVAL · DENY' },
]
// While a live request runs we do not know its steps yet: show the three stages, the first one running.
const PENDING: Step[] = [
  { actor: 'claude', task: 'Reads the words', result: '' },
  { actor: 'jev', task: 'Decides from fixed options', result: '' },
  { actor: 'rules', task: 'Can the agent sell it again?', result: '' },
]
const RULE_NAMES = ['frozen now', 'can freeze later', 'can take tokens back', 'holder concentration', 'exit cost', 'can pull the pool', 'transfer fee', 'amount']

type Phase = { kind: 'idle' } | { kind: 'checking' } | { kind: 'done'; r: AgentResult } | { kind: 'error'; message: string; steps: Step[] }

export function Ask({ preview }: { preview: Preview | null }) {
  const sample = preview && preview !== 'empty' && preview !== 'checking' ? SAMPLE[preview] : undefined
  const [text, setText] = useState(sample?.input ?? (preview === 'checking' ? APPROVAL.input : ''))
  const [phase, setPhase] = useState<Phase>(sample ? { kind: 'done', r: sample } : preview === 'checking' ? { kind: 'checking' } : { kind: 'idle' })
  const asked = useRef(0) // only the latest request may update the page
  const d = detect(text)

  async function ask(input: string, extra: { pick?: Candidate; amountXrp?: number } = {}) {
    const q = input.trim()
    if (!q || preview) return
    const id = ++asked.current
    setText(q)
    setPhase({ kind: 'checking' })
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q, amountXrp: extra.amountXrp, pick: extra.pick && { currency: extra.pick.currency, issuer: extra.pick.issuer } }),
      })
      const body = await res.json()
      if (id !== asked.current) return
      if (!res.ok) setPhase({ kind: 'error', message: body.error ?? `Request failed (${res.status}).`, steps: body.steps ?? [] })
      else setPhase({ kind: 'done', r: body as AgentResult })
    } catch {
      if (id === asked.current) setPhase({ kind: 'error', message: 'Could not reach Exit Guard. Check that the server is running, then try again.', steps: [] })
    }
  }

  const handlers: Handlers = {
    onAnother: () => {
      asked.current++
      setText('')
      setPhase({ kind: 'idle' })
    },
    onBuy: xrp => ask(text, { amountXrp: xrp }),
  }
  const idle = phase.kind === 'idle'

  return (
    <main className={`ask ${idle ? '' : 'has-result'}`}>
      {/* The headline only on the empty page: once there is a result, the verdict gets the space. */}
      {idle && (
        <section className="hero">
          <h1>Let your agent buy tokens without buying traps.</h1>
          <p>Before an AI agent buys an XRPL token, Exit Guard checks it can sell it again.</p>
        </section>
      )}
      {!idle && <h1 className="sr-only">Exit Guard</h1>}

      <form
        className="omni"
        onSubmit={e => {
          e.preventDefault()
          ask(text)
        }}
      >
        <span className="prompt">&gt;</span>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="buy 50 XRP of SOLO"
          aria-label="What should your agent check?"
          aria-describedby="omni-hint"
          spellCheck={false}
        />
        <button className="primary" type="submit" disabled={phase.kind === 'checking' || !text.trim()}>
          {phase.kind === 'checking' ? 'Checking…' : 'Check before buying'}
        </button>
      </form>
      <p className="omni-hint" id="omni-hint">
        {hint(d)}
      </p>

      {idle && (
        <>
          <div className="try">
            <span>Try</span>
            {EXAMPLES.map(x => (
              <button key={x.text} className="chip" onClick={() => (preview ? setText(x.text) : ask(x.text))}>
                {x.label ?? (x.text.length > 26 ? `${x.text.slice(0, 12)}…${x.text.slice(-6)}` : x.text)}
                {x.outcome && <span className={`tag o-${x.outcome}`}>{TAG[x.outcome]}</span>}
              </button>
            ))}
          </div>
          <section className="how">
            <h2>Every request goes through the same three steps</h2>
            <Pipeline steps={HOW} />
          </section>
        </>
      )}

      <div aria-live="polite" aria-busy={phase.kind === 'checking'}>
        {phase.kind === 'checking' && (
          <section className="result">
            <Pipeline steps={preview ? APPROVAL.steps : PENDING} running={preview ? 2 : 0} />
            <div className="skeleton">
              <h2>$ exit-guard check --rules 8</h2>
              {RULE_NAMES.map((n, i) => {
                const done = preview === 'checking' && i < 2
                return (
                  <div key={n} className={`sk-row ${done ? 'done' : ''}`}>
                    <span>[{done ? '✓' : '·'}]</span> R{i + 1} {n} <span className="dots" /> {done ? APPROVAL.checks[i].ledger : ''}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {phase.kind === 'error' && (
          <section className="result">
            {phase.steps.length > 0 && <Pipeline steps={phase.steps} />}
            <div className="err" role="alert">
              <p>{phase.message}</p>
              <button className="ghost" onClick={() => ask(text)}>
                Try again
              </button>
            </div>
          </section>
        )}

        {phase.kind === 'done' && (
          <section className="result">
            <Pipeline steps={phase.r.steps} />
            {phase.r.candidates ? (
              <Candidates list={phase.r.candidates} onPick={c => ask(text, { pick: c, amountXrp: phase.r.amountXrp })} />
            ) : (
              <Verdict key={phase.r.ledger?.time} r={phase.r} h={handlers} />
            )}
            {phase.r.source && <p className="source">{phase.r.source}</p>}
          </section>
        )}
      </div>
    </main>
  )
}
