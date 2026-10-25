// For developers: Exit Guard is a tool other agents call. The website is one client of it.
import { useState } from 'react'
import { useT } from './lang'

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
  const t = useT()
  const [done, setDone] = useState(false)
  return (
    <div className="code">
      <pre tabIndex={0}>{children}</pre>
      <button className="text" onClick={() => navigator.clipboard?.writeText(children).then(() => setDone(true), () => setDone(false))}>
        {done ? t('Copied', '已复制') : t('Copy', '复制')}
      </button>
    </div>
  )
}

export function Connect() {
  const t = useT()
  return (
    <main className="connect">
      <section className="hero">
        <h1>{t('Connect your agent.', '接入你的代理。')}</h1>
        <p>
          {t(
            'Your agent asks Exit Guard before every buy. It gets a verdict it can act on, and the ledger values behind it. Start the server first with ',
            '你的代理每次买币前先问 Exit Guard，拿到能直接执行的结论，以及背后的账本数据。先用这个命令启动服务：',
          )}
          <code>npm run dev</code>
          {t('.', '。')}
        </p>
      </section>

      <ol className="steps">
        <li>
          <h2>
            <span className="pipe-n">01</span> {t('Add the MCP server', '添加 MCP 服务')}
          </h2>
          <p>
            {t('Tools: ', '工具：')}
            <code>ask</code>
            {t(' (any text, like the box on the home page) and ', '（任意文字，和首页输入框一样）和 ')}
            <code>check_token</code>
            {t(' (exact currency and issuer).', '（准确的代码和发币方地址）。')}
          </p>
          <Code>{MCP}</Code>
        </li>
        <li>
          <h2>
            <span className="pipe-n">02</span> {t('Or call the HTTP API', '或者调用 HTTP API')}
          </h2>
          <Code>{ASK}</Code>
          <Code>{CHECK}</Code>
        </li>
        <li>
          <h2>
            <span className="pipe-n">03</span> {t('Act on the answer', '按结论行动')}
          </h2>
          <table className="contract">
            <tbody>
              <tr>
                <td><span className="tag o-ALLOW">ALLOW</span></td>
                <td>{t('Buy. Every check passed.', '可以买。所有检查都通过了。')}</td>
              </tr>
              <tr>
                <td><span className="tag o-REQUIRE_APPROVAL">REQUIRE_APPROVAL</span></td>
                <td>
                  {t('Follow ', '照 ')}
                  <code>action.choice</code>
                  {t('. Jev answers "human" whenever it is less than 50% sure. ', ' 做。Jev 把握不到 50% 时一律答"转人工"。')}
                  <code>maxSafeXrp</code>
                  {t(' is the size that would pass.', ' 是能通过的买入量。')}
                </td>
              </tr>
              <tr>
                <td><span className="tag o-DENY">DENY</span></td>
                <td>{t('Do not buy. Final: no model, and no approval, can override it.', '不要买。这是最终结论，任何模型、任何批准都推翻不了。')}</td>
              </tr>
            </tbody>
          </table>
          <Code>{REPLY}</Code>
        </li>
      </ol>
      <p className="source">
        {t('Runs on your machine with ', '在你自己的电脑上用 ')}
        <code>npm run dev</code>
        {t('. Read only on mainnet: Exit Guard never sends a mainnet transaction.', ' 运行。主网只读：Exit Guard 从不在主网发交易。')}
      </p>
    </main>
  )
}
