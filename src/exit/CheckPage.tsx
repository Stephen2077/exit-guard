import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { short } from '../ui/format'
import type { Net } from '../xrpl/client'
import { safeIcon, searchTokens, type DirToken } from '../xrpl/directory'
import { currencyName, parseToken } from '../xrpl/token'
import { EntrySign, IdleSign } from './Sign'
import { Questions, Recent, TokenFacts } from './Side'
import type { Guard } from './useExitGuard'
import { claimedDomain, num } from './words'

// The tool: search a token by name, pick it, see if there is a way out.
export function CheckPage({ g }: { g: Guard }) {
  const e = g.checkEntry
  return (
    <div className="page check-page">
      <SearchBar g={g} />
      <div className="split">
        {e ? (
          <EntrySign e={e} g={g} />
        ) : (
          <IdleSign
            title="Is there a way out?"
            sub="Search a token by name. Exit Guard reads the ledger and tells you if you could sell it again, before you buy."
          />
        )}
        <aside className="side">
          {e && <TokenFacts e={e} />}
          <Questions e={e} empty="Pick a token from the search. The answers show up here, with the ledger values behind them." />
          <Recent entries={g.checkEntries} currentId={e?.id} onPick={g.setCheckId} />
        </aside>
      </div>
    </div>
  )
}

type Found = { q: string; count: number; tokens: DirToken[] }

