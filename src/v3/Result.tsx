// The result: who decided what (Claude, Jev, the rules), the verdict, and the ledger values behind it.
import { useState } from 'react'
import type { Outcome } from '../engine/policy'
import { SIGN } from '../exit/words'
import { short } from '../ui/format'
import { useLang, useT } from './lang'
import { Shark } from './Shark'
import type { AgentResult, Candidate, RuleCheck, Step } from './types'

const ACTOR: Record<Step['actor'], string> = { parser: 'parser', claude: 'claude', jev: 'jev', rules: 'rules' }
const GLYPH = { pass: '✓', warn: '!', fail: '✕' } as const
const EXPLORER = { mainnet: 'https://livenet.xrpl.org', testnet: 'https://testnet.xrpl.org' }

// The verdict word in Chinese: plain words, short enough for the big type.
const SIGN_ZH: Record<Outcome, string> = { ALLOW: '能卖出。', REQUIRE_APPROVAL: '能卖，有风险。', DENY: '卖不出。' }
const RULE_ZH: Record<string, string> = {
  R1: '现在冻结',
  R2: '以后能冻结',
  R3: '能收回币',
  R4: '持币集中度',
  R5: '退出成本',
  R6: '能抽走池子',
  R7: '转账费',
  R8: '金额',
}
const ACT = { human: 'ask a human', continue: 'go ahead', abort: 'give up' } as const
const ACT_ZH = { human: '转人工', continue: '继续买', abort: '放弃' } as const
const fmt = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: x < 10 ? 2 : 0 })

// The server sends Chinese next to the English; fall back to English only where it has none (the design samples).
const stepText = (s: Step, zh: boolean) => ({ task: (zh && s.taskZh) || s.task, result: (zh && s.resultZh) || s.result, note: (zh && s.noteZh) || s.note })
const ruleText = (c: RuleCheck, zh: boolean) => (zh && c.detailZh) || c.detail

// "████████░░ 0.82": confidence as a bar of 10 characters.
function Confidence({ value }: { value: number }) {
  const t = useT()
  const on = Math.round(value * 10)
  return (
    <span className="conf" role="img" aria-label={`${t('confidence', '把握')} ${value.toFixed(2)}`}>
      <span className="conf-label">{t('sure', '把握')} </span>
      <span className="conf-on">{'█'.repeat(on)}</span>
      <span className="conf-off">{'░'.repeat(10 - on)}</span> {value.toFixed(2)}
    </span>
  )
}

export function Pipeline({ steps, running }: { steps: Step[]; running?: number }) {
  const t = useT()
  const zh = useLang() === 'zh'
  return (
    <ol className="pipe">
      {steps.map((s, i) => {
        const state = running === undefined || i < running ? 'done' : i === running ? 'run' : 'wait'
        const outcome = s.actor === 'rules' && state === 'done' && s.result in SIGN ? (s.result as Outcome) : undefined
        const x = stepText(s, zh)
        return (
          <li key={i} className={`pipe-step ${state}`}>
            <div className="pipe-head">
              <span className="pipe-n">{String(i + 1).padStart(2, '0')}</span> {ACTOR[s.actor]}
              {s.actor === 'rules' && <span className="pipe-final">{t('final say', '最终裁决')}</span>}
            </div>
            <div className="pipe-task">{x.task}</div>
            <div className={`pipe-result ${outcome ? `o-${outcome}` : ''}`}>
              {state === 'run' ? <span className="spin">{t('reading…', '读取中…')}</span> : state === 'wait' ? '—' : x.result}
            </div>
            {state === 'done' && s.confidence !== undefined && <Confidence value={s.confidence} />}
            {x.note && <div className="pipe-note">{x.note}</div>}
          </li>
        )
      })}
    </ol>
  )
}

// What the page can do next. Without handlers (the design preview), the buttons do nothing.
export type Handlers = { onAnother?: () => void; onBuy?: (xrp: number) => void; onPick?: (c: Candidate) => void }

