import { createRoot } from 'react-dom/client'

// v3 is the default. ?v=2 opens the Exit design and ?v=1 the first design, both kept as fallbacks.
// Each design loads only its own stylesheet, so they never mix.
const v = new URLSearchParams(location.search).get('v')
const load =
  v === '1'
    ? Promise.all([import('./App'), import('./styles.css')]).then(([m]) => m.default)
    : v === '2'
      ? Promise.all([import('./exit/ExitApp'), import('./exit/exit.css')]).then(([m]) => m.default)
      : Promise.all([import('./v3/V3App'), import('./v3/v3.css')]).then(([m]) => m.default)

const root = document.getElementById('root')!
load.then(
  App => createRoot(root).render(<App />),
  // A stale page after a deploy can fail to load its code: say so instead of showing nothing.
  e => (root.textContent = `Exit Guard could not load. Reload the page. (${(e as Error).message})`),
)
