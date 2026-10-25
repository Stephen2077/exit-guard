// The shark, drawn in characters. It only appears when there is one: a DENY.
// The shape is filled with characters by brightness, the same idea as stackedlol/ascii-sharks (our own code).
import { useEffect, useRef } from 'react'

const RAMP = " .':;t%SX8@#"

function sample(wc: number, hc: number, aspect: number): string[] {
  const s = 6
  const sy = Math.round(s * aspect)
  const c = document.createElement('canvas')
  c.width = wc * s
  c.height = hc * sy
  const g = c.getContext('2d')!
  const w = c.width
  const h = c.height
  const P = (x: number, y: number): [number, number] => [x * w, y * h]
  const grad = g.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#fff')
  grad.addColorStop(1, '#666')
  g.fillStyle = grad
  g.beginPath()
  g.moveTo(...P(0.2, 0.48))
  g.quadraticCurveTo(...P(0.55, 0.22), ...P(0.99, 0.52))
  g.quadraticCurveTo(...P(0.62, 0.8), ...P(0.2, 0.58))
  g.fill()
  g.beginPath()
  g.moveTo(...P(0.46, 0.36))
  g.lineTo(...P(0.55, 0.0))
  g.lineTo(...P(0.64, 0.33))
  g.fill()
  g.beginPath()
  g.moveTo(...P(0.22, 0.5))
  g.lineTo(...P(0.0, 0.05))
  g.lineTo(...P(0.1, 0.52))
  g.lineTo(...P(0.02, 0.98))
  g.lineTo(...P(0.22, 0.57))
  g.fill()
  g.beginPath()
  g.moveTo(...P(0.6, 0.64))
  g.lineTo(...P(0.5, 0.98))
  g.lineTo(...P(0.72, 0.68))
  g.fill()
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.arc(...P(0.86, 0.47), w * 0.012, 0, 7)
  g.fill()
  const d = g.getImageData(0, 0, w, h).data
  const rows: string[] = []
  for (let y = 0; y < hc; y++) {
    let row = ''
    for (let x = 0; x < wc; x++) {
      let sum = 0
      for (let yy = 0; yy < sy; yy++)
        for (let xx = 0; xx < s; xx++) {
          const i = ((y * sy + yy) * w + (x * s + xx)) * 4
          sum += (d[i + 3] / 255) * (d[i] / 255)
        }
      const v = sum / (s * sy)
      row += v < 0.06 ? ' ' : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(v * (RAMP.length - 1)))]
    }
    rows.push(row)
  }
  return rows
}

export function Shark({ cols = 46, rows = 13 }: { cols?: number; rows?: number }) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    // Character cells in JetBrains Mono at this size are about 1.9 times taller than wide.
    if (ref.current) ref.current.textContent = sample(cols, rows, 1.9).join('\n')
  }, [cols, rows])
  return <pre className="shark" ref={ref} aria-hidden="true" />
}
