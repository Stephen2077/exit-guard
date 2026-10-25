// Read everything the policy engine needs from one validated ledger. This
// module never submits transactions and never treats a failed read as safe.
import { parseAccountRootFlags, type Client } from 'xrpl'
import type { Pool } from '../engine/amm'
import type { Snapshot, SnapshotEvidence, Token } from '../engine/policy'
import { getClient, type Net } from './client'

type IssuedAmount = { currency: string; issuer: string; value: string }
type AmmAmount = string | IssuedAmount
type TrustLine = {
  account: string
  balance: string
  currency: string
  freeze?: boolean
  freeze_peer?: boolean
  // Deep-freeze fields are newer than some xrpl.js releases. Keep the
  // runtime fields here so a newer node is handled without a version lock.
  deep_freeze?: boolean
  deep_freeze_peer?: boolean
}

type LedgerRef = { ledgerHash: string; ledgerIndex: number }
type LinesPage = { lines: TrustLine[]; pages: number; complete: boolean }
type RecordValue = Record<string, unknown>

const PAGE_LIMIT = 400
const MAX_PAGES = 5

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined
  const data = isRecord(error.data) ? error.data : undefined
  const value = data?.error ?? data?.error_code ?? error.error
  return typeof value === 'string' ? value : undefined
}

function requireLedgerRef(response: unknown): LedgerRef {
  if (!isRecord(response) || !isRecord(response.result)) throw new Error('XRPL account_info returned an invalid response.')
  const result = response.result
  const ledgerHash = result.ledger_hash
  const ledgerIndex = result.ledger_index
  if (typeof ledgerHash !== 'string' || !ledgerHash || typeof ledgerIndex !== 'number' || !Number.isInteger(ledgerIndex)) {
    throw new Error('XRPL did not return a fixed validated ledger hash and index.')
  }
  if (result.validated !== true) throw new Error('XRPL account_info was not validated.')
  return { ledgerHash, ledgerIndex }
}

function checkResponseLedger(response: unknown, ledger: LedgerRef): void {
  if (!isRecord(response) || !isRecord(response.result)) throw new Error('XRPL returned an invalid response.')
  const result = response.result
  if (result.ledger_hash !== undefined && result.ledger_hash !== ledger.ledgerHash) {
    throw new Error('XRPL returned data from a different ledger hash.')
  }
  if (result.ledger_index !== undefined && result.ledger_index !== ledger.ledgerIndex) {
    throw new Error('XRPL returned data from a different ledger index.')
  }
}

function parseTrustLine(value: unknown): TrustLine {
  if (!isRecord(value) || typeof value.account !== 'string' || typeof value.currency !== 'string' || typeof value.balance !== 'string') {
    throw new Error('XRPL returned an invalid trust line.')
  }
  if (!Number.isFinite(Number(value.balance))) throw new Error('XRPL returned an invalid trust-line balance.')
  return value as TrustLine
}

async function readLines(
  client: Client,
  base: { account: string; peer?: string },
  ledger: LedgerRef,
): Promise<LinesPage> {
  const lines: TrustLine[] = []
  const markers = new Set<string>()
  let marker: unknown = undefined

  for (let page = 1; page <= MAX_PAGES; page++) {
    const request: Record<string, unknown> = {
      command: 'account_lines',
      ...base,
      ledger_hash: ledger.ledgerHash,
      limit: PAGE_LIMIT,
    }
    if (marker !== undefined) request.marker = marker

    const response = await client.request(request as never) as unknown
    checkResponseLedger(response, ledger)
    if (!isRecord(response) || !isRecord(response.result)) throw new Error('XRPL account_lines returned an invalid response.')
    const result = response.result
    if (!Array.isArray(result.lines)) throw new Error('XRPL account_lines omitted its lines array.')
    lines.push(...result.lines.map(parseTrustLine))

    if (result.marker === undefined || result.marker === null) {
      return { lines, pages: page, complete: true }
    }
    const markerKey = JSON.stringify(result.marker)
    if (markers.has(markerKey)) throw new Error('XRPL account_lines returned a repeated pagination marker.')
    markers.add(markerKey)
    marker = result.marker
  }

  // A marker after the fifth page means this is a bounded sample, not the
  // complete account. Never present its distribution as a full count.
  return { lines, pages: MAX_PAGES, complete: false }
}

function readIssuerFlags(result: RecordValue): { globalFreeze: boolean; noFreeze: boolean; clawback: boolean } {
  const parsed = isRecord(result.account_flags) ? result.account_flags : undefined
  const parsedGlobal = parsed?.globalFreeze
  const parsedNoFreeze = parsed?.noFreeze
  const parsedClawback = parsed?.allowTrustLineClawback
  if (typeof parsedGlobal === 'boolean' && typeof parsedNoFreeze === 'boolean' && typeof parsedClawback === 'boolean') {
    return { globalFreeze: parsedGlobal, noFreeze: parsedNoFreeze, clawback: parsedClawback }
  }

  // Older rippled nodes may omit account_flags but still return the raw
  // AccountRoot Flags field. Decode the documented SDK bit values rather than
  // defaulting missing values to false.
  const accountData = isRecord(result.account_data) ? result.account_data : undefined
  const rawFlags = accountData?.Flags
  if (typeof rawFlags !== 'number' || !Number.isInteger(rawFlags) || rawFlags < 0) {
    throw new Error('XRPL issuer permissions were not returned; no safety result was produced.')
  }
  const decoded = parseAccountRootFlags(rawFlags)
  return {
    globalFreeze: decoded.lsfGlobalFreeze === true,
    noFreeze: decoded.lsfNoFreeze === true,
    clawback: decoded.lsfAllowTrustLineClawback === true,
  }
}

