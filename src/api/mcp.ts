// /mcp: Exit Guard as an MCP server (Streamable HTTP, JSON responses), so agents can call it as a tool.
// Two tools: `ask` (any text, like the box on the page) and `check_token` (exact currency and issuer). Read-only.
import { agentFromBody, type Env } from './agent'
import { checkFromQuery } from './check'

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
type Out = { status: number; body?: unknown }

const TOOLS = [
  {
    name: 'ask',
    description:
      'Before buying an XRPL token, ask Exit Guard in plain words (for example "buy 50 XRP of SOLO" or an issuer address). Claude reads it, Jev decides, and 8 ledger rules give ALLOW, REQUIRE_APPROVAL or DENY. DENY is final: do not buy. Mainnet, read-only.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'What the agent wants to do, a token name, or an issuer address' }, amount_xrp: { type: 'number', description: 'XRP to spend; default from the text, else 2' } },
      required: ['text'],
    },
  },
  {
    name: 'check_token',
    description: 'Check one exact XRPL token (currency code and issuer address) against the 8 rules. Returns ALLOW, REQUIRE_APPROVAL or DENY with the ledger values. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        currency: { type: 'string', description: 'Token code, like SOLO or a 40-character hex code' },
        issuer: { type: 'string', description: 'Issuer address, starts with r' },
        amount_xrp: { type: 'number', description: 'XRP to spend (default 2)' },
        net: { type: 'string', enum: ['mainnet', 'testnet'], description: 'Default mainnet' },
      },
      required: ['currency', 'issuer'],
    },
  },
]

const ok = (id: Rpc['id'], result: unknown): Out => ({ status: 200, body: { jsonrpc: '2.0', id, result } })
const err = (id: Rpc['id'], code: number, message: string): Out => ({ status: 200, body: { jsonrpc: '2.0', id: id ?? null, error: { code, message } } })

export async function mcpFromBody(raw: unknown, env: Env): Promise<Out> {
  const m = (raw ?? {}) as Rpc
  if (typeof m.method !== 'string') return err(m.id, -32600, 'Invalid request')
  // Notifications have no id and get no reply body.
  if (m.id === undefined || m.method.startsWith('notifications/')) return { status: 202 }

  switch (m.method) {
    case 'initialize':
      return ok(m.id, {
        protocolVersion: typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'exit-guard', version: '0.3.0' },
      })
    case 'ping':
      return ok(m.id, {})
    case 'tools/list':
      return ok(m.id, { tools: TOOLS })
    case 'tools/call': {
      const name = m.params?.name
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>
      let reply: { status: number; body: unknown }
      // A number sent as a string ("50") still counts; anything else falls back to the text or 2 XRP.
      if (name === 'ask') reply = await agentFromBody({ text: args.text, amountXrp: args.amount_xrp === undefined ? undefined : Number(args.amount_xrp) }, env)
      else if (name === 'check_token') {
        const q = new URLSearchParams()
        for (const [k, v] of [['currency', args.currency], ['issuer', args.issuer], ['amount', args.amount_xrp], ['net', args.net]] as const)
          if (v !== undefined && v !== null) q.set(k, String(v))
        reply = await checkFromQuery(q)
      } else return err(m.id, -32602, `Unknown tool: ${String(name)}`)
      return ok(m.id, { content: [{ type: 'text', text: JSON.stringify(reply.body, null, 2) }], isError: reply.status >= 400 })
    }
    default:
      return err(m.id, -32601, `Method not found: ${m.method}`)
  }
}
