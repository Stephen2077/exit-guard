import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client } from 'xrpl'
import { getClient } from './client'
import { getSnapshot } from './snapshot'

vi.mock('./client', () => ({
  getClient: vi.fn(),
}))

const issuer = 'rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn'
const agent = 'r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59'
const token = { currency: 'USD', issuer }
const ledger = { ledger_hash: 'ABCDEF', ledger_index: 123, validated: true }

const accountInfo = () => ({
  result: {
    ...ledger,
    account_data: { Flags: 0, TransferRate: 1_000_000_000 },
    account_flags: { globalFreeze: false, noFreeze: false, allowTrustLineClawback: false },
  },
})

const noPool = () => Object.assign(new Error('no AMM'), { data: { error: 'actNotFound' } })
const lines = (value: Array<Record<string, unknown>>, marker?: unknown) => ({
  result: { ...ledger, lines: value, ...(marker === undefined ? {} : { marker }) },
})
const line = (account: string, balance: string, extra: Record<string, unknown> = {}) => ({ account, balance, currency: 'USD', ...extra })

function mockClient(results: Array<unknown>) {
  const request = vi.fn(async (_request: Record<string, unknown>) => {
    const next = results.shift()
    if (next instanceof Error) throw next
    return next
  })
  const client = { request } as unknown as Client
  vi.mocked(getClient).mockResolvedValue(client)
  return request
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getSnapshot', () => {
  it('requires explicit validation evidence before producing a report', async () => {
    const info = accountInfo()
    mockClient([{ result: { ...info.result, validated: undefined } }])
    await expect(getSnapshot(token, null)).rejects.toThrow('not validated')
  })

  it('checks the issuer freeze on a wallet trust line, including later pages', async () => {
    mockClient([
      accountInfo(), noPool(), lines([line('rOther', '-50')]),
      lines([line(issuer, '1', { currency: 'EUR' })], 'wallet-next'),
      lines([line(issuer, '5', { freeze_peer: true })]),
    ])
    expect((await getSnapshot(token, agent)).myLineFrozen).toBe(true)
  })

  it('maps AMM freeze flags to the returned token side and reads issuer LP holdings', async () => {
    mockClient([
      accountInfo(),
      { result: { ...ledger, amm: {
        account: 'rAmm', amount: '50000000', amount2: { ...token, value: '5000' },
        lp_token: { currency: 'LP', issuer: 'rAmm', value: '100' },
        trading_fee: 500, asset2_frozen: true,
      } } },
      lines([line('rAmm', '25', { currency: 'LP' })]),
      lines([line('rOther', '-100')]),
    ])
    const snapshot = await getSnapshot(token, null)
    expect(snapshot.poolFrozen).toBe(true)
    expect(snapshot.issuerLpShare).toBe(0.25)
    expect(snapshot.pool).toEqual({ xrp: 50, token: 5000, fee: 0.005 })
  })

  it('uses one ledger hash across paged holder and wallet reads, and keeps a missing line unknown', async () => {
    const request = mockClient([
      accountInfo(),
      noPool(),
      lines([line(agent, '-100'), line('rOther', '-50')], 'holder-page-2'),
      lines([line('rThird', '-25')]),
      lines([]), // Agent has no trust line: this is not proof of being unfrozen.
    ])

    const snapshot = await getSnapshot(token, agent, 'mainnet')
    expect(snapshot.pool).toBeNull()
    expect(snapshot.myLineFrozen).toBeNull()
    expect(snapshot.evidence).toMatchObject({
      ledgerIndex: 123,
      ledgerHash: 'ABCDEF',
      holderPages: 2,
      holderLines: 3,
      holdersComplete: true,
      walletChecked: true,
    })
    expect(snapshot.top1Share).toBeCloseTo(50 / 75)
    expect(vi.mocked(getClient)).toHaveBeenCalledWith('mainnet')

    const requests = request.mock.calls.map(([value]) => value as Record<string, unknown>)
    expect(requests[0]).not.toHaveProperty('ledger_hash')
    expect(requests.slice(2).every(value => value.ledger_hash === 'ABCDEF')).toBe(true)
    expect(requests.filter(value => value.command === 'account_lines').every(value => value.limit === 400)).toBe(true)
    expect(requests.find(value => value.marker === 'holder-page-2')).toMatchObject({ ledger_hash: 'ABCDEF', marker: 'holder-page-2' })
  })

  it('marks the holder sample incomplete after five pages instead of claiming a full distribution', async () => {
    const pages: unknown[] = [accountInfo(), noPool()]
    for (let i = 1; i <= 5; i++) pages.push(lines([line(`rHolder${i}`, `-${i}`)], `marker-${i}`))
    const request = mockClient(pages)
    const snapshot = await getSnapshot(token, null)

    expect(snapshot.evidence).toMatchObject({ holderPages: 5, holderLines: 5, holdersComplete: false, walletChecked: false })
    expect(request).toHaveBeenCalledTimes(7)
    expect(request.mock.calls.slice(2).every(([value]) => (value as Record<string, unknown>).ledger_hash === 'ABCDEF')).toBe(true)
  })

  it('propagates network errors instead of converting them into a no-pool result', async () => {
    mockClient([accountInfo(), new Error('socket timeout')])
    await expect(getSnapshot(token, null)).rejects.toThrow('socket timeout')
  })

  it('does not swallow an actNotFound from the issuer LP trust-line read', async () => {
    mockClient([
      accountInfo(),
      {
        result: {
          ...ledger,
          amm: {
            account: 'rAmmAccount',
            amount: { currency: 'USD', issuer, value: '1000' },
            amount2: '1000000',
            lp_token: { currency: 'LP', issuer: 'rAmmAccount', value: '100' },
            trading_fee: 500,
            asset_frozen: false,
          },
        },
      },
      Object.assign(new Error('issuer lines not found'), { data: { error: 'actNotFound' } }),
    ])
    await expect(getSnapshot(token, null)).rejects.toMatchObject({ data: { error: 'actNotFound' } })
  })

  it('treats a nonexistent wallet as unknown and not as an unfrozen line', async () => {
    mockClient([
      accountInfo(),
      noPool(),
      lines([]),
      Object.assign(new Error('wallet not found'), { data: { error: 'actNotFound' } }),
    ])
    const snapshot = await getSnapshot(token, agent)
    expect(snapshot.myLineFrozen).toBeNull()
    expect(snapshot.evidence?.walletChecked).toBe(false)
  })
})
