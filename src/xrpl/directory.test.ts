import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeIcon, toDirToken, tokenInfo } from './directory'

describe('toDirToken', () => {
  it('reads a directory entry (SOLO, as returned by xrplmeta on 2026-10-25)', () => {
    const t = toDirToken({
      currency: '534F4C4F00000000000000000000000000000000',
      issuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz',
      meta: {
        token: { name: 'SOLO', icon: 'https://s1.xrplmeta.org/icon/C40439709A.png', trust_level: 3 },
        issuer: { name: 'Sologenic', domain: 'sologenic.com', kyc: true, trust_level: 3 },
      },
      metrics: { holders: 214720, supply: '150489644.315096', price: '0.00911000899910009', volume_24h: '1517.26333099999' },
    })
    expect(t).toMatchObject({ name: 'SOLO', issuerName: 'Sologenic', domain: 'sologenic.com', kyc: true, trustLevel: 3, holders: 214720 })
    expect(t.priceXrp).toBeCloseTo(0.00911, 5)
    expect(t.supply).toBeCloseTo(150489644.3, 0)
  })

  it('falls back to the code when the directory has no name, and drops numbers it cannot read', () => {
    const t = toDirToken({ currency: '524C555344000000000000000000000000000000', issuer: 'rLUSDv9MRcCwPdBUZCGkG4u4EtdMMA1qYM', metrics: { price: 'n/a' } })
    expect(t.name).toBe('RLUSD')
    expect(t.holders).toBeUndefined()
    expect(t.priceXrp).toBeUndefined()
  })
})

describe('tokenInfo', () => {
  afterEach(() => vi.unstubAllGlobals())
  const token = { currency: 'XYZ', issuer: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp' }
  const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

  it('returns null for a token the directory does not list (HTTP 400, entryNotFound)', async () => {
    reply(400, { type: 'entryNotFound', message: "The token 'XYZ' does not exist." })
    await expect(tokenInfo(token)).resolves.toBeNull()
  })

  it('throws when the directory itself fails', async () => {
    reply(500, { message: 'down' })
    await expect(tokenInfo(token)).rejects.toThrow('Token directory returned 500')
  })
})

describe('safeIcon', () => {
  it('only lets https images through', () => {
    expect(safeIcon('https://s1.xrplmeta.org/icon/A.png')).toBe('https://s1.xrplmeta.org/icon/A.png')
    expect(safeIcon('http://tracker.example/x.png')).toBeUndefined()
    expect(safeIcon('javascript:alert(1)')).toBeUndefined()
    expect(safeIcon(undefined)).toBeUndefined()
  })
})