function SearchBar({ g }: { g: Guard }) {
  const [q, setQ] = useState('')
  const [amount, setAmount] = useState('2')
  const [found, setFound] = useState<Found | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [manual, setManual] = useState(false) // check an exact issuer address instead of searching
  const [issuer, setIssuer] = useState('')
  const [net, setNet] = useState<Net>('mainnet')
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // Search the directory while typing: wait for a 300 ms pause and drop answers to older queries.
  useEffect(() => {
    const term = q.trim()
    setError(null)
    if (manual || term.length < 2) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      searchTokens(term, 12, ctl.signal).then(
        r => {
          setFound({ q: term, ...r })
          setActive(0)
          setOpen(true)
        },
        err => {
          if (!ctl.signal.aborted) setError(`Token directory: ${(err as Error).message}`)
        },
      )
    }, 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [q, manual])

  // Results belong to the query they answer. While a newer query is on its way, nothing can be picked.
  const list = found && found.q === q.trim() && !manual ? found.tokens : null
  const shown = open && list !== null

  // Keep the highlighted result inside the scrolled list.
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`#opt-${active}`)
    if (!box.current || !el) return
    if (el.offsetTop < box.current.scrollTop) box.current.scrollTop = el.offsetTop
    else if (el.offsetTop + el.offsetHeight > box.current.scrollTop + box.current.clientHeight)
      box.current.scrollTop = el.offsetTop + el.offsetHeight - box.current.clientHeight
  }, [active, shown])

  function amountXrp(): number | null {
    const x = Number(amount)
    if (Number.isFinite(x) && x > 0) return x
    setError('Enter how much XRP to buy with: a number above 0.')
    return null
  }

  function pick(t: DirToken) {
    const xrp = amountXrp()
    if (xrp === null || !list) return
    setOpen(false)
    setError(null)
    void g.checkToken({ token: { currency: t.currency, issuer: t.issuer }, amountXrp: xrp }, 'mainnet', { q: q.trim(), top: list[0], holders: t.holders })
  }

  function checkExact() {
    const p = parseToken(q, issuer)
    if (!p.ok) return setError(p.error)
    const xrp = amountXrp()
    if (xrp === null) return
    setError(null)
    void g.checkToken({ token: p.token, amountXrp: xrp }, net)
  }

  function onSearchKey(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.nativeEvent.isComposing) return // an input method is still composing the word
    if (manual) {
      if (ev.key === 'Enter') checkExact()
      return
    }
    const n = list?.length ?? 0
    if (ev.key === 'Enter') {
      ev.preventDefault()
      if (shown && list[active]) pick(list[active])
    } else if (ev.key === 'ArrowDown' && n) {
      ev.preventDefault()
      setOpen(true)
      setActive(a => Math.min(a + 1, n - 1))
    } else if (ev.key === 'ArrowUp' && n) {
      ev.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (ev.key === 'Escape') {
      setOpen(false)
    }
  }

  const onExactKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter' && manual && !ev.nativeEvent.isComposing) checkExact()
  }

  return (
    <div className="search">
      <div className="search-row">
        <label className="q">
          <span className="sr-only">{manual ? 'Token code' : 'Token name'}</span>
          <input
            value={q}
            onChange={ev => setQ(ev.target.value)}
            onKeyDown={onSearchKey}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            placeholder={manual ? 'Token code, like SOLO' : 'Search a token by name, like SOLO or RLUSD'}
            role={manual ? undefined : 'combobox'}
            aria-expanded={manual ? undefined : shown && list.length > 0}
            aria-controls={manual ? undefined : 'results'}
            aria-autocomplete={manual ? undefined : 'list'}
            aria-activedescendant={shown && list[active] ? `opt-${active}` : undefined}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        {manual && (
          <label className="issuer">
            <span className="sr-only">Issuer address</span>
            <input value={issuer} onChange={ev => setIssuer(ev.target.value)} onKeyDown={onExactKey} placeholder="Issuer address, r…" spellCheck={false} autoComplete="off" />
          </label>
        )}
        <label className="amt">
          <span>Buy with</span>
          <input value={amount} onChange={ev => setAmount(ev.target.value)} onKeyDown={onExactKey} inputMode="decimal" autoComplete="off" />
          <span>XRP</span>
        </label>
        {manual && (
          <>
            <div className="seg" role="group" aria-label="Network">
              {(['mainnet', 'testnet'] as const).map(n => (
                <button type="button" key={n} className={net === n ? 'on' : ''} aria-pressed={net === n} onClick={() => setNet(n)}>
                  {n === 'testnet' ? 'Testnet' : 'Mainnet'}
                </button>
              ))}
            </div>
            <button className="go" onClick={checkExact} disabled={g.checking}>
              Check
            </button>
          </>
        )}
      </div>
      <p className="search-help">
        {manual ? (
          <>
            Checks this exact issuer. Testnet tokens can only be checked this way.{' '}
            <button type="button" className="linkish" onClick={() => setManual(false)}>
              Search by name instead
            </button>
          </>
        ) : (
          <>
            Names, holders and prices come from the xrplmeta.org directory. The verdict comes from the ledger.{' '}
            <button type="button" className="linkish" onClick={() => setManual(true)}>
              Have an issuer address?
            </button>
          </>
        )}
      </p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {shown && (
        // Keep focus in the search box while the list is clicked or its scrollbar is dragged.
        <div className="results" ref={box} onMouseDown={ev => ev.preventDefault()}>
          <p className="results-head">
            {num(found!.count)} {found!.count === 1 ? 'match' : 'matches'} · most holders first
          </p>
          {list.length === 0 && <p className="muted pad">No token with this name in the directory. Have the issuer address? Use the link below the search.</p>}
          <ul id="results" role="listbox" aria-label="Matching tokens">
            {list.map((t, i) => {
              const icon = safeIcon(t.icon)
              return (
                <li
                  key={t.currency + t.issuer}
                  id={`opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'on' : ''}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(t)}
                >
                  {icon ? <img src={icon} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" /> : <span className="noicon" />}
                  <span className="r-name">
                    <b>{t.name}</b> <span className="mono">{currencyName(t.currency)}</span>
                  </span>
                  <span className="r-issuer">
                    {t.issuerName ?? (t.domain ? claimedDomain(t.domain) : 'No issuer name')} <span className="mono">{short(t.issuer)}</span>
                  </span>
                  <span className="r-holders">{t.holders !== undefined ? `${num(t.holders)} holders` : 'no holder data'}</span>
                  <span className="r-level">{t.trustLevel ? `level ${t.trustLevel}` : ''}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
