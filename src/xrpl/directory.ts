// Token directory from xrplmeta.org (mainnet only): names, holders, prices and its own trust level.
// This is not ledger data and never changes a verdict. The page always says where it came from.
import type { Token } from '../engine/policy'
import { currencyName } from './token'

const BASE = 'https://s1.xrplmeta.org'
const TIMEOUT_MS = 8000
const SCAN = 50 // how many closest name matches the lookalike check reads

export type DirToken = {
  currency: string
  issuer: string
  name: string
  issuerName?: string
  domain?: string
  kyc?: boolean
  trustLevel?: number // xrplmeta's own rating, 0 to 3
  icon?: string
  holders?: number
  supply?: number
  priceXrp?: number
  volume24hXrp?: number
}

type Raw = {
  currency: string
  issuer: string
  meta?: {
    token?: { name?: string; icon?: string; trust_level?: number }
    issuer?: { name?: string; domain?: string; kyc?: boolean; icon?: string; trust_level?: number }
  }
  metrics?: { holders?: number; supply?: string; price?: string; volume_24h?: string }
}

const number = (v?: string | number) => {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function toDirToken(r: Raw): DirToken {
  const t = r.meta?.token ?? {}
  const i = r.meta?.issuer ?? {}
  return {
    currency: r.currency,
    issuer: r.issuer,
    name: t.name ?? currencyName(r.currency),
    issuerName: i.name,
    domain: i.domain,
    kyc: i.kyc,
    trustLevel: t.trust_level ?? i.trust_level,
    icon: t.icon ?? i.icon,
    holders: number(r.metrics?.holders),
    supply: number(r.metrics?.supply),
    priceXrp: number(r.metrics?.price),
    volume24hXrp: number(r.metrics?.volume_24h),
  }
}

// Every directory call gives up after 8 s, so a slow directory never holds up a verdict.
const timeout = (signal?: AbortSignal) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS))

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(BASE + path, { signal: timeout(signal) })
  if (!res.ok) throw new Error(`Token directory returned ${res.status}`)
  return (await res.json()) as T
}

// Tokens whose name looks like `q`, most holders first.
export async function searchTokens(q: string, limit = 12, signal?: AbortSignal): Promise<{ count: number; tokens: DirToken[] }> {
  const d = await get<{ count: number; tokens: Raw[] }>(`/tokens?name_like=${encodeURIComponent(q)}&sort_by=holders&limit=${limit}`, signal)
  return { count: d.count, tokens: d.tokens.map(toDirToken) }
}

// The directory entry for one token, or null if the directory does not list it.
export async function tokenInfo(t: Token): Promise<DirToken | null> {
  const res = await fetch(`${BASE}/token/${encodeURIComponent(t.currency)}:${encodeURIComponent(t.issuer)}`, { signal: timeout() })
  const body = (await res.json().catch(() => null)) as (Raw & { type?: string }) | null
  // An unknown token comes back as 400 with type "entryNotFound".
  if (body?.type === 'entryNotFound') return null
  if (!res.ok || !body) throw new Error(`Token directory returned ${res.status}`)
  return toDirToken(body)
}

// Other tokens with the same code, most holders first. Impostors reuse a well-known code under a new issuer.
// Only the closest name matches are read: `scanned` of `total`.
export type Lookalikes = { same: DirToken[]; scanned: number; total: number }

export async function lookalikes(t: Token): Promise<Lookalikes> {
  const r = await searchTokens(currencyName(t.currency), SCAN)
  return { same: r.tokens.filter(x => x.currency === t.currency), scanned: r.tokens.length, total: r.count }
}

// Icons are third-party URLs: only load plain https images.
export const safeIcon = (url?: string) => (url?.startsWith('https://') ? url : undefined)
