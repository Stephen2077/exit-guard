// Turn what a person types into an XRPL token, and back. Pure: no network.
import { isValidClassicAddress } from 'xrpl'
import type { Token } from '../engine/policy'

const HEX40 = /^[0-9A-Fa-f]{40}$/

// 3-character codes are stored as-is. Longer codes (like RLUSD) are stored as 40 hex characters: ASCII, zero-padded.
export function currencyCode(input: string): string {
  const s = input.trim()
  if (HEX40.test(s)) return s.toUpperCase()
  if (s.length === 3) return s
  return [...s].map(ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase().padEnd(40, '0')
}

// The readable name of a currency code. A hex code is shown as text only if it is plain ASCII (then zero padding).
export function currencyName(code: string): string {
  if (!HEX40.test(code)) return code
  const bytes = code.match(/../g)!.map(h => parseInt(h, 16))
  while (bytes.at(-1) === 0) bytes.pop()
  if (bytes.length === 0 || bytes.some(b => b < 0x20 || b > 0x7e)) return code
  return String.fromCharCode(...bytes)
}

export type Parsed = { ok: true; token: Token } | { ok: false; error: string }

export function parseToken(code: string, issuer: string): Parsed {
  const c = code.trim()
  const i = issuer.trim()
  if (!c) return { ok: false, error: 'Enter a token code, like SOLO or USD.' }
  if (c.toUpperCase() === 'XRP' || /^0{40}$/.test(c)) return { ok: false, error: 'XRP is the native coin, not an issued token.' }
  if (!HEX40.test(c) && !/^[\x21-\x7E]{1,20}$/.test(c)) return { ok: false, error: 'A token code is 1 to 20 plain characters, or 40 hex characters.' }
  if (!isValidClassicAddress(i)) return { ok: false, error: 'The issuer must be an XRPL address that starts with r.' }
  return { ok: true, token: { currency: currencyCode(c), issuer: i } }
}
