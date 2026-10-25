// What kind of thing did someone type into the box? Pure: no network, no model.
// Exact forms (an issuer address, CODE.rIssuer, one token name) never need a model to read them.
import { isValidClassicAddress } from 'xrpl'

export type Detected =
  | { kind: 'empty' }
  | { kind: 'token'; code: string; issuer: string; amountXrp?: number }
  | { kind: 'issuer'; issuer: string; amountXrp?: number }
  | { kind: 'name'; name: string; amountXrp?: number }
  | { kind: 'instruction'; text: string; issuer?: string; amountXrp?: number }

const ADDRESS = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/g
const AMOUNT = /(\d+(?:\.\d+)?)\s*xrp\b/i
const CODE = '([0-9A-Fa-f]{40}|[A-Za-z0-9$!?#@.-]{1,20})'

export function detect(input: string): Detected {
  const text = input.trim()
  if (!text) return { kind: 'empty' }
  const amount = text.match(AMOUNT)
  const amountXrp = amount ? Number(amount[1]) : undefined
  const issuers = (text.match(ADDRESS) ?? []).filter(a => isValidClassicAddress(a))

  const pair = text.match(new RegExp(`^${CODE}\\s*[.:\\s]\\s*(r[1-9A-HJ-NP-Za-km-z]{24,34})$`))
  if (pair && isValidClassicAddress(pair[2]) && pair[1].toUpperCase() !== 'XRP') return { kind: 'token', code: pair[1], issuer: pair[2] }
  if (issuers.length === 1 && text === issuers[0]) return { kind: 'issuer', issuer: issuers[0] }
  if (/^[A-Za-z0-9$]{1,20}$/.test(text) && text.toUpperCase() !== 'XRP') return { kind: 'name', name: text }
  return { kind: 'instruction', text, issuer: issuers[0], amountXrp }
}

// The hint under the box, so people see how their words will be read before they press Enter.
export function hint(d: Detected): string {
  switch (d.kind) {
    case 'empty':
      return 'Type a token name, an issuer address, or what your agent wants to do.'
    case 'token':
      return `Looks like: token ${d.code} from ${d.issuer.slice(0, 6)}…${d.issuer.slice(-4)} · no model needed`
    case 'issuer':
      return 'Looks like: an issuer address · we list the tokens it issues'
    case 'name':
      return `Looks like: a token name · Jev picks the right "${d.name}" if there are copies`
    case 'instruction':
      return 'Looks like: an instruction · Claude reads it, Jev decides, the rules have the last word'
  }
}
