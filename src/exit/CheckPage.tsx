import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { short } from '../ui/format'
import { UI_TIMEOUT_MS, safeIcon, searchTokens, type DirToken } from '../xrpl/directory'
import { currencyName, parseToken } from '../xrpl/token'
import { EntrySign, GLYPH, IdleSign } from './Sign'
import { Questions, TokenFacts } from './Side'
import type { Entry, Guard } from './useExitGuard'
import { SIGN, claimedDomain, issuerTail, num, recentPills } from './words'

// Bring the result into view after a pick. On a narrow screen it sits below the search.
function showResult() {
  const board = document.querySelector<HTMLElement>('.board')
  if (!board) return
  const header = document.querySelector('.bar')?.getBoundingClientRect().height ?? 0
  const top = board.getBoundingClientRect().top
  if (top >= header && top <= innerHeight * 0.5) return
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: top + scrollY - header - 8, behavior: smooth ? 'smooth' : 'auto' })
}
const afterRender = () => requestAnimationFrame(showResult)

// How much XRP to buy with, or null if the box does not hold a number above 0.
const xrpOf = (s: string) => {
  const x = Number(s)
  return Number.isFinite(x) && x > 0 ? x : null
}

// An input method is still composing the word. Safari ends the composition before keydown, so keyCode 229 counts too.
const composing = (ev: KeyboardEvent) => ev.nativeEvent.isComposing || ev.keyCode === 229

// The tool: search a token by name, pick it, see if there is a way out.
export function CheckPage({ g }: { g: Guard }) {
  const e = g.checkEntry
  return (
    <div className="page">
      <section className="toolbar" aria-label="Check a token">
        <SearchBar g={g} />
        <RecentChips g={g} current={e} />
      </section>
      <div className="board">
        <div className="board-main">
          {e ? (
            <EntrySign e={e} g={g} />
          ) : (
            <IdleSign
              title="Is there a way out?"
              sub="Search a token by name. Exit Guard reads the ledger and tells you if you could sell it again, before you buy."
            />
          )}
        </div>
        <aside className="board-side card">
          {e && <TokenFacts e={e} />}
          <Questions e={e} empty="Pick a token from the search. The answers show up here, with the ledger values behind them." />
        </aside>
      </div>
    </div>
  )
}

