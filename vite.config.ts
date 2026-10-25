import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const ROUTES: Record<string, 'checkFromQuery' | 'searchFromQuery'> = { '/check': 'checkFromQuery', '/search': 'searchFromQuery' }

// /api/check and /api/search for AI agents. They run the page's own code (src/api/check.ts) inside the dev server,
// so they work with `npm run dev`. Read-only on both networks. Any other /api path answers 404 in JSON.
function api(): Plugin {
  return {
    name: 'exit-guard-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        let status = 500
        let body: unknown
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const handler = ROUTES[url.pathname]
          if (url.pathname === '/agent') {
            // POST {"text": "..."}. Keys are read from .env here, on the server; they are never sent to the page.
            if (req.method !== 'POST') ({ status, body } = { status: 405, body: { error: 'Use POST with JSON {"text": "..."}.' } })
            else {
              let text = ''
              for await (const chunk of req) text += chunk
              const all = loadEnv(server.config.mode, server.config.root, '')
              const env = { ANTHROPIC_API_KEY: all.ANTHROPIC_API_KEY, AI_GATEWAY_API_KEY: all.AI_GATEWAY_API_KEY, JEV_MODEL: all.JEV_MODEL }
              const mod = await server.ssrLoadModule('/src/api/agent.ts')
              ;({ status, body } = await mod.agentFromBody(JSON.parse(text || '{}'), env))
            }
          } else if (req.method !== 'GET') ({ status, body } = { status: 405, body: { error: 'Use GET.' } })
          else if (!handler) ({ status, body } = { status: 404, body: { error: 'Unknown endpoint. Use /api/agent, /api/check or /api/search.' } })
          else {
            const mod = await server.ssrLoadModule('/src/api/check.ts')
            ;({ status, body } = await mod[handler](url.searchParams))
          }
        } catch (e) {
          body = { error: (e as Error).message }
        }
        try {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify(body, null, 2))
        } catch {
          res.end()
        }
      })
    },
  }
}

// Tailscale serve proxies the team's tailnet URL to this dev server; allow that host only.
export default defineConfig({ plugins: [react(), api()], server: { allowedHosts: ['.ts.net'] } })
