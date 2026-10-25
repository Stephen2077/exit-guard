// /api/agent: Claude reads the words, Jev decides from fixed options, the rule engine has the final say.
// Server only (Vite dev server middleware). API keys come from the server's environment and never reach the page.
// Read-only: nothing here sends a transaction.
import Anthropic from '@anthropic-ai/sdk'
import { maxSafeBuy } from '../engine/amm'
import { DEFAULT_POLICY, evaluate, type Outcome, type Token } from '../engine/policy'
import { answerLine, evidence } from '../exit/words'
import type { AgentAction, AgentResult, Candidate, Step } from '../v3/types'
import { getClient } from '../xrpl/client'
import { searchTokens, UI_TIMEOUT_MS, type DirToken } from '../xrpl/directory'
import { detect } from '../xrpl/intent'
import { getSnapshot } from '../xrpl/snapshot'
import { currencyName, parseToken } from '../xrpl/token'

export type Env = { ANTHROPIC_API_KEY?: string; AI_GATEWAY_API_KEY?: string; JEV_MODEL?: string }
type Reply = { status: number; body: unknown }

const CLAUDE_MODEL = 'claude-sonnet-5-5'
const JEV_URL = 'https://ai-gateway.vercel.sh/v1/decisions'
const PICK_MIN = 0.8 // below this, Jev's token pick goes to a human
const ACT_MIN = 0.5 // below this, Jev's "what should the agent do" becomes "ask a human"
const DEFAULT_XRP = 2
const NET = 'mainnet' as const

type Intent = 'check' | 'buy' | 'what_if'
type Extracted = { intent: Intent; token_name: string | null; issuer: string | null; amount_xrp: number | null }

// ---- Jev: a decision model. One Choice question per call; it returns the choice and its confidence.
type JevAnswer = { choice: string; confidence: number; probabilities?: { value: string; probability: number }[] }