// Real mainnet issuers, read from the ledger on 2026-10-25.
const EXAMPLES = [
  { code: 'SOLO', issuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz' },
  { code: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' },
]
// A pill's status box uses the answers' glyphs: ✓ ! ✕ for a verdict, … while reading, ? when the read failed.
const STATUS = { ALLOW: 'pass', REQUIRE_APPROVAL: 'warn', DENY: 'fail' } as const
function mark(e: Entry): { cls: string; glyph: string; word: string } {
  if (!e.decision) return e.status === 'failed' ? { cls: 'none', glyph: '?', word: 'error' } : { cls: 'none', glyph: '…', word: 'reading' }
  const s = STATUS[e.decision.outcome]
  return { cls: s, glyph: GLYPH[s], word: SIGN[e.decision.outcome].tag }
}

// Recent checks as one row of pills under the search, one per token. Copies share a name, so each pill also shows
// the end of the issuer address. Before the first check: two examples to try.
function RecentChips({ g, current }: { g: Guard; current?: Entry }) {
  const amount = xrpOf(g.search.amount)

  function tryExample(code: string, issuer: string) {
    const p = parseToken(code, issuer)
    if (!p.ok || amount === null) return
    void g.checkToken({ token: p.token, amountXrp: amount }, 'mainnet')
    afterRender()
  }

  if (!g.checkEntries.length) {
    return (
      <p className="pills">
        <span className="pills-label">Try</span>
        {EXAMPLES.map(x => (
          <button key={x.code} className="pill" onClick={() => tryExample(x.code, x.issuer)} disabled={g.checking || amount === null}>
            {x.code}
          </button>
        ))}
        {amount === null && <span className="pills-label">Enter an XRP amount above 0 first.</span>}
      </p>
    )
  }
  return (
    <p className="pills">
      <span className="pills-label">Recent</span>
      {recentPills(g.checkEntries).map(e => {
        const m = mark(e)
        return (
          <button
            key={e.id}
            className={`pill ${current?.id === e.id ? 'on' : ''}`}
            aria-pressed={current?.id === e.id}
            onClick={() => {
              g.setCheckId(e.id)
              afterRender()
            }}
          >
            <span className={`st ${m.cls}`} aria-hidden="true">
              {m.glyph}
            </span>
            {currencyName(e.req.token.currency)}
            <span className="tail">
              {issuerTail(e.req.token.issuer)}
              {e.net === 'testnet' && ' testnet'}
            </span>
            <span className="sr-only">, {m.word}</span>
          </button>
        )
      })}
    </p>
  )
}

function SearchBar({ g }: { g: Guard }) {
  const { q, amount, manual, issuer, net, found } = g.search
  const set = g.setSearch
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Search the directory while typing: wait for a 300 ms pause and drop answers to older queries.
  // Coming back to this page with the same words does not search again.
  useEffect(() => {
    const term = q.trim()
    setError(null)
    if (manual || term.length < 2 || found?.q === term) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      setSearching(true)
      searchTokens(term, 12, ctl.signal, UI_TIMEOUT_MS)
        .then(
          r => {
            set({ found: { q: term, ...r } })
            setActive(0)
            setOpen(true)
          },
          err => {
            if (ctl.signal.aborted) return
            const slow = (err as Error).name === 'TimeoutError'
            setError(slow ? `The token directory did not answer in ${UI_TIMEOUT_MS / 1000} s. Type again to retry.` : `Token directory: ${(err as Error).message}`)
          },
        )
        .finally(() => {
          if (!ctl.signal.aborted) setSearching(false)
        })
    }, 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
      setSearching(false)
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
    const x = xrpOf(amount)
    if (x === null) setError('Enter how much XRP to buy with: a number above 0.')
    return x
  }

  function pick(t: DirToken) {
    const xrp = amountXrp()
    if (xrp === null || !list) return
    setOpen(false)
    setError(null)
    void g.checkToken({ token: { currency: t.currency, issuer: t.issuer }, amountXrp: xrp }, 'mainnet', { q: q.trim(), top: list[0], holders: t.holders })
    afterRender()
  }

  function checkExact() {
    const p = parseToken(q, issuer)
    if (!p.ok) return setError(p.error)
    const xrp = amountXrp()
    if (xrp === null) return
    setError(null)
    void g.checkToken({ token: p.token, amountXrp: xrp }, net)
    afterRender()
  }

  function onSearchKey(ev: KeyboardEvent<HTMLInputElement>) {
    if (composing(ev)) return
    if (manual) {
      if (ev.key === 'Enter') checkExact()
      return
    }
    const n = list?.length ?? 0
    // On a closed list, ↓ and ↑ only open it, so the first press shows where the highlight is.
    if (ev.key === 'Enter') {
      ev.preventDefault()
      if (shown && list[active]) pick(list[active])
    } else if (ev.key === 'ArrowDown' && n) {
      ev.preventDefault()
      if (shown) setActive(a => Math.min(a + 1, n - 1))
      else setOpen(true)
    } else if (ev.key === 'ArrowUp' && n) {
      ev.preventDefault()
      if (shown) setActive(a => Math.max(a - 1, 0))
      else setOpen(true)
    } else if (ev.key === 'Escape') {
      setOpen(false)
    }
  }

  const onExactKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter' && manual && !composing(ev)) checkExact()
  }

  return (
    <div className="search">
      <div className={`searchbar ${manual ? 'exact' : ''}`}>
        <label className="q">
          <span className="sr-only">{manual ? 'Token code' : 'Token name'}</span>
          <input
            value={q}
            onChange={ev => {
              set({ q: ev.target.value })
              setOpen(true) // typing shows the list again, also when these words were already searched
            }}
            onKeyDown={onSearchKey}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
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
            <input value={issuer} onChange={ev => set({ issuer: ev.target.value })} onKeyDown={onExactKey} placeholder="Issuer address, r…" spellCheck={false} autoComplete="off" />
          </label>
        )}
        <label className="amt">
          <span>
            Buy<span className="wide-only"> with</span>
          </span>
          <input
            value={amount}
            onChange={ev => set({ amount: ev.target.value })}
            onKeyDown={onExactKey}
            inputMode="decimal"
            autoComplete="off"
            aria-label="XRP to buy with"
            aria-invalid={amount.trim() !== '' && xrpOf(amount) === null}
          />
          <span>XRP</span>
        </label>
        {manual && (
          <div className="exact-row">
            <div className="seg" role="group" aria-label="Network">
              {(['mainnet', 'testnet'] as const).map(n => (
                <button type="button" key={n} className={net === n ? 'on' : ''} aria-pressed={net === n} onClick={() => set({ net: n })}>
                  {n === 'testnet' ? 'Testnet' : 'Mainnet'}
                </button>
              ))}
            </div>
            <button className="go" onClick={checkExact} disabled={g.checking}>
              Check
            </button>
          </div>
        )}
      </div>
      <p className="search-meta" aria-live="polite">
        {searching
          ? 'Searching the directory…'
          : manual
            ? 'Checks this exact issuer, read-only. Testnet tokens can only be checked this way.'
            : 'Read-only. Names, holders and prices: xrplmeta.org. The verdict: the XRPL ledger.'}{' '}
        <button type="button" className="linkish" onClick={() => set({ manual: !manual })}>
          {manual ? 'Search by name instead' : 'Have an issuer address?'}
        </button>
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
          {list.length === 0 && <p className="muted pad">No token with this name in the directory. Have the issuer address? Use the link under the search.</p>}
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
                  {icon ? <img className="r-icon" src={icon} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" /> : <span className="r-icon noicon" />}
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
