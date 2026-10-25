// Turn what a person types into an XRPL token, and back. Pure: no network.
import { isValidClassicAddress } from 'xrpl'
import type { Token } from '../engine/policy'

const HEX40 = /^[0-9A-Fa-f]{40}$/

export function validateWallet(input: string): string | null {
  const wallet = input.trim()
  if (!wallet) return null
  if (!isValidClassicAddress(wallet)) throw new Error('Wallet must be a public XRPL classic address starting with r.')
  return wallet
}

// 3-character codes are stored as-is. Longer codes (like RLUSD) are stored as 40 hex characters: ASCII, zero-padded.
export function currencyCode(input: string): string {
  const s = input.trim()
  if (HEX40.test(s)) {
    const hex = s.toUpperCase()
    if (/^0{24}[0-9A-F]{6}0{10}$/.test(hex)) {
      const standard = String.fromCharCode(...[24, 26, 28].map(offset => parseInt(hex.slice(offset, offset + 2), 16)))
      if (/^[A-Za-z0-9?!@#$%^&*(){}\[\]|]{3}$/.test(standard)) return standard
    }
    return hex
  }
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
  const currency = currencyCode(c)
  if (currency.toUpperCase() === 'XRP' || /^5852500{34}$/i.test(currency)) return { ok: false, error: 'XRP is the native coin, not an issued token.' }
  return { ok: true, token: { currency, issuer: i } }
}
