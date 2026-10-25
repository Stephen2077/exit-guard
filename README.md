# Exit Guard

Checks whether an AI agent could sell an XRPL token **before** it buys it.
A fixed rule engine returns ALLOW (buy automatically), REQUIRE_APPROVAL (a human must click), or DENY (blocked, final).

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

## The eight rules (`src/engine/policy.ts`)

| Rule | Checks | Result |
|---|---|---|
| R1 Frozen now | Issuer froze all trading, or froze this wallet | DENY |
| R2 Can freeze later | Issuer has not given up freezing (NoFreeze) | needs approval |
| R3 Can take tokens back | Issuer has clawback on | DENY |
| R4 Holder concentration | One other wallet holds > 50% | needs approval |
| R5 Exit cost | Selling the bought tokens into today's AMM pool loses > 5% / > 20% | approval / DENY |
| R6 Can pull the pool | Issuer owns > 50% of the AMM pool (LP tokens) | needs approval |
| R7 Transfer fee | Issuer takes > 1% / > 10% of every sale (TransferRate) | approval / DENY |
| R8 Amount | Above 5 XRP | needs approval |

Any DENY is final: approval cannot override it.

## Layout

- `src/engine/` — pure rules + AMM math, unit-tested (`npm test`)
- `src/xrpl/` — reads the ledger (testnet and mainnet), sends testnet transactions, sets up the demo, token codes, the token directory
- `src/exit/` — the pages (design rules in `DESIGN.md`)
- `src/api/check.ts` — `/api/check` and `/api/search`, wired into the dev server in `vite.config.ts`
- `src/ui/`, `src/App.tsx` — the first design (`?v=1`)
- Use a QuickNode endpoint: put `VITE_XRPL_WS=wss://...` in `.env`
