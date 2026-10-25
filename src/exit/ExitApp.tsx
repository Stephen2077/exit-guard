// Exit Guard: a tool that checks if a token can be sold before you buy it. The agent demo and the API are the other pages.
import { useEffect, useState } from 'react'
import { MAINNET, NETWORK } from '../xrpl/client'
import { currencyName } from '../xrpl/token'
import { ApiPage } from './ApiPage'
import { CheckPage } from './CheckPage'
import { DemoPage } from './DemoPage'
import { useExitGuard } from './useExitGuard'
import { SIGN } from './words'

type Page = 'check' | 'demo' | 'api'
const PAGES: { id: Page; label: string }[] = [
  { id: 'check', label: 'Check a token' },
  { id: 'demo', label: 'Agent demo' },
  { id: 'api', label: 'API' },
]
const fromHash = (): Page => {
  const h = location.hash.slice(1)
  return h === 'demo' || h === 'api' ? h : 'check'
}

export default function ExitApp() {
  const g = useExitGuard()
  const [page, setPage] = useState<Page>(fromHash)

  useEffect(() => {
    const onHash = () => setPage(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // One short sentence for screen readers when a result arrives.
  const shown = page === 'check' ? g.checkEntry : page === 'demo' ? g.demoEntry : undefined
  const status = shown?.decision
    ? `${currencyName(shown.req.token.currency)}: ${SIGN[shown.decision.outcome].title}`
    : shown?.status === 'failed'
      ? 'Could not read the ledger.'
      : ''

  function newWallets() {
    if (window.confirm('Delete the demo wallets and start over? Setting up again takes about a minute.')) g.newWallets()
  }

  return (
    <div className="xg">
      <header className="bar">
        <div className="brand">
          Exit Guard
          <span className="built">
            built on <img src="/brand/xrpl-tertiary-black.svg" alt="XRPL" />
          </span>
        </div>
        <nav className="tabs" aria-label="Pages">
          {PAGES.map(p => (
            <a key={p.id} href={`#${p.id}`} className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined}>
              {p.label}
            </a>
          ))}
        </nav>
        <div className="net">
          {page === 'demo' ? (
            <>
              <i className={`dot ${g.online === null ? '' : g.online ? 'on' : 'off'}`} />
              Demo on testnet · {NETWORK.includes('quiknode') ? 'QuickNode' : 'public node'}
              {g.demo && (
                <button className="link" onClick={newWallets} disabled={g.demoBusy}>
                  New demo wallets
                </button>
              )}
            </>
          ) : (
            <>Read-only · {g.checkEntry?.net === 'testnet' ? 'testnet' : `mainnet · ${new URL(MAINNET).host}`}</>
          )}
        </div>
      </header>
      {page === 'check' ? <CheckPage g={g} /> : page === 'demo' ? <DemoPage g={g} /> : <ApiPage />}
      <p className="sr-only" role="status">
        {status}
      </p>
    </div>
  )
}