async function jevChoose(env: Env, input: string, instructions: string, choices: { value: string; description: string }[]): Promise<JevAnswer> {
  if (!env.AI_GATEWAY_API_KEY) throw new Error('AI_GATEWAY_API_KEY is not set')
  const res = await fetch(JEV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.JEV_MODEL || 'typesafe-ai/jev-1.14.0', input, questions: [{ type: 'choice', name: 'q', instructions, choices }] }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Jev returned ${res.status}`)
  const a = ((await res.json()) as { answers?: (JevAnswer & { name: string })[] }).answers?.find(x => x.name === 'q')
  if (!a || typeof a.confidence !== 'number' || !choices.some(c => c.value === a.choice)) throw new Error('Jev gave no usable answer')
  return a
}

// ---- Claude: extraction only, as JSON that matches a schema.
const SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['check', 'buy', 'what_if'] },
    token_name: { type: ['string', 'null'] },
    issuer: { type: ['string', 'null'] },
    amount_xrp: { type: ['number', 'null'] },
  },
  required: ['intent', 'token_name', 'issuer', 'amount_xrp'],
  additionalProperties: false,
}
const SYSTEM = `You read one message to an XRPL trading agent and extract fields. Output only the JSON.
token_name: the token code or name as written (for example SOLO, RLUSD, USD), without amounts or extra words; null if none.
issuer: an XRPL address starting with r, only if it appears in the message, copied exactly; otherwise null.
amount_xrp: the amount of XRP to spend, only if stated; otherwise null.
intent: "buy" if they want to buy, "what_if" if they ask what happens if the agent buys anyway, otherwise "check".`

async function claudeExtract(env: Env, text: string): Promise<Extracted> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  // Server-side fallback ("default") re-runs a declined request on Anthropic's recommended model.
  const params = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
  }
  const msg = (await client.beta.messages.create(params as unknown as Parameters<typeof client.beta.messages.create>[0], {
    timeout: 30000,
  })) as { stop_reason?: string; content: { type: string; text?: string }[] }
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to read this message')
  const out = msg.content.find(b => b.type === 'text')?.text
  if (!out) throw new Error('Claude returned no text')
  const e = JSON.parse(out) as Extracted
  // An issuer must be copied from the message, never invented.
  if (e.issuer && !text.includes(e.issuer)) e.issuer = null
  if (e.amount_xrp !== null && !(e.amount_xrp > 0)) e.amount_xrp = null
  return e
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const toCandidate = (t: DirToken): Candidate => ({
  currency: t.currency,
  issuer: t.issuer,
  name: t.name,
  issuerName: t.issuerName,
  domain: t.domain,
  holders: t.holders,
  trustLevel: t.trustLevel,
})

// The tokens an issuer has issued, from its balances on the ledger.
async function issuedBy(issuer: string): Promise<Candidate[]> {
  const c = await getClient(NET)
  const r = await c.request({ command: 'gateway_balances', account: issuer, ledger_index: 'validated' })
  return Object.keys(r.result.obligations ?? {}).map(code => ({ currency: code, issuer, name: currencyName(code) }))
}

export async function agentFromBody(raw: unknown, env: Env): Promise<Reply> {
  const body = (raw ?? {}) as { text?: unknown; amountXrp?: unknown; pick?: { currency?: unknown; issuer?: unknown } }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : ''
  if (!text) return { status: 400, body: { error: 'Send {"text": "..."}: a token name, an issuer address, or an instruction.' } }

  const steps: Step[] = []
  const fail = (status: number, error: string) => ({ status, body: { error, steps } })
  const d = detect(text)

  // 1. Read the words. Exact forms need no model.
  let intent: Intent = 'check'
  let name: string | null = null
  let issuer: string | null = null
  let code: string | null = null
  let amount: number | undefined = typeof body.amountXrp === 'number' && body.amountXrp > 0 ? body.amountXrp : undefined
  if (d.kind === 'token') ((code = d.code), (issuer = d.issuer), steps.push({ actor: 'parser', task: 'Reads the exact form', result: `token ${d.code} · ${short(d.issuer)}` }))
  else if (d.kind === 'issuer') ((issuer = d.issuer), steps.push({ actor: 'parser', task: 'Reads the exact form', result: `issuer ${short(d.issuer)}` }))
  else if (d.kind === 'name') ((name = d.name), steps.push({ actor: 'parser', task: 'Reads the exact form', result: `token name "${d.name}"` }))
  else {
    let ext: Extracted
    try {
      ext = await claudeExtract(env, text)
    } catch (e) {
      return fail(502, `Claude could not read the message: ${(e as Error).message}`)
    }
    name = ext.token_name
    issuer = ext.issuer
    amount ??= ext.amount_xrp ?? (d.kind === 'instruction' ? d.amountXrp : undefined)
    steps.push({ actor: 'claude', task: 'Reads the words', result: `${ext.intent} · ${name ? `"${name}"` : 'no token'} · ${amount ?? DEFAULT_XRP} XRP` })
    // 2. Jev decides the intent from fixed options. If Jev is down, Claude's reading stands, and the page says so.
    try {
      const j = await jevChoose(env, text, 'What does the user want the agent to do with the token?', [
        { value: 'check', description: 'Only check whether the token is safe to buy' },
        { value: 'buy', description: 'Buy the token' },
        { value: 'what_if', description: 'See what happens if the agent buys it anyway' },
      ])
      intent = j.choice as Intent
      steps.push({ actor: 'jev', task: 'What does the user want?', result: intent, confidence: j.confidence })
    } catch (e) {
      intent = ext.intent
      steps.push({ actor: 'claude', task: 'What does the user want?', result: intent, note: `Jev unavailable (${(e as Error).message}): Claude's reading used` })
    }
  }
  const amountXrp = amount ?? DEFAULT_XRP

  // 3. Which token. A person's pick wins; one match is used; several go to Jev, and a human when Jev is unsure.
  let token: (Token & { name: string }) | undefined
  let candidates: Candidate[] = []
  try {
    if (body.pick && typeof body.pick.currency === 'string' && typeof body.pick.issuer === 'string') {
      const p = parseToken(body.pick.currency, body.pick.issuer)
      if (!p.ok) return fail(400, p.error)
      token = { ...p.token, name: currencyName(p.token.currency) }
      steps.push({ actor: 'parser', task: 'Which token?', result: `you picked ${token.name} · ${short(token.issuer)}` })
    } else if (code && issuer) {
      const p = parseToken(code, issuer)
      if (!p.ok) return fail(400, p.error)
      token = { ...p.token, name: currencyName(p.token.currency) }
    } else if (issuer) {
      candidates = await issuedBy(issuer)
      const same = name ? candidates.filter(c => c.name.toUpperCase() === name!.toUpperCase()) : []
      if (same.length) candidates = same
    } else if (name) {
      // The directory is sometimes slow: give it the page's longer limit, and one retry.
      const r = await searchTokens(name, 8, undefined, UI_TIMEOUT_MS).catch(() => searchTokens(name!, 8, undefined, UI_TIMEOUT_MS))
      const exact = r.tokens.filter(t => t.name.toUpperCase() === name!.toUpperCase() || currencyName(t.currency).toUpperCase() === name!.toUpperCase())
      candidates = (exact.length ? exact : r.tokens).map(toCandidate)
    } else return fail(400, 'No token in the message. Name one, like SOLO, or paste its issuer address.')
  } catch (e) {
    const err = (e as { data?: { error?: string } }).data?.error
    if (err === 'actNotFound') return fail(404, 'There is no account at this issuer address on mainnet.')
    return fail(502, `Could not look up the token: ${(e as Error).message}`)
  }

  if (!token && candidates.length === 0) return fail(404, `No token matching "${name ?? issuer}" was found.`)
  if (!token && candidates.length === 1) token = { currency: candidates[0].currency, issuer: candidates[0].issuer, name: candidates[0].name }
  if (!token) {
    const options = candidates.slice(0, 8).map((c, i) => ({
      value: `c${i}`,
      description: `${c.name} issued by ${c.issuerName ?? 'an unnamed issuer'} (${c.issuer})${c.domain ? `, claims ${c.domain}` : ''}, ${c.holders ?? 'unknown'} holders, directory trust ${c.trustLevel ?? 0} of 3`,
    }))
    const task = `Which ${name ?? 'token'}? (${candidates.length} match)`
    try {
      const j = await jevChoose(env, `The user wrote: "${text}"`, 'Which token does the user most likely mean? Copies often reuse a famous name; the original usually has far more holders and a known issuer.', options)
      const probs = new Map((j.probabilities ?? []).map(p => [p.value, p.probability]))
      candidates = candidates.slice(0, 8).map((c, i) => ({ ...c, probability: probs.get(`c${i}`) }))
      const chosen = candidates[Number(j.choice.slice(1))]
      if (j.confidence >= PICK_MIN) {
        token = { currency: chosen.currency, issuer: chosen.issuer, name: chosen.name }
        steps.push({ actor: 'jev', task, result: `${chosen.name} by ${chosen.issuerName ?? short(chosen.issuer)}${chosen.holders ? ` · ${chosen.holders.toLocaleString('en-US')} holders` : ''}`, confidence: j.confidence })
      } else steps.push({ actor: 'jev', task, result: 'Not sure enough: you pick', confidence: j.confidence })
    } catch (e) {
      steps.push({ actor: 'parser', task, result: 'You pick', note: `Jev unavailable (${(e as Error).message})` })
    }
    if (!token) {
      const result: AgentResult = { input: text, steps, net: NET, amountXrp, candidates: candidates.slice(0, 8), checks: [], maxSafeXrp: null }
      return { status: 200, body: result }
    }
  }

  // 4. The rules. Deterministic, on ledger data; a DENY is final.
  let snapshot
  try {
    snapshot = await getSnapshot(token, null, NET)
  } catch (e) {
    const err = (e as { data?: { error?: string } }).data?.error
    if (err === 'actNotFound') return fail(404, 'There is no account at this issuer address on mainnet.')
    return fail(502, `Could not read the ledger: ${(e as Error).message}`)
  }
  const req = { token, amountXrp }
  const decision = evaluate(snapshot, req)
  const outcome: Outcome = decision.outcome
  steps.push({ actor: 'rules', task: 'Can the agent sell it again?', result: outcome })
  const checks = decision.checks.map(c => ({ id: c.id, label: c.label, status: c.status, detail: answerLine(c, snapshot, req), ledger: evidence(c.id, snapshot, false) }))
  const maxSafeXrp = snapshot.pool ? Math.round(maxSafeBuy(snapshot.pool, DEFAULT_POLICY.warnExitCost) * 100) / 100 : null

  // 5. What the agent does. ALLOW and DENY are the rules' call. Only an approval case asks Jev, and doubt means a human.
  let action: AgentAction = { choice: outcome === 'ALLOW' ? 'continue' : outcome === 'DENY' ? 'abort' : 'human', by: 'rules' }
  if (outcome === 'REQUIRE_APPROVAL') {
    const warnings = checks.filter(c => c.status !== 'pass').map(c => c.detail).join(' ')
    const task = 'Approval needed: what should the agent do?'
    try {
      const j = await jevChoose(
        env,
        `The user asked: "${text}". The agent plans to spend ${amountXrp} XRP on ${token.name}. Warnings: ${warnings} The largest buy that keeps exit cost under ${DEFAULT_POLICY.warnExitCost * 100}% is ${maxSafeXrp ?? 'unknown'} XRP.`,
        'Should the agent go ahead, ask a human, or give up?',
        [
          { value: 'continue', description: 'The warnings are minor for this buy; go ahead' },
          { value: 'human', description: 'A person should look at this before buying' },
          { value: 'abort', description: 'Too risky; do not buy' },
        ],
      )
      const said = j.choice as AgentAction['choice']
      const choice = j.confidence < ACT_MIN ? 'human' : said
      const words = { human: 'Ask a human', continue: 'Go ahead', abort: 'Give up' }
      action = { choice, by: 'jev', confidence: j.confidence, jevChoice: said }
      steps.push({
        actor: 'jev',
        task,
        result: words[said],
        confidence: j.confidence,
        note: choice !== said ? `Under ${ACT_MIN * 100}% sure, so it goes to a human` : undefined,
      })
    } catch (e) {
      steps.push({ actor: 'rules', task, result: 'Ask a human', note: `Jev unavailable (${(e as Error).message})` })
    }
  }

  const result: AgentResult = {
    input: text,
    steps,
    net: NET,
    amountXrp,
    token,
    outcome,
    checks,
    maxSafeXrp,
    action,
    ledger: { time: new Date().toISOString() },
    source: `Live: mainnet ledger read at ${new Date().toISOString().slice(11, 19)} UTC. Intent: ${intent}.`,
  }
  return { status: 200, body: result }
}
