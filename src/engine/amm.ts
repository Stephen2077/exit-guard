// Constant-product AMM math (XRPL AMM uses equal weights; fee is taken from the input).

export type Pool = { token: number; xrp: number; fee: number } // fee as a fraction, e.g. 0.005

export function swapOut(inReserve: number, outReserve: number, amountIn: number, fee: number): number {
  return outReserve * (1 - inReserve / (inReserve + amountIn * (1 - fee)))
}

// If you buy with `xrpIn`, then sell those tokens into the pool as it is today,
// how much below market price would you get? `cost` is a fraction (0.22 = lose 22%).
export function exitCost(pool: Pool, xrpIn: number) {
  const tokens = swapOut(pool.xrp, pool.token, xrpIn, pool.fee)
  const marketValue = tokens * (pool.xrp / pool.token)
  const xrpBack = swapOut(pool.token, pool.xrp, tokens, pool.fee)
  return { tokens, marketValue, xrpBack, cost: 1 - xrpBack / marketValue }
}

// The largest buy (in XRP) whose exit cost stays at or under `maxCost`. Exit cost only grows with size, so search.
export function maxSafeBuy(pool: Pool, maxCost: number): number {
  if (!(pool.xrp > 0 && pool.token > 0) || exitCost(pool, 1e-9).cost > maxCost) return 0
  let lo = 0
  let hi = pool.xrp * 4
  if (exitCost(pool, hi).cost <= maxCost) return hi
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (exitCost(pool, mid).cost <= maxCost) lo = mid
    else hi = mid
  }
  return lo
}