function isIssuedAmount(value: AmmAmount): value is IssuedAmount {
  return isRecord(value) && typeof value.currency === 'string' && typeof value.issuer === 'string' && typeof value.value === 'string'
}

function sameCurrency(value: string, expected: string): boolean {
  // Hex codes are conventionally returned uppercase by rippled; comparing
  // them case-insensitively avoids rejecting a valid custom-code response.
  if (/^[0-9a-fA-F]{40}$/u.test(value) && /^[0-9a-fA-F]{40}$/u.test(expected)) {
    return value.toUpperCase() === expected.toUpperCase()
  }
  return value === expected
}

type PoolRead = { pool: Pool; account: string; lpToken: IssuedAmount; poolFrozen: boolean }

function parsePool(result: RecordValue, token: Token): PoolRead {
  const amm = result.amm
  if (!isRecord(amm)) throw new Error('XRPL returned an invalid AMM response.')
  const amount = amm.amount
  const amount2 = amm.amount2
  if (!(typeof amount === 'string' || isIssuedAmount(amount as AmmAmount)) || !(typeof amount2 === 'string' || isIssuedAmount(amount2 as AmmAmount))) {
    throw new Error('XRPL returned invalid AMM reserves.')
  }
  const amounts = [amount as AmmAmount, amount2 as AmmAmount]
  const tokenAmount = amounts.find(value => isIssuedAmount(value) && sameCurrency(value.currency, token.currency) && value.issuer === token.issuer)
  const xrpAmount = amounts.find(value => typeof value === 'string')
  if (!tokenAmount || !isIssuedAmount(tokenAmount) || xrpAmount === undefined || typeof xrpAmount !== 'string') throw new Error('AMM reserves do not match the requested token/XRP pair.')
  const tokenReserve = Number(tokenAmount.value)
  const xrpDrops = Number(xrpAmount)
  const feeUnits = amm.trading_fee
  if (!Number.isFinite(tokenReserve) || tokenReserve <= 0 || !Number.isFinite(xrpDrops) || xrpDrops <= 0 || typeof feeUnits !== 'number' || !Number.isFinite(feeUnits) || feeUnits < 0 || feeUnits > 100_000) {
    throw new Error('AMM reserves or trading fee are invalid.')
  }
  const lpToken = amm.lp_token as AmmAmount
  if (typeof amm.account !== 'string' || !amm.account || !isIssuedAmount(lpToken) || lpToken.issuer !== amm.account || !Number.isFinite(Number(lpToken.value)) || Number(lpToken.value) <= 0) {
    throw new Error('AMM account or LP token data are invalid.')
  }

  // amm_info's amount/amount2 ordering is not guaranteed. The corresponding
  // asset_frozen field follows that returned ordering, so map it to the token
  // side before deciding whether the AMM can be used for an exit quote.
  const tokenIsAmount1 = tokenAmount === amount
  const frozenFlag = tokenIsAmount1 ? amm.asset_frozen : amm.asset2_frozen
  if (frozenFlag !== undefined && typeof frozenFlag !== 'boolean') throw new Error('AMM freeze metadata is invalid.')

  return {
    pool: { token: tokenReserve, xrp: xrpDrops / 1e6, fee: feeUnits / 100_000 },
    account: amm.account,
    lpToken: lpToken as IssuedAmount,
    poolFrozen: frozenFlag === true,
  }
}

function isActNotFound(error: unknown): boolean {
  return errorCode(error) === 'actNotFound'
}

/**
 * Query one immutable validated-ledger snapshot. With no network argument this
 * uses the existing testnet client for demo compatibility. Mainnet queries
 * use the separate mainnet client and never submit transactions.
 */
