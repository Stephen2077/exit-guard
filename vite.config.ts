import { defineConfig, type Plugin } from 'vite'
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
          if (req.method !== 'GET') ({ status, body } = { status: 405, body: { error: 'Use GET.' } })
          else if (!handler) ({ status, body } = { status: 404, body: { error: 'Unknown endpoint. Use /api/check or /api/search.' } })
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

export default defineConfig({ plugins: [react(), api()] })
