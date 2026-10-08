# FREE1376 — Seat #1376

Continuation of **840d299f-690c-408f-aa14-45dfa61f89ff**, prepared for the same IdentityMD publication name **free1376** / **free1376.site.identitymd.eth**. This revision changes chart loading/recovery and display-read providers. The established appearance, other copy, trade behavior, `chain.ts`, `wallet.ts`, all CSS, dependencies and build configuration are preserved. CSP changes only by adding the requested providers to `connect-src`.

## Install, preview, rebuild

Use Node 22+ and the existing lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

The worker installed the unchanged manifest/lockfile into `/tmp/free1376-work`, copied source/configuration there, ran the same scripts, and copied the complete production export back. No repository dependency directory, lockfile, configuration, ignore file, or Git metadata was changed. Vite retains `base: "./"`. `dist/index.html`, all referenced assets, icons, social image and runtime licenses are delivered; no backend, external font, npm mirror or private key is needed.

## Chart and reads

- `readPools.ts` owns the seven-provider PAST and LATEST pools in the brief's exact order. Each failed attempt warns with host/method/block/error and immediately advances after an HTTP/RPC/malformed-result failure or six-second timeout. Failover sticks; the next request after ten minutes returns to the first provider. EVM reverts remain results. Historical state/headers/receipts never use PublicNode. Transaction code retains its original client.
- `readSwapMeter` reads the M0 quote, balance, slot0, ETH/USD round, total supply and block number/time in one aggregate. Below M0, it quotes the smaller amount at that same block; a zero bag has zero proceeds without a reverting zero-amount swap. LIVE and hourly history share this reader.
- LIVE discovers the newest **40 swap blocks**, plus the immediate predecessor of the oldest for impact. Startup and catch-up have independent 60-second log-failure cooldowns. Catch-up overlaps its last five blocks and stays within 2,000-block windows.
- Hourly blocks are time-interpolated between burn and latest, without header searches. The displayed time comes from the aggregate. Grid indices are `0,s,2s,…`, with the smallest positive integer `s` that leaves at most 47 historical points. New grid hours are scheduled while the page stays open. Final grid readings retain their original estimated blocks across visits.
- Both histories share four past-read slots. Each result joins its series immediately. Failed points retry at 5/10/20/40 seconds, then every 60 seconds; missing hours remain incomplete. Tape failures concern logs only; a failed historical quote leaves its impact as `—`.
- `free1376:chart:v1` is the only localStorage key. It retains the burn block, decimal-encoded readings at least 64 blocks behind the observed head, at most 40 swap-block readings and their logs, their single predecessor, and at most 47 grid readings. Access is guarded; malformed/foreign data or a different burn is discarded. Reloads expose both cached series and the receipt immediately, then confirm the burn with three parallel reads. Unfinalized or missing readings are fetched again.
- A series stays empty with **“loading…”** until its first attempts settle, or eight seconds elapse. Its first appearance and each mode switch reveal left-to-right over 900 ms (instant with reduced motion). Later entries start at the right, left, or neighbour midpoint; departures move left. Every frame is ordered by x, including interrupted motion. A settled series with no past points retains the available live head and **“Past reads are unavailable. Retrying…”**. The chart's previous connection-error paragraph is removed.

## Actual checks

Production build and TypeScript check pass. **130/130 tests pass**, including the existing regression suite; three prior tests were updated where their expectations explicitly contradicted this assignment (24→40 blocks, shared→separate cooldowns, and evenly spaced→fixed-grid hours). New tests cover animation starts/interruption/order, initial settlement/eight seconds, aggregate shape/routing, bounded concurrency, retry timing, cache/finality/invalid data, burn confirmation, hourly extension, overlap and error text.

Mainnet measurements use the production export in Chromium, direct browser RPC requests, no wallet and no mocked RPC responses. Every count below covers the same first 15 seconds. Provider columns count **all display requests**, including the unchanged wallet record; the final column isolates historical chart aggregates, including burn search/confirmation.

