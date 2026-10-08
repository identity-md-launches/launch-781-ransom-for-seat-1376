# FREE1376 — Seat #1376

Continuation of job **0f08a383-7c4c-489b-86df-94a0e5cc8b21**, prepared for the same publication name **free1376** at **free1376.site.identitymd.eth** / https://free1376.site.identitymd.eth.limo.

This revision replaces MAY HE SELL and CHART in the paid second act and adds EVERY SWAP. It adds rolling quote/market-cap values, direction feedback, the striped gradient meter, the once-per-visit unlock celebration, LIVE and SINCE THE BURN chart modes, and a seven-transaction tape. Native chart buttons, keyboard/hover/tap detail, responsive layouts and reduced motion are supported.

The offer rows, RECOUPED, watch, wallet record, letter, other acts, transaction logic, CSP, dependencies and build configuration retain their parent bytes. Existing source changes are limited to two integration points: `PaidSecondAct.tsx` renders the new sections; `App.tsx` imports their stylesheet and a history-only replacement for the old paid reader. The replacement keeps the same payment search/hourly history and removes the superseded 15-second archive quote polling. All new behavior is in new files. The old exported components/readers remain available to the unchanged regression tests. No contract is deployed or changed.

## Install, preview, rebuild

Use Node 22+ and the existing lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Vite's unchanged `base: "./"` produces relative assets. `dist/` is the complete static export, including the original icons, social image and runtime license. No backend or remote fonts are required.

The worker respected protected repository dependency paths by copying the existing manifest, lockfile, configuration, source, scripts and public assets to `/tmp/free1376-live`, running `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/free1376-live-cache` there, and copying the finished export back. Dependencies and browser caches are not deliverables. The ignore file is unchanged.

## Data and behavior

`swapReads.ts` polls only **ethereum-rpc.publicnode.com** for the head and recent pool logs. `swapVisit.ts` requests the head every four seconds, catches up log ranges without gaps, and refreshes the market on swaps or a 60-second heartbeat. A preliminary `balanceOf` encodes `min(balance, M0)` into the real quoter input. One Multicall3 at `latest` reads that quote, slot0, Chainlink, total supply, a confirming balance, and the actual block/time. A balance race rejects the reading rather than displaying an oversized quote. Zero balances skip the zero-input quoter simulation and yield zero proceeds.

Startup scans the last 10,000 blocks, newest first in 2,000-block windows, stopping after finding 24 swap blocks. Historical market aggregates use **eth.drpc.org**, with three concurrent jobs and one additional baseline at the block before the oldest swap block. The capped balance is read at each historical block too. History, timestamps, live polling and the existing wallet record can finish independently. Unknown impacts show a dash; an unsuccessful quote retains the last good values and retries. A failed intermediate block never turns the following swap's impact into a fabricated cumulative delta.

BUY means `amount0 < 0`; SELL means `amount0 > 0`. ETH and FREE1376 are the absolute event amounts, without a second fee adjustment. Impact is the change in percentage points across the whole block; its final swap carries the change and earlier swaps show zero. Consequently, a BUY can display a negative impact if a larger SELL occurred earlier in the same block. The tape sorts by block and log index, keeps seven rows, and updates ages once per second. LIVE keeps up to 40 unique swap-block points; SINCE THE BURN retains the existing hourly samples and detail.

Permission remains the exact 8.67 ETH comparison or the wallet record's allowed first decrease. Historical chart points never grant permission. The first live upward crossing triggers the burst once per document visit, never from initial or historical data. Reduced motion disables reels, gliding, pulsing, stripes, chips, burst and shake. Animation frames are local to the chart; tape ages are local to the tape. The explicitly requested 600 ms page shake is a compositor animation and does not re-render App.

## Validation and reproducibility

Actual checks, screenshots, six-domain design review and limitations are recorded in [artifacts/validation.md](artifacts/validation.md). The final source's design system is in [DESIGN.md](DESIGN.md). Final results: **107/107 unit tests**, **52/52 production-browser checks**, clean typecheck/build, real mainnet quote equality and successful buy/sell/pumped-crossing fork checks. The static export is **716,073 bytes**.

```sh
npm run typecheck
npm test
npm run build
npx --no-install tsx scripts/check-swap-browser.mjs
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/check-swap-mainnet.ts
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/check-swap-live-browser.mjs
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/check-swap-fork.mjs
python3 scripts/check-swap-preservation.py
python3 scripts/check-package.py
```

Browser scripts manage their own temporary static server and close it and Chromium before exiting. Set `CHROMIUM_PATH` to a compatible Chromium executable if the documented worker default is unavailable. On this worker, use `/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell`. The supplied browser MCP returned `Transport closed`; local Playwright/Chromium inspected the real export under `/preview/` instead. The full Chrome executable's crashpad failed in the sandbox, so the installed headless-shell executable was used.

The fork script requires Anvil. It starts an isolated, loopback-only mainnet fork with **zero generated accounts**, impersonates the existing public holder locally, and funds it only on the fork. It sends no mainnet transaction, uses no key, deploys nothing, disables fork caching, and closes its subprocess. It performs a real buy and sell through the unchanged Universal Router calldata builder, then buys until the real capped quote crosses 100%. Browser RPC interception directs post-fork state to that local node and keeps pre-fork history on the specified real public providers.

Mainnet evidence at block **26,145,223**: the 12,160,406.576973525384826126-token capped quote was **0.662093327098172650 ETH**, or **7.636601235273041%**. A separate direct quoter call at that block matched exactly. The real browser tape loaded seven actual transaction hashes, sides and amounts, including new swaps arriving after that first observation. See [the initial snapshot](artifacts/swap-mainnet-initial.json), [the final repeat](artifacts/swap-mainnet.json) and [swap-live-browser.json](artifacts/swap-live-browser.json). These are timestamped observations, not permanently current values.

Etherscan's transaction pages returned a challenge page from curl and were inaccessible through the web tool. Direct visual comparison against Etherscan remains unverified; RPC logs, exact transaction links, the production tape and direct real quotes were checked. Public RPC availability, recent chain reorganizations, physical-device/assistive-technology testing and post-publication behavior remain practical limitations. No claim of independent certification is made.

## Publish as free1376

Submit the source, unchanged manifest/lockfile, documentation and complete `dist/` export to the IdentityMD publisher as the next version of **free1376.site.identitymd.eth**, name **free1376**. The publisher serves the committed export without rebuilding. Preserve relative assets and existing public images/licenses. After publication, check `#first-act`, `#second-act`, `#third-act`, both chart modes, tape links and the wallet chooser at the hosted URL.

**Publication pending:** this environment exposes no publisher capability, and the assignment prohibits `.git/` writes. The source and export are ready for the network's submission/publishing step; no Git commit, new IPFS CID or hosted update is claimed.
