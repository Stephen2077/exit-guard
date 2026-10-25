// Vercel serverless entry: the same /api and /mcp routes as the dev server plugins in vite.config.ts.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { agentFromBody } from '../src/api/agent'
import { checkFromQuery, searchFromQuery } from '../src/api/check'
import { mcpFromBody } from '../src/api/mcp'

const MAX_BODY = 16 * 1024
const env = () => ({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY, JEV_MODEL: process.env.JEV_MODEL })

async function readJson(req: IncomingMessage): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return { ok: false, status: 415, error: 'Send Content-Type: application/json.' }
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > MAX_BODY) return { ok: false, status: 413, error: 'Body too large.' }
  }
  try { return { ok: true, value: JSON.parse(text || '{}') } } catch { return { ok: false, status: 400, error: 'Body is not valid JSON.' } }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname.replace(/\/+$/, '')
  let status = 500
  let body: unknown
  try {
    if (path === '/mcp') {
      if (req.method !== 'POST') ({ status, body } = { status: 405, body: { error: 'Use POST (MCP Streamable HTTP).' } })
      else {
        const b = await readJson(req)
        if (!b.ok) ({ status, body } = { status: b.status, body: { jsonrpc: '2.0', id: null, error: { code: -32700, message: b.error } } })
        else ({ status, body } = await mcpFromBody(b.value, env()))
      }
    } else if (path === '/api/agent') {
      if (req.method !== 'POST') ({ status, body } = { status: 405, body: { error: 'Use POST with JSON {"text": "..."}.' } })
      else {
        const b = await readJson(req)
        if (!b.ok) ({ status, body } = { status: b.status, body: { error: b.error } })
        else ({ status, body } = await agentFromBody(b.value, env()))
      }
    } else if (req.method !== 'GET') ({ status, body } = { status: 405, body: { error: 'Use GET.' } })
    else if (path === '/api/check') ({ status, body } = await checkFromQuery(url.searchParams))
    else if (path === '/api/search') ({ status, body } = await searchFromQuery(url.searchParams))
    else ({ status, body } = { status: 404, body: { error: 'Unknown endpoint. Use /api/agent, /api/check or /api/search.' } })
  } catch (e) {
    body = { error: (e as Error).message }
  }
  res.statusCode = status
  if (body === undefined) return res.end()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (path.startsWith('/api')) res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body, null, path === '/mcp' ? 0 : 2))
}
