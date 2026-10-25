import { createRoot } from 'react-dom/client'

// The Exit design is the default. ?v=1 opens the first design, kept as a fallback.
// Each design loads only its own stylesheet, so the two never mix.
const legacy = new URLSearchParams(location.search).get('v') === '1'
const load = legacy
  ? Promise.all([import('./App'), import('./styles.css')]).then(([m]) => m.default)
  : Promise.all([import('./exit/ExitApp'), import('./exit/exit.css')]).then(([m]) => m.default)

const root = document.getElementById('root')!
load.then(
  App => createRoot(root).render(<App />),
  // A stale page after a deploy can fail to load its code: say so instead of showing nothing.
  e => (root.textContent = `Exit Guard could not load. Reload the page. (${(e as Error).message})`),
)
