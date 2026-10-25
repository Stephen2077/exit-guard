# Exit Guard

Checks whether an AI agent could sell an XRPL token **before** it buys it.
A fixed rule engine returns ALLOW (buy automatically), REQUIRE_APPROVAL (a human must click), or DENY (blocked, final).

## Run

```bash
npm install
npm run dev
```

Put the model keys in `.env` (git-ignored, read by the dev server only, never sent to the page):

```bash
ANTHROPIC_API_KEY=...
AI_GATEWAY_API_KEY=...
JEV_MODEL=typesafe-ai/jev-1.14.0
```

Open http://localhost:5173. Two pages:

- **Check a token** (default): one box. Type a token name, an issuer address, `CODE.rIssuer`, or an instruction like "buy 50 XRP of SOLO". The page shows who decided what: Claude reads the words, Jev (a decision model) picks the intent and the token among copies, and the eight rules have the final say. Mainnet, read-only.
- **Connect your agent** (`#connect`): the same thing for agents.

```bash
curl -X POST http://localhost:5173/api/agent -H 'Content-Type: application/json' -d '{"text": "buy 50 XRP of SOLO"}'
```

```bash
claude mcp add --transport http exit-guard http://localhost:5173/mcp
```

`/api/check` and `/api/search` still work as before. Design preview with sample data: `?state=empty|checking|allow|approval|deny|choose`. Earlier designs: `?v=2` (with the testnet agent demo) and `?v=1`.

### Who decides what

1. Exact forms (issuer address, `CODE.rIssuer`, one name) are parsed without a model. Anything else: Claude Sonnet 5.5 extracts intent, token and amount as JSON.
2. Jev picks the intent (check / buy / what if). When several tokens share a name, Jev picks one; under 0.8 confidence a person picks.
3. The rules decide ALLOW / REQUIRE_APPROVAL / DENY from ledger data. A DENY is final; no model can override it.
4. Only on REQUIRE_APPROVAL, Jev says go ahead / ask a human / give up. Under 0.5 confidence it is always "ask a human".
5. "Max safe buy" is computed from the AMM pool: the largest buy that keeps exit cost under 5%.

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
