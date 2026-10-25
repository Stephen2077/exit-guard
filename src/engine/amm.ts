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
