// Exit Guard v3: a tool for agent developers. The page is one client of /api/agent and /mcp.
import { useEffect, useState } from 'react'
import { Ask, type Preview } from './Ask'
import { Connect } from './Connect'

type Page = 'ask' | 'connect'
const fromHash = (): Page => (location.hash === '#connect' ? 'connect' : 'ask')
const PREVIEWS: Preview[] = ['empty', 'checking', 'allow', 'approval', 'deny', 'choose']

export default function V3App() {
  const [page, setPage] = useState<Page>(fromHash)
  useEffect(() => {
    const on = () => setPage(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  // Design preview: ?state=deny shows that screen with sample data.
  const s = new URLSearchParams(location.search).get('state') as Preview | null
  const preview: Preview | null = s && PREVIEWS.includes(s) ? s : null

  return (
    <div className="v3">
      <header className="bar">
        <a className="brand" href="#ask">
          exit_guard
        </a>
        <span className="built">
          built on <img src="/brand/xrpl-tertiary-white.svg" alt="XRPL" />
        </span>
        <nav aria-label="Pages">
          <a href="#ask" className={page === 'ask' ? 'on' : ''} aria-current={page === 'ask' ? 'page' : undefined}>
            Check a token
          </a>
          <a href="#connect" className={page === 'connect' ? 'on' : ''} aria-current={page === 'connect' ? 'page' : undefined}>
            Connect your agent
          </a>
        </nav>
        {/* The network of what is on screen: the testnet samples must not read as mainnet. */}
        <span className="net">
          <span className="dot" /> {preview === 'allow' || preview === 'deny' ? 'testnet sample' : 'mainnet · read only'}
        </span>
      </header>
      {page === 'ask' ? <Ask key={preview ?? 'live'} preview={preview} /> : <Connect />}
    </div>
  )
}
