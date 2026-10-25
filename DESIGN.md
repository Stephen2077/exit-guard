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
- The meta strip on the sign starts with the exact API value (`DENY`), so the page and the API use the same word.
- DENY only because no AMM pool was found: the sign says **No AMM exit.** The token may still trade on the order book, which Exit Guard does not count yet, so do not buy unless you checked the order book yourself. The API adds a `note`. The verdict stays DENY (team decision).
- A read error shows a red bar on the sign and a "Try again" button. Try again never repeats a buy.

## Lookalikes
- Picked from a search but not the most-held match → yellow warning: "You searched X. The most-held match is … with N holders. This one has M."
- Other tokens with the same code → note how many, and whether this one has the most holders.
- Either warning also puts a yellow "Possible lookalike" strip on the sign.
- Copies share a name, so a recent-check pill always shows the end of the issuer address (`RLUSD …m5De`).

## Layout
Both widths matter: the laptop (1280–1512 px) and the narrow side panel of the Claude app (about 500–600 px).
- Header, the same on every page: the logo (a link home: empty search, no result; the amount and the demo stay) and the page tabs. It sticks to the top. Page-specific status lives in the page.
- The page scrolls normally. A page switch starts at the top. Search text, results and recent checks survive page switches.
- Check page: one search bar (name + "Buy N XRP"); results drop down, most holders first (keyboard: ↑ ↓ Enter Esc; clicking the box reopens them). A "Searching the directory…" line shows while the directory answers; the page waits up to 15 s for the directory (search and token facts; the verdict never waits for it), the API up to 8 s. Recent checks are pills under the bar, one per token and network: status glyph, name, end of the issuer address (before the first check: "Try SOLO / RLUSD", off while the amount is not a number above 0). Then the board: the sign (7/12) | one details card: Token directory → Five questions · 8 checks. In windows at least 860 px tall the sign sticks while the details scroll; shorter windows scroll normally.
- Demo page: status line (testnet node, New demo wallets), the route line, then the board: the sign | one card: Five questions → Recent → Ledger receipts. The next station says Run. A done station opens its last result (it never runs again; use Reset). While a human must approve, no station runs.
- The sign's height follows its content. Its first line is one white meta strip: verdict (API word), token and amount, issuer (explorer link), network and time, set apart by space (no separator dots, so nothing is left hanging when it wraps). A yellow "Possible lookalike" strip may follow.
- The eight rules are five plain questions: Can they lock you in? (R1, R2) · Can they take it back? (R3) · How wide is the way out? (R5, R6, R4) · Is there a toll? (R7) · Is it a small buy? (R8). Each answer shows the raw ledger value it used.
- Below 900 px: one column, one header row (no "built on" mark), the route as a 3×2 grid without the line, search results on two lines. Below 480 px the tabs use short names (Check · Demo · API), so the header never scrolls or cuts off.
- The directory strip shows four numbers in a row, or 2×2 when its card is narrower than 520 px. Numbers wrap; they are never cut off.

## One system
- Radius: 4 (glyphs, tags), 8 (inputs, buttons, pills, strips, rows), 12 (sign, cards, doors).
- Type: 12 / 14 / 16 / 20 / 28 for text. Display sizes only for big words: the sign title (clamp, up to 136 px), the idle title and door words (up to 64 px), the trap title and the API page title (48 px; the API title is 36 px below 900 px).
- Spacing: multiples of 4 (mostly 8, 16, 24). Page gap 24, 16 below 900 px.

## The trap moment
Two doors: **Way in · Can still buy.** is an open green frame; **Way out · Can't sell.** is a solid red roller shutter that drops. The page itself never changes colour.

## Type and colour
- Inter Tight 800 for big words; Inter for text; JetBrains Mono only for ledger values, hashes, addresses, codes, times.
- On a coloured sign, text is 20 px bold or 24 px+ (white on brand red is 4.3:1). Small items sit on the white meta strip or white labels. Small red tags use `--red-ink`.
- No emoji. Status glyphs ✓ ! ✕ always come with fill + glyph + colour. Recent-check pills use the same boxes, plus a grey … while reading and a grey ? when the read failed.
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
