import type { Guard, Station } from './useExitGuard'

// The demo script as a route line. The first station not done yet is the next one, and says "Run".
const STATIONS: { id: Station; title: string; sub: string }[] = [
  { id: 'setup', title: 'Set up', sub: 'GOD and SCM' },
  { id: 'safe', title: 'Safe buy', sub: 'GOD, 2 XRP' },
  { id: 'big', title: 'Big buy', sub: 'GOD, 8 XRP' },
  { id: 'scam', title: 'Scam token', sub: 'SCM, 2 XRP' },
  { id: 'trap', title: 'The trap', sub: 'no guard' },
  { id: 'reset', title: 'Reset', sub: 'unfreeze' },
]

const TONE = { ALLOW: 'allow', REQUIRE_APPROVAL: 'ask', DENY: 'deny' } as const

export function Route({ g }: { g: Guard }) {
  const next = STATIONS.find(s => !g.done.has(s.id))?.id
  const reached = STATIONS.reduce((n, s, i) => (g.done.has(s.id) ? i : n), 0)
  const tone = g.here === 'trap' ? 'deny' : g.demoEntry?.decision ? TONE[g.demoEntry.decision.outcome] : ''
  // While a human has to approve, approving or rejecting is the only next step.
  const waiting = g.demoEntry?.status === 'awaiting'

  function canRun(s: Station) {
    if (g.demoBusy || waiting) return false
    if (s === 'setup') return !g.demo
    if (s === 'trap') return !!g.demo && !g.trap
    // Reset only unfreezes, so it may run any time: also after a page reload has forgotten the trap.
    if (s === 'reset') return !!g.demo
    return !!g.demo
  }

  // A station that is done opens its last result. To run the demo again, use Reset.
  function lastResult(s: Station): (() => void) | null {
    if (!g.done.has(s)) return null
    if (s === 'trap') return g.trap ? () => g.setDemoView({ kind: 'trap' }) : null
    const last = g.entries.find(e => e.station === s)
    return last ? () => g.setDemoView({ kind: 'entry', id: last.id }) : null
  }

  return (
    <nav className="route" aria-label="Demo run">
      <div className="line">
        <i style={{ transform: `scaleX(${reached / (STATIONS.length - 1)})` }} />
      </div>
      {STATIONS.map(s => {
        const open = lastResult(s.id)
        const runnable = !open && canRun(s.id)
        const cls = [g.done.has(s.id) && 'done', g.here === s.id && `here ${tone}`, next === s.id && 'next'].filter(Boolean).join(' ')
        return (
          <button
            key={s.id}
            className={`stop ${cls}`}
            disabled={!open && !runnable}
            aria-label={`${s.title}, ${s.sub}${open ? ': show result' : runnable ? ': run' : ''}`}
            aria-current={g.here === s.id ? 'step' : undefined}
            onClick={() => (open ? open() : g.run(s.id))}
          >
            <i aria-hidden="true" />
            <b>
              {s.title}
              {next === s.id && runnable && <span className="run">Run</span>}
            </b>
            <small>{s.sub}</small>
          </button>
        )
      })}
    </nav>
  )
}