| Load | LIVE complete | SINCE THE BURN complete | PublicNode | dRPC | Sentio | Pocket | Chart past-state |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fresh | 1.285 s | 1.552 s | 12 | 100 | 1 | 4 | 74 |
| Reload 1 | 0.308 s | 0.122 s | 13 | 28 | 0 | 0 | 3 |
| Reload 2 | 0.283 s | 0.129 s | 13 | 28 | 0 | 0 | 3 |
| Reload 3 | 0.381 s | 0.199 s | 13 | 28 | 0 | 0 | 3 |
| Reload 4 | 0.248 s | 0.294 s | 13 | 28 | 0 | 0 | 3 |
| Reload 5 | 0.342 s | 0.142 s | 13 | 28 | 0 | 0 | 3 |

Other providers received zero requests in these windows. Both modes had 40 swap points and 17 hourly points. These are observed completion times, not future network guarantees. All five reloads met two seconds and at most ten chart past-state requests.

The fresh and first-reload captures each contain **900 animation frames over 15 seconds, zero decreasing x pairs**, and 100 chart screenshots targeted every 100 ms for the first ten seconds (largest actual inter-capture gap 106 ms). LIVE is selected initially, SINCE THE BURN at five seconds, and LIVE again at ten. Reduced motion produced the complete line with zero active chart animations.

With dRPC and PublicNode blocked by request interception **and storage cleared followed by a full reload**, LIVE completed in **1.971 s** and SINCE THE BURN in **3.288 s**. Fallbacks included Blast, Sentio and Pocket. All three acts loaded, and the expected provider warnings appeared. No page JavaScript errors occurred. Separate browser tests served this export at both `free1376.sites.imd.fun` and `free1376.eth.limo` origins by intercepting only application assets; direct mainnet reads completed at both origins. This is a CORS check, not a deployment.

Keyboard Home/End/arrows, pointer selection, both chart modes, disclosures, act navigation and wallet-chooser open/Escape passed. No horizontal overflow at 320/360/560/768/1280 px. Axe reported zero scoped WCAG A/AA violations at 320/560/1280 px. See [validation](artifacts/validation.md), [design](DESIGN.md), [browser report](artifacts/chart-browser.json), [frame summary](artifacts/chart-frame-summary.json), [100 ms screenshots](artifacts/chart-frames/), [interface review](artifacts/chart-review.json), and [preservation hashes](artifacts/preservation.json). Artifacts are delivered separately by the assignment runner, which excludes `artifacts/` from its Git staging.

Reproduce browser checks with installed Playwright/Chromium:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
CHROMIUM_PATH=/absolute/path/to/chrome-headless-shell \
node scripts/check-chart-browser.mjs

PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
AXE_MODULE=/absolute/path/to/@axe-core/playwright/dist/index.mjs \
CHROMIUM_PATH=/absolute/path/to/chrome-headless-shell \
node scripts/check-chart-review.mjs

python3 scripts/check-chart-preservation.py
python3 scripts/check-package.py
```

The supplied MCP browser could not start because its Chrome binary was absent. The checks instead used available Playwright Chromium 134 in a bounded foreground process that closed its browser and temporary preview. An ambiguous wallet-button test selector was corrected and the interaction phase rerun; this was a test harness error. No screen-reader session, physical phone, native macOS/SF Mono, native browser zoom or full cross-browser audit is claimed. The six-domain review is scoped to this revision. Vite retains its existing advisory for a JavaScript chunk above 500 kB; protected build settings were not changed.

## Publish as free1376

Submit this source, unchanged package manifest/lockfile and the complete **`dist/`** directory as the next version of **free1376.site.identitymd.eth**, publication name **free1376**. The IdentityMD publisher serves the export without rebuilding. Keep relative asset URLs and all runtime files. After publication, check `#first-act`, `#second-act`, `#third-act`, the chart switches, tape links and wallet chooser at the public URL.

The local deliverable is complete and prepared for that publisher. This worker has no publication endpoint or credentials and does not claim a new hosted version, CID or Git commit. No chain transaction or contract deployment was performed.