function Action({ r, h }: { r: AgentResult; h: Handlers }) {
  const t = useT()
  const zh = useLang() === 'zh'
  const act = zh ? ACT_ZH : ACT
  // A person's answer to an approval. Exit Guard never buys on mainnet, so this only records the decision on the page.
  const [said, setSaid] = useState<'approved' | 'rejected' | null>(null)
  if (!r.outcome || !r.action) return null
  if (r.outcome === 'DENY')
    return (
      <div className="act">
        <p className="act-line">{t('Final. No model can override a DENY, so there is no approve button.', '这是最终结论。任何模型都推翻不了 DENY，所以没有批准按钮。')}</p>
        <div className="act-row">
          <button className="ghost" onClick={h.onAnother}>
            {t('Check another token', '换一个币')}
          </button>
        </div>
      </div>
    )
  if (r.outcome === 'REQUIRE_APPROVAL') {
    const pctSure = Math.round((r.action.confidence ?? 0) * 100)
    const overridden = r.action.by === 'jev' && r.action.jevChoice && r.action.jevChoice !== r.action.choice
    return (
      <div className="act">
        <p className="act-line">
          {overridden ? (
            zh ? (
              <>
                Jev 倾向<b>{act[r.action.jevChoice!]}</b>，但只有 {pctSure}% 把握，所以转人工。由你决定。
              </>
            ) : (
              <>
                Jev leaned <b>{act[r.action.jevChoice!]}</b> but was only {pctSure}% sure, so the agent asks a human. You decide.
              </>
            )
          ) : zh ? (
            <>
              Jev 给代理的建议：<b>{act[r.action.choice]}</b>
              {r.action.confidence !== undefined && <>（{pctSure}% 把握）</>}。由你决定。
            </>
          ) : (
            <>
              Jev's call for the agent: <b>{act[r.action.choice]}</b>
              {r.action.confidence !== undefined && <> ({pctSure}% sure)</>}. You decide.
            </>
          )}
        </p>
        {said ? (
          <p className="act-said" role="status">
            {said === 'approved'
              ? t(`Approved by you: the agent may buy ${r.amountXrp} XRP of ${r.token?.name}.`, `你已批准：代理可以买 ${r.amountXrp} XRP 的 ${r.token?.name}。`)
              : t('Rejected by you: the agent will not buy.', '你已拒绝：代理不会买。')}{' '}
            <button className="text" onClick={() => setSaid(null)}>
              {t('Undo', '撤销')}
            </button>
          </p>
        ) : (
          <div className="act-row">
            <button className="ghost" onClick={() => setSaid('approved')}>
              {t(`Approve ${r.amountXrp} XRP`, `批准买 ${r.amountXrp} XRP`)}
            </button>
            {r.maxSafeXrp !== null && r.maxSafeXrp > 0 && r.maxSafeXrp < r.amountXrp && (
              <button className="ghost" onClick={() => h.onBuy?.(Math.floor(r.maxSafeXrp! * 100) / 100)}>
                {t(`Check ${fmt(r.maxSafeXrp)} XRP instead`, `改查 ${fmt(r.maxSafeXrp)} XRP`)}
              </button>
            )}
            <button className="text" onClick={() => setSaid('rejected')}>
              {t('Reject', '拒绝')}
            </button>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="act">
      <p className="act-line">{t('The rules allow it, so the agent goes ahead without asking.', '规则放行，代理直接买，不用问人。')}</p>
      <div className="act-row">
        <CopyCall r={r} />
        <button className="text" onClick={h.onAnother}>
          {t('Check another token', '换一个币')}
        </button>
      </div>
    </div>
  )
}

// The same request as a curl command, so a developer can repeat it from their agent.
function CopyCall({ r }: { r: AgentResult }) {
  const t = useT()
  const [done, setDone] = useState(false)
  const cmd = `curl -X POST ${location.origin}/api/agent -H 'Content-Type: application/json' -d '${JSON.stringify({ text: r.input })}'`
  return (
    <button className="ghost" onClick={() => navigator.clipboard?.writeText(cmd).then(() => setDone(true), () => setDone(false))}>
      {done ? t('Copied', '已复制') : t('Copy API call', '复制 API 调用')}
    </button>
  )
}

export function Verdict({ r, h = {} }: { r: AgentResult; h?: Handlers }) {
  const t = useT()
  const zh = useLang() === 'zh'
  if (!r.outcome || !r.token) return null
  const reasons = r.checks.filter(c => (r.outcome === 'DENY' ? c.status === 'fail' : c.status !== 'pass'))
  const time = r.ledger ? new Date(r.ledger.time).toISOString().slice(11, 19) + ' UTC' : ''
  return (
    <section className={`verdict o-${r.outcome}`}>
      <div className="v-main">
        <div className="v-meta">
          <span className={`tag o-${r.outcome}`}>{r.outcome}</span>
          <span>{r.token.name}</span>
          <a href={`${EXPLORER[r.net]}/accounts/${r.token.issuer}`} target="_blank" rel="noreferrer">
            {short(r.token.issuer)}
          </a>
          <span>{r.amountXrp} XRP</span>
          <span>{r.net}</span>
          {time && <span>{time}</span>}
        </div>
        <div className="v-word-row">
          <h2 className="v-word" lang={zh ? 'zh' : 'en'}>
            {zh ? SIGN_ZH[r.outcome] : SIGN[r.outcome].title}
          </h2>
          {r.outcome === 'DENY' && <Shark />}
        </div>
        <ul className="v-reasons">
          {reasons.slice(0, 3).map(c => (
            <li key={c.id} className={c.status}>
              <span className="g">{GLYPH[c.status]}</span> {ruleText(c, zh)}
            </li>
          ))}
          {reasons.length === 0 && <li className="pass">{t('All 8 checks pass.', '8 项检查全部通过。')}</li>}
        </ul>
        {/* No "safe size" for a DENY: a smaller buy of a trap is still a trap. */}
        {r.maxSafeXrp !== null && r.outcome !== 'DENY' && (
          <p className="v-safe">
            {t('Max safe buy: ', '最多能安全买：')}
            <b>{r.maxSafeXrp > 0 ? `${fmt(r.maxSafeXrp)} XRP` : t('none', '无')}</b>
            <span>{t(' · keeps exit cost under 5%', ' · 退出成本低于 5%')}</span>
          </p>
        )}
        {r.event && (
          <p className="v-tx">
            <span className={r.event.result === 'tesSUCCESS' ? 'ok' : 'bad'}>{r.event.result}</span> {r.event.label} · ledger {r.event.ledger}{' '}
            {r.event.hash && (
              <a href={`${EXPLORER[r.net]}/transactions/${r.event.hash}`} target="_blank" rel="noreferrer">
                {short(r.event.hash)}
              </a>
            )}
          </p>
        )}
        <Action r={r} h={h} />
      </div>
      <div className="v-side">
        <h3>$ exit-guard check --rules 8</h3>
        <ul className="rules">
          {r.checks.map(c => (
            <li key={c.id} className={c.status} title={ruleText(c, zh)}>
              <span className="g">[{GLYPH[c.status]}]</span>
              <span className="k">
                {c.id} {zh ? RULE_ZH[c.id] ?? c.label : c.label.toLowerCase()}
              </span>
              <span className="dots" />
              <span className="v">{(zh && c.ledgerZh) || c.ledger}</span>
            </li>
          ))}
        </ul>
        {r.directory && (
          <p className="dir">
            {t('Directory (xrplmeta.org, not ledger data): ', '代币目录（xrplmeta.org，不是账本数据）：')}
            {r.directory.holders?.toLocaleString('en-US')} {t('holders', '个持有人')}
            {r.directory.domain && <> · {t('says', '自称')} {r.directory.domain}</>}
            {r.directory.trustLevel !== undefined && <> · {t('trust', '可信度')} {r.directory.trustLevel}/3</>}
          </p>
        )}
      </div>
    </section>
  )
}

export function Candidates({ list, onPick }: { list: Candidate[]; onPick?: (c: Candidate) => void }) {
  const t = useT()
  return (
    <section className="cands">
      <h2>{t('Which one did you mean? Jev was not sure enough, so you pick.', '你指的是哪一个？Jev 把握不够，请你来选。')}</h2>
      <ul>
        {list.map(c => (
          <li key={c.issuer}>
            <button className="cand" onClick={() => onPick?.(c)}>
              <span className="cand-name">{c.name}</span>
              <span className="cand-by">
                {c.issuerName ?? t('unknown issuer', '未知发币方')} · {short(c.issuer)}
              </span>
              <span className="cand-meta">
                {c.holders?.toLocaleString('en-US')} {t('holders', '个持有人')}
                {c.domain && <> · {t('says', '自称')} {c.domain}</>} · {t('trust', '可信度')} {c.trustLevel ?? 0}/3
              </span>
              {c.probability !== undefined && <span className="cand-p">Jev {Math.round(c.probability * 100)}%</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
