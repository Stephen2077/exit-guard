# Exit Guard

Checks whether an AI agent could sell an XRPL token **before** it buys it.
A fixed rule engine returns ALLOW (no current rule blocks the amount), REQUIRE_APPROVAL (review risks or missing data), or DENY (blocked, final). The query page and API are read-only; none of these outcomes guarantees a future sale.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. Three pages:

- **Check a token** (default): search a mainnet token by name, pick it, see the verdict. Read-only. Names, holders and prices come from the xrplmeta.org directory and are labelled; the verdict comes from the ledger. "Have an issuer address?" checks an exact issuer on mainnet or testnet.
- **Agent demo** (`#demo`): click **Create demo tokens** (about a minute on XRPL testnet), then follow the route line.
- **API** (`#api`): for AI agents, served by the dev server:

```bash
curl "http://localhost:5173/api/check?currency=RLUSD&issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De&amount=2&net=mainnet"
```

```bash
curl "http://localhost:5173/api/search?q=SOLO"
```

The first design is still at `?v=1`.

## Query evidence and estimates

The query form and `/api/check` accept an optional `wallet` public classic address. This checks that wallet's trust line on the selected network. Without a wallet, or without a matching trust line, wallet-specific freeze status stays unknown. No seed, connection or signing permission is needed.

All issuer, pool and trust-line reads use one validated ledger hash. The report and JSON include its index, hash, query time and holder-page coverage. Reads stop at five pages of up to 400 trust lines; remaining pages are explicitly marked as a partial sample. Holder percentages describe included positive balances read, excluding the AMM and optional wallet, not a share of total issued supply.

The AMM round-trip model buys with the selected XRP amount, updates the reserves including retained pool fees, then sells back into that changed pool. R5 is a separate metric: sell price impact against the original pool's spot price. Neither is an executable quote. The model excludes issuer transfer charges, network fees, rounding, order-book liquidity, other routes and other traders. Detected freezes suppress the round-trip estimate. A missing AMM means insufficient coverage; it does not prove a token cannot trade elsewhere.

Node failures return an error rather than a safety result. Issuer authorization requirements and liquidity-provider concentration beyond the issuer remain outside these checks.

## The eight rules (`src/engine/policy.ts`)

| Rule | Checks | Result |
|---|---|---|
| R1 Frozen now | Issuer froze all trading, or froze this wallet | DENY |
| R2 Can freeze later | Issuer has not given up freezing (NoFreeze) | needs approval |
| R3 Can take tokens back | Issuer has clawback on | DENY |
| R4 Holder concentration | Largest included wallet > 50% of balances read, or coverage incomplete/unknown | needs approval |
| R5 AMM sell price impact | Sale into original pool > 5% / > 20% below spot; missing/frozen AMM cannot be cleared | approval / DENY |
| R6 Can pull the pool | Issuer owns > 50% of the AMM pool (LP tokens) | needs approval |
| R7 Transfer rate | Additional token transfer rate > 1% / > 10%; direct issuer transfers exempt | approval / DENY |
| R8 Amount | Above 5 XRP | needs approval |

Any DENY is final: approval cannot override it.

## Layout

- `src/engine/` — pure rules + AMM math, unit-tested (`npm test`)
- `src/xrpl/` — reads the ledger (testnet and mainnet), sends testnet transactions, sets up the demo, token codes, the token directory
- `src/exit/` — the pages (design rules in `DESIGN.md`)
- `src/api/check.ts` — `/api/check` and `/api/search`, wired into the dev server in `vite.config.ts`
- `src/ui/`, `src/App.tsx` — the first design (`?v=1`)
- Use a QuickNode endpoint: put `VITE_XRPL_WS=wss://...` in `.env`

Validate with `npm test` and `npm run build`. Live node queries are separate from mocked unit tests. API semantics: [account_lines](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_lines), [amm_info](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/amm_info), [Transfer Fees](https://xrpl.org/docs/concepts/tokens/fungible-tokens/transfer-fees).
