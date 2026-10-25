import { useState } from 'react'

// How an AI agent calls Exit Guard. The endpoints are served by the dev server (vite.config.ts).
const EXAMPLES = [
  { label: 'Check RLUSD on mainnet', url: '/api/check?currency=RLUSD&issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De&amount=2&net=mainnet' },
  { label: 'Search tokens named SOLO', url: '/api/search?q=SOLO' },
]

export function ApiPage() {
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(url: string) {
    setBusy(true)
    setOut(`GET ${url}\n…`)
    try {
      const r = await fetch(url)
      setOut(`GET ${url}\n${r.status} ${r.statusText}\n\n${JSON.stringify(await r.json(), null, 2)}`)
    } catch (e) {
      setOut(`GET ${url}\n\n${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page api-page">
      <article className="doc">
        <h1>API for AI agents</h1>
        <p className="lede">
          An agent asks before it buys. Exit Guard reads the ledger, runs the same 8 checks as the Check page, and answers in JSON. Read-only: it
          never sends a transaction.
        </p>

        <h2>Check a token</h2>
        <pre className="code">GET /api/check?currency=RLUSD&amp;issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De&amp;amount=2&amp;net=mainnet</pre>
        <table className="params">
          <tbody>
            <tr>
              <td>currency</td>
              <td>Token code, like SOLO or RLUSD, or its 40-character hex code.</td>
            </tr>
            <tr>
              <td>issuer</td>
              <td>The issuer's address (starts with r). Names are not unique: use /api/search to find it.</td>
            </tr>
            <tr>
              <td>wallet</td>
              <td>Optional public classic address. Checks this wallet’s trust line; never provide a seed or private key.</td>
            </tr>
            <tr>
              <td>amount</td>
              <td>How much XRP the agent would spend. Used for the exit cost and the auto-limit. Default 2.</td>
            </tr>
            <tr>
              <td>net</td>
              <td>mainnet (default) or testnet.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Policy meaning of <code>outcome</code>: <b>ALLOW</b> no current rule blocked this amount. <b>REQUIRE_APPROVAL</b> review risks or missing data. <b>DENY</b> do not buy; this is
          final. Each check comes with the raw ledger value it used. On mainnet the answer also says whether other tokens use the same code
          (from the token directory).
        </p>

        <h2>Find a token by name</h2>
        <pre className="code">GET /api/search?q=SOLO</pre>
        <p>Tokens whose name matches, most holders first, from the xrplmeta.org directory.</p>

        <h2>Try it</h2>
        <div className="actions">
          {EXAMPLES.map(x => (
            <button key={x.url} className="btn-ink" onClick={() => run(x.url)} disabled={busy}>
              {x.label}
            </button>
          ))}
        </div>
        {out && <pre className="code out">{out}</pre>}
        <p className="note">The API runs inside the dev server (npm run dev) on this computer. A public deployment needs its own server.</p>
      </article>
    </div>
  )
}
