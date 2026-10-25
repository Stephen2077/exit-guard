import { Route } from './Route'
import { EntrySign, IdleSign, SetupSign, TrapSign } from './Sign'
import { Questions, Receipts, Recent } from './Side'
import type { Guard } from './useExitGuard'

// The agent demo on testnet: an AI agent asks to buy, Exit Guard checks first. Then the same buy without a guard.
export function DemoPage({ g }: { g: Guard }) {
  const trapView = g.demoView?.kind === 'trap' ? g.trap : null
  const e = trapView ? undefined : g.demoEntry
  return (
    <div className="page demo-page">
      <Route g={g} />
      <div className="split">
        {trapView ? (
          <TrapSign trap={trapView} busy={g.demoBusy} onReset={() => g.run('reset')} />
        ) : e ? (
          <EntrySign e={e} g={g} />
        ) : !g.demo ? (
          <SetupSign g={g} />
        ) : (
          <IdleSign title="The agent demo." sub="An AI agent asks to buy tokens on testnet. Exit Guard checks each buy first. Run the next step above." />
        )}
        <aside className="side">
          <Questions
            e={e}
            empty={trapView ? 'No guard in this run. Nobody asked these questions.' : 'Run the next step above. The answers show up here, with the ledger values behind them.'}
          />
          <Recent
            entries={g.demoEntries}
            currentId={e?.id}
            onPick={id => g.setDemoView({ kind: 'entry', id })}
            trap={g.trap ? { trap: g.trap, selected: !!trapView, onPick: () => g.setDemoView({ kind: 'trap' }) } : undefined}
          />
          <Receipts txs={g.txs} />
        </aside>
      </div>
    </div>
  )
}
