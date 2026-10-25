# Exit Guard

Checks whether an AI agent could sell an XRPL token **before** it buys it.
A fixed rule engine returns ALLOW (buy automatically), REQUIRE_APPROVAL (a human must click), or DENY (blocked, final).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173, click **Create demo tokens** (about a minute on XRPL testnet), then use the buttons on the left.

## The six rules (`src/engine/policy.ts`)

| Rule | Checks | Result |
|---|---|---|
| R1 Frozen now | Issuer froze all trading, or froze this wallet | DENY |
| R2 Can freeze later | Issuer has not given up freezing (NoFreeze) | needs approval |
| R3 Can take tokens back | Issuer has clawback on | DENY |
| R4 Holder concentration | One other wallet holds > 50% | needs approval |
| R5 Exit cost | Selling the bought tokens into today's AMM pool loses > 5% / > 20% | approval / DENY |
| R6 Amount | Above 5 XRP | needs approval |

Any DENY is final: approval cannot override it.

## Layout

- `src/engine/` — pure rules + AMM math, unit-tested (`npm test`)
- `src/xrpl/` — reads the ledger, sends transactions, sets up the demo
- `src/ui/`, `src/App.tsx` — the page
- Use a QuickNode endpoint: put `VITE_XRPL_WS=wss://...` in `.env`
