import { describe, expect, it, vi } from 'vitest'
import { checkFromQuery, searchFromQuery } from './check'
import { getSnapshot } from '../xrpl/snapshot'
import type { Snapshot } from '../engine/policy'

vi.mock('../xrpl/snapshot', () => ({ getSnapshot: vi.fn() }))

// Input checks only: every case below is answered before any network call.
const ask = (query: string) => checkFromQuery(new URLSearchParams(query))
const RLUSD = 'currency=RLUSD&issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'

describe('/api/check input', () => {
  it('rejects an unknown network', async () => {
    expect(await ask(`${RLUSD}&net=devnet`)).toMatchObject({ status: 400 })
  })

  it('rejects a bad issuer or code', async () => {
    expect(await ask('currency=RLUSD&issuer=bad')).toMatchObject({ status: 400 })
    expect(await ask('currency=XRP&issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De')).toMatchObject({ status: 400 })
  })

  it('rejects amounts that are not a positive number', async () => {
    for (const amount of ['0', '-2', 'abc', 'Infinity']) expect(await ask(`${RLUSD}&amount=${amount}`)).toMatchObject({ status: 400 })
  })

  it('rejects a malformed optional wallet before reading the ledger', async () => {
    expect(await ask(`${RLUSD}&wallet=bad`)).toMatchObject({ status: 400 })
  })
})

describe('/api/check evidence', () => {
  const snapshot: Snapshot = {
    token: { currency: 'USD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' },
    globalFreeze: false, noFreeze: true, clawback: false, myLineFrozen: null,
    top1Share: 0.2, pool: { xrp: 50, token: 5000, fee: 0.005 }, issuerLpShare: 0, transferFee: 0,
    evidence: { ledgerIndex: 123, ledgerHash: 'abc', queriedAt: '2026-10-25T00:00:00Z', holderLines: 2, holderPages: 1, holdersComplete: false, walletChecked: false },
  }

  it('returns ledger evidence and an explicitly separate AMM model', async () => {
    vi.mocked(getSnapshot).mockResolvedValueOnce(snapshot)
    const reply = await ask(`${RLUSD}&net=testnet`)
    expect(reply).toMatchObject({ status: 200, body: { evidence: snapshot.evidence, wallet: null, ammRoundTrip: { tokens: expect.any(Number), xrpBack: expect.any(Number) } } })
  })

  it('suppresses the model when a freeze prevents a usable sale', async () => {
    vi.mocked(getSnapshot).mockResolvedValueOnce({ ...snapshot, poolFrozen: true })
    expect(await ask(`${RLUSD}&net=testnet`)).toMatchObject({ status: 200, body: { outcome: 'DENY', ammRoundTrip: null } })
  })

  it('returns a read error without a safety decision when the node fails', async () => {
    vi.mocked(getSnapshot).mockRejectedValueOnce(new Error('network unavailable'))
    const reply = await ask(`${RLUSD}&net=testnet`)
    expect(reply).toEqual({ status: 502, body: { error: 'network unavailable' } })
  })
})

describe('/api/search input', () => {
  it('asks for a name', async () => {
    expect(await searchFromQuery(new URLSearchParams(''))).toMatchObject({ status: 400 })
  })
})
