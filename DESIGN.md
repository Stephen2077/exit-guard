# Exit Guard design rules

Read this before you change the UI. The current design lives in `src/exit/` (styles: `src/exit/exit.css`).
The first design is kept as a fallback at `?v=1` (`src/App.tsx`, `src/ui/`, `src/styles.css`). Do not mix the two stylesheets.

## What it is
A tool we use ourselves first: **check if a token can be sold before you buy it.** The demo and the pitch come last.

Three pages (tabs in the header, kept in the URL hash):
1. **Check a token** (`#check`, default). Search by name → pick → verdict. Mainnet, read-only. "Have an issuer address?" checks an exact issuer on mainnet or testnet.
2. **Agent demo** (`#demo`). The testnet script: set up → safe buy → big buy (approval) → scam token → the trap (no guard) → reset.
3. **API** (`#api`). `/api/check` and `/api/search` for AI agents, with a "Try it" button. Served by the dev server (`npm run dev`).

## Where the data comes from
- **Verdict: the ledger.** `getSnapshot` reads the issuer, its AMM pool and its trust lines; the unchanged rule engine decides.
- **Names, holders, prices, trust level, lookalikes: the xrplmeta.org directory.** Always labelled as such. It never changes the verdict.
- An issuer sets its own domain, so a domain is shown as a claim ("says ripple.com"), never as proof.

## The one idea
Everything answers one question: **is there a way out?** The verdict is an exit sign.

| Verdict (API value) | Sign | Colour | Text |
|---|---|---|---|
| ALLOW | Exit open. | `--green` #21e46b | ink |
| REQUIRE_APPROVAL | Exit narrow. | `--yellow` #dbf15e | ink |
| DENY | No exit. | `--red` #da4518 | white |
| idle / reading / error | (unlit sign) | `--ink` #141414 | white |

- The sign title is the largest text on the page. Under it: one sentence that is true for every case of that verdict, the reasons (failures for DENY, warnings for approval, main passes for ALLOW), and a status line with a rule above it.
- The first chip on the sign is the exact API value (`DENY`), so the page and the API use the same word.
- DENY only because no AMM pool was found: the sign says **No AMM exit.** and that order books are not counted yet. The API adds a `note`. The verdict stays DENY (team decision).
- A read error shows a red bar on the sign and a "Try again" button. Try again never repeats a buy.

## Lookalikes
- Picked from a search but not the most-held match → yellow warning: "You searched X. The most-held match is … with N holders. This one has M."
- Other tokens with the same code → note how many, and whether this one has the most holders.
- Either warning also puts a "Possible lookalike" chip on the sign.

## Layout (laptop, 1280–1512 px)
- Header: brand, page tabs, what the page reads (mainnet, or the testnet demo status).
- Check page: big search box with "Buy with N XRP"; results drop down, most holders first (keyboard: ↑ ↓ Enter Esc). Below: sign (7/12) | side (5/12): Token directory → Five questions · 8 checks → Recent.
- Demo page: route line on top. The next station says Run. A done station opens its last result (it never runs again; use Reset). While a human must approve, no station runs.
- The eight rules are five plain questions: Can they lock you in? (R1, R2) · Can they take it back? (R3) · How wide is the way out? (R5, R6, R4) · Is there a toll? (R7) · Is it a small buy? (R8). Each answer shows the raw ledger value it used.
- Below 1100 px: one column.

## The trap moment
Two doors: **Way in · Can still buy.** is an open green frame; **Way out · Can't sell.** is a solid red roller shutter that drops. The page itself never changes colour.

## Type and colour
- Inter Tight 800 for big words; Inter for text; JetBrains Mono only for ledger values, hashes, addresses, codes, times.
- On a coloured sign, text is 20 px bold or 24 px+ (white on brand red is 4.3:1). Small items sit on white chips. Small red tags use `--red-ink`.
- No emoji. Status glyphs ✓ ! ✕ always come with fill + glyph + colour.
- No drop shadows or gradients (except the shutter slats). Inset rules and 1–2 px outlines are fine.

## Motion
- Plays only when a result first arrives (`.fresh`, 1.5 s). Opening an old result does not replay it.
- In: ease-out `cubic-bezier(0.23, 1, 0.32, 1)`. The shutter drops with ease-in `cubic-bezier(0.6, 0, 0.9, 0.35)`, 380 ms, by translateY.
- Title 280 ms; reasons and answers 220 ms, 50 ms apart; receipts 260 ms.
- `prefers-reduced-motion`: no movement; colours still change.

## Copy
- Plain words first, codes second: "Failed: no balance it can use" with `tecUNFUNDED_OFFER` next to it.
- Real data only. Known limits are said on screen: holders come from the first 400 trust lines; exit cost reads AMM pools only (order books are not counted yet).

Sources: the three mockups in `design/` (A Report, B Exit, C Checkpoint; B was chosen), two outside design reviews, Anthropic frontend-design skill, taste-skill, impeccable, emilkowalski/skills, LottieFiles motion-design-skill, claude-motion, the anti-slop prompt (@RoundtableSpace), awesome-design-md, the dqnamo receipt printer.