export async function getSnapshot(token: Token, agent: string | null, net: Net = 'testnet'): Promise<Snapshot> {
  const client = await getClient(net)
  const queriedAt = new Date().toISOString()

  const accountInfo = await client.request({ command: 'account_info', account: token.issuer, ledger_index: 'validated' })
  const ledger = requireLedgerRef(accountInfo)
  if (!isRecord(accountInfo) || !isRecord(accountInfo.result)) throw new Error('XRPL account_info returned an invalid response.')
  const flags = readIssuerFlags(accountInfo.result)
  const accountData = isRecord(accountInfo.result.account_data) ? accountInfo.result.account_data : undefined
  const rate = accountData?.TransferRate
  if (rate !== undefined && (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0)) throw new Error('XRPL issuer transfer rate is invalid.')
  // TransferRate is stored as 1e9 = no fee, 1.25e9 = 25% fee.
  const transferFee = rate === undefined ? 0 : rate / 1e9 - 1
  if (!Number.isFinite(transferFee) || transferFee < 0) throw new Error('XRPL issuer transfer rate is invalid.')

  let pool: Pool | null = null
  let poolFrozen = false
  let ammAccount: string | null = null
  let issuerLpShare: number | null = null
  let parsedPool: PoolRead | null = null
  try {
    const ammResponse = await client.request({
      command: 'amm_info',
      asset: { currency: token.currency, issuer: token.issuer },
      asset2: { currency: 'XRP' },
      ledger_hash: ledger.ledgerHash,
    } as never) as unknown
    checkResponseLedger(ammResponse, ledger)
    if (!isRecord(ammResponse) || !isRecord(ammResponse.result)) throw new Error('XRPL returned an invalid AMM response.')
    parsedPool = parsePool(ammResponse.result, token)
    pool = parsedPool.pool
    poolFrozen = parsedPool.poolFrozen
    ammAccount = parsedPool.account
  } catch (error) {
    // Only an amm_info actNotFound means that this pair has no AMM. LP reads
    // happen below and intentionally do not pass through this catch block.
    if (!isActNotFound(error)) throw error
  }

  if (parsedPool) {
    // LP trust lines can be paginated even with a peer filter. Do not infer a
    // zero issuer share from the first page when the bounded read is incomplete.
    const lpLines = await readLines(client, { account: token.issuer, peer: parsedPool.account }, ledger)
    const held = lpLines.lines
      .filter(line => sameCurrency(line.currency, parsedPool!.lpToken.currency))
      .reduce((sum, line) => sum + Number(line.balance), 0)
    if (!Number.isFinite(held) || held < 0) throw new Error('Issuer LP balance is invalid.')
    if (!lpLines.complete && !lpLines.lines.some(line => sameCurrency(line.currency, parsedPool!.lpToken.currency))) {
      issuerLpShare = null
    } else {
      const total = Number(parsedPool.lpToken.value)
      issuerLpShare = held / total
      if (!Number.isFinite(issuerLpShare) || issuerLpShare < 0 || issuerLpShare > 1 + 1e-9) throw new Error('Issuer LP share is invalid.')
    }
  }

  const holderLines = await readLines(client, { account: token.issuer }, ledger)
  const holdings = holderLines.lines
    .filter(line => sameCurrency(line.currency, token.currency) && line.account !== ammAccount && line.account !== agent)
    .map(line => -Number(line.balance))
    .filter(balance => balance > 0)
  if (holdings.some(balance => !Number.isFinite(balance))) throw new Error('XRPL holder balance is invalid.')
  const sampledTotal = holdings.reduce((sum, balance) => sum + balance, 0)
  const top1Share = sampledTotal > 0 ? Math.max(...holdings) / sampledTotal : null

  let myLineFrozen: boolean | null = null
  let walletChecked = false
  if (agent) {
    try {
      const walletLines = await readLines(client, { account: agent, peer: token.issuer }, ledger)
      walletChecked = true
      const line = walletLines.lines.find(item => sameCurrency(item.currency, token.currency))
      if (line) {
        // Querying from the wallet's perspective means freeze_peer and
        // deep_freeze_peer are the issuer-side controls on this wallet.
        myLineFrozen = line.freeze_peer === true || line.deep_freeze_peer === true
      }
    } catch (error) {
      // An unfunded/nonexistent wallet has no trust line to inspect. It is not
      // equivalent to an unfrozen line, so preserve the unknown value.
      if (!isActNotFound(error)) throw error
    }
  }

  const evidence: SnapshotEvidence = {
    ledgerIndex: ledger.ledgerIndex,
    ledgerHash: ledger.ledgerHash,
    queriedAt,
    holderPages: holderLines.pages,
    holderLines: holderLines.lines.length,
    holdersComplete: holderLines.complete,
    walletChecked,
  }

  return {
    token,
    globalFreeze: flags.globalFreeze,
    noFreeze: flags.noFreeze,
    clawback: flags.clawback,
    myLineFrozen,
    top1Share,
    pool,
    poolFrozen,
    issuerLpShare,
    transferFee,
    evidence,
  }
}

export async function tokenBalance(account: string, token: Token): Promise<number> {
  const client = await getClient()
  try {
    const response = await client.request({ command: 'account_lines', account, peer: token.issuer, ledger_index: 'validated' })
    const result = (response as unknown as RecordValue).result
    if (!isRecord(result) || !Array.isArray(result.lines)) throw new Error('XRPL account_lines returned an invalid response.')
    const line = result.lines.find(value => isRecord(value) && value.currency === token.currency)
    return line && typeof line.balance === 'string' ? Number(line.balance) : 0
  } catch {
    // Demo compatibility: an unfunded demo wallet has no balance to sell.
    return 0
  }
}
