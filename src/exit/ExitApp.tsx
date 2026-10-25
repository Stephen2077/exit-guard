// Exit Guard: a tool that checks if a token can be sold before you buy it. The agent demo and the API are the other pages.
import { useEffect, useState, type MouseEvent } from 'react'
import { currencyName } from '../xrpl/token'
import { ApiPage } from './ApiPage'
import { CheckPage } from './CheckPage'
import { DemoPage } from './DemoPage'
import { useExitGuard } from './useExitGuard'
import { SIGN } from './words'

type Page = 'check' | 'demo' | 'api'
// `short` is shown at phone width, so the header stays one row.
const PAGES: { id: Page; label: string; short: string }[] = [
  { id: 'check', label: 'Check a token', short: 'Check' },
  { id: 'demo', label: 'Agent demo', short: 'Demo' },
  { id: 'api', label: 'API', short: 'API' },
]
const fromHash = (): Page => {
  const h = location.hash.slice(1)
  return h === 'demo' || h === 'api' ? h : 'check'
}

export default function ExitApp() {
  const g = useExitGuard()
  const [page, setPage] = useState<Page>(fromHash)

  // A new page starts at its top.
  useEffect(() => {
    const onHash = () => {
      setPage(fromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // The logo goes home: the Check page, with an empty search and no result.
  // A click with a modifier key (new tab, new window) is left to the browser.
  function home(ev: MouseEvent) {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
    ev.preventDefault()
    g.goHome()
    if (page !== 'check') location.hash = '#check' // already on Check: no extra history entry
    window.scrollTo(0, 0)
  }

  // One short sentence for screen readers when a result arrives.
  const shown = page === 'check' ? g.checkEntry : page === 'demo' ? g.demoEntry : undefined
  const status = shown?.decision
    ? `${currencyName(shown.req.token.currency)}: ${SIGN[shown.decision.outcome].title}`
    : shown?.status === 'failed'
      ? 'Could not read the ledger.'
      : ''

  return (
    <div className="xg">
      <header className="bar">
        <a className="brand" href="#check" onClick={home} aria-label="Exit Guard home">
          Exit Guard
          <span className="built">
            built on <img src="/brand/xrpl-tertiary-black.svg" alt="XRPL" />
          </span>
        </a>
        <nav className="tabs" aria-label="Pages">
          {PAGES.map(p => (
            <a key={p.id} href={`#${p.id}`} className={page === p.id ? 'on' : ''} aria-current={page === p.id ? 'page' : undefined}>
              <span className="tab-long">{p.label}</span>
              <span className="tab-short">{p.short}</span>
            </a>
          ))}
        </nav>
      </header>
      {page === 'check' ? <CheckPage g={g} /> : page === 'demo' ? <DemoPage g={g} /> : <ApiPage />}
      <p className="sr-only" role="status">
        {status}
      </p>
    </div>
  )
}
