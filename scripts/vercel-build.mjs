// Vercel build: the page as static files plus one Node function for /api/* and /mcp (Build Output API v3).
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
const out = '.vercel/output'
rmSync(out, { recursive: true, force: true })
execSync('npx vite build', { stdio: 'inherit' })
cpSync('dist', `${out}/static`, { recursive: true })
const fn = `${out}/functions/api.func`
execSync(`npx vite build --ssr server/handler.ts --outDir ${fn} --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, EG_SSR_BUNDLE: '1' } })
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }))
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'handler.js', launcherType: 'Nodejs', maxDuration: 60 }))
mkdirSync(out, { recursive: true })
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '^/api(/.*)?$', dest: '/api' },
    { src: '^/mcp/?$', dest: '/api' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
}))
