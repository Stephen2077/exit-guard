// Constant-product AMM math (XRPL AMM uses equal weights; fee is taken from the input).

export type Pool = { token: number; xrp: number; fee: number } // fee as a fraction, e.g. 0.005

export function swapOut(inReserve: number, outReserve: number, amountIn: number, fee: number): number {
  const netInput = amountIn * (1 - fee)
  // Avoid subtracting almost-equal numbers for a small buy in a deep pool.
  return outReserve * (netInput / (inReserve + netInput))
}

const validPool = (pool: Pool) =>
  Number.isFinite(pool.token) && pool.token > 0 &&
  Number.isFinite(pool.xrp) && pool.xrp > 0 &&
  Number.isFinite(pool.fee) && pool.fee >= 0 && pool.fee < 1

// Legacy AMM spot-price impact metric. The return shape and `cost` semantics are
// retained for the policy thresholds: a fraction of the pre-trade spot value.
export function exitCost(pool: Pool, xrpIn: number) {
  const tokens = swapOut(pool.xrp, pool.token, xrpIn, pool.fee)
  const marketValue = tokens * (pool.xrp / pool.token)
  const xrpBack = swapOut(pool.token, pool.xrp, tokens, pool.fee)
  return { tokens, marketValue, xrpBack, cost: 1 - xrpBack / marketValue }
}

// Model an AMM-only buy followed by an immediate sale into the updated pool.
// The full buy input joins the XRP reserve; the buy output leaves the token
// reserve. Trading fees therefore remain in the pool. This is not an executable
// quote and excludes issuer transfer fees, ledger/network fees, order books and
// other routes.
export function roundTripQuote(pool: Pool, xrpIn: number) {
  if (!validPool(pool) || !Number.isFinite(xrpIn) || xrpIn <= 0) return null

  const tokens = swapOut(pool.xrp, pool.token, xrpIn, pool.fee)
  const xrpAfterBuy = pool.xrp + xrpIn
  const tokenAfterBuy = pool.token - tokens
  if (
    !Number.isFinite(tokens) || tokens <= 0 ||
    !Number.isFinite(xrpAfterBuy) || xrpAfterBuy <= 0 ||
    !Number.isFinite(tokenAfterBuy) || tokenAfterBuy <= 0
  ) return null

  const xrpBack = swapOut(tokenAfterBuy, xrpAfterBuy, tokens, pool.fee)
  const lossXrp = xrpIn - xrpBack
  const lossFraction = lossXrp / xrpIn
  if (!Number.isFinite(xrpBack) || !Number.isFinite(lossXrp) || !Number.isFinite(lossFraction)) return null

  return { tokens, xrpBack, lossXrp, lossFraction }
}
