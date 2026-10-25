// For developers: Exit Guard is a tool other agents call. The website is one client of it.
// Commands use the address this page is served from, so they work wherever the dev server runs.
const ORIGIN = location.origin
const MCP = `claude mcp add --transport http exit-guard ${ORIGIN}/mcp`
const ASK = `curl -X POST ${ORIGIN}/api/agent \\
  -H 'Content-Type: application/json' \\
  -d '{"text": "buy 50 XRP of SOLO"}'`
const CHECK = `curl "${ORIGIN}/api/check?currency=SOLO&issuer=rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz&amount=50"`
const REPLY = `{
  "outcome": "REQUIRE_APPROVAL",
  "action": { "choice": "human", "by": "jev", "confidence": 0.64 },
  "maxSafeXrp": 1017.9,
  "steps": [ { "actor": "claude", ... }, { "actor": "jev", ... }, { "actor": "rules", ... } ],
  "checks": [ { "id": "R4", "status": "warn", "ledger": "largest other holder: 78.3%" }, ... ]
}`

function Code({ children }: { children: string }) {
  return (
    <div className="code">
      <pre>{children}</pre>
      <button className="text" onClick={() => navigator.clipboard?.writeText(children)}>
        Copy
      </button>
    </div>
  )
}

export function Connect() {
  return (
    <main className="connect">
      <section className="hero">
        <h1>Connect your agent.</h1>
        <p>Your agent asks Exit Guard before every buy. It gets a verdict it can act on, and the ledger values behind it. Start the server first with <code>npm run dev</code>.</p>
      </section>

      <ol className="steps">
        <li>
          <h2>
            <span className="pipe-n">01</span> Add the MCP server
          </h2>
          <p>Tools: <code>ask</code> (any text, like the box on the home page) and <code>check_token</code> (exact currency and issuer).</p>
          <Code>{MCP}</Code>
        </li>
        <li>
          <h2>
            <span className="pipe-n">02</span> Or call the HTTP API
          </h2>
          <Code>{ASK}</Code>
          <Code>{CHECK}</Code>
        </li>
        <li>
          <h2>
            <span className="pipe-n">03</span> Act on the answer
          </h2>
          <table className="contract">
            <tbody>
              <tr>
                <td><span className="tag o-ALLOW">ALLOW</span></td>
                <td>Buy. Every check passed.</td>
              </tr>
              <tr>
                <td><span className="tag o-REQUIRE_APPROVAL">REQUIRE_APPROVAL</span></td>
                <td>Follow <code>action.choice</code>. Jev answers "human" whenever it is less than 50% sure. <code>maxSafeXrp</code> is the size that would pass.</td>
              </tr>
              <tr>
                <td><span className="tag o-DENY">DENY</span></td>
                <td>Do not buy. Final: no model, and no approval, can override it.</td>
              </tr>
            </tbody>
          </table>
          <Code>{REPLY}</Code>
        </li>
      </ol>
      <p className="source">Runs on your machine with <code>npm run dev</code>. Read only on mainnet: Exit Guard never sends a mainnet transaction.</p>
    </main>
  )
}
