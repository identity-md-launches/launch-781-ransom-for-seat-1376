# FREE1376 — Seat #1376

Static React/TypeScript/Vite continuation of job `aadacea4-5f52-423f-966c-45b8c630b44d`. Publication name remains **free1376**, at **free1376.site.identitymd.eth** / https://free1376.site.identitymd.eth.limo. This revision makes the second ransom stay paid and uses the actual wallet record for buys, early sales, proceeds and fulfillment. No contract or token is deployed, replaced or minted.

## Install, preview and rebuild

Use Node 22+ and the unchanged manifest and lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the printed preview URL. Submit the complete **dist/** directory together with source and the existing manifest/lockfile. Vite's unchanged `base: "./"` produces relative assets; hash navigation works under static gateway subpaths. Required icons, social image and runtime licenses are bundled locally. No backend, credentials, remote font or chart library is needed.

The worker used an isolated copy at `/tmp/free1376-record` because dependency paths in this repository were protected. To reproduce that method, copy `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/`, `scripts/` and `public/` to a fresh temporary directory, run `npm ci --ignore-scripts --no-audit --no-fund` and the commands above there, then replace the repository's `dist/` with that complete export. Do not copy dependencies or caches back. The existing ignore file and its 512-byte budget are unchanged.

## Behavior

- `burnHistory.ts` binary-searches the first block from **26,139,700** where `(10^27 - totalSupply) + balanceOf(dEaD) >= H0`, then verifies that all nine balances sum to zero at that block. The paid block is published immediately, before chart sampling completes. The view uses either that block or the watch's full-burn verdict, so subsequent deposits cannot undo verified payment. Disclosures continue to show live balances.
- `walletRecord.ts` reads the wallet history once per visit and `recordVisit.ts` extends it when the watch sees his balance change. Different endpoint balances cause recursive range splitting down to adjacent blocks. Equal endpoints can conceal a sale and a later buy: transfer-log candidates are also checked against adjacent balances. If range logs fail, a complete adjacent-balance scan is used instead. Work is bounded to six simultaneous balance reads, batched in groups of three to respect the observed dRPC free-plan limit. The initial block is included by comparing with block 26,139,699.
- All past-state reads, receipt requests (`eth_getBlockReceipts`), ETH balances and quotes use **https://eth.drpc.org only**. The existing live watch and trading RPCs, CSP, configuration and dependencies are unchanged.
- A decrease's proceeds equal the wallet's ETH gain over that block plus the gas cost of **all transactions he sent** in it. Positive proceeds make a sale; zero/negative proceeds make a move. An increase is a buy only when a receipt from his own transaction contains a positive FREE1376 transfer to him. Otherwise it is a gift.
- The first decrease alone is judged by the real sell quote for `min(previous balance, M0)` at the previous block. Exactly **8.67 ETH** permits it and all later decreases. Both watch accusations and all three offer rows use this record; gifts and sampled chart peaks cannot decide them. Pending/failed records have unknown rows and no accusations.
- The MAY HE SELL status uses the live quote or an allowed first decrease. RECOUPED sums positive proceeds, displays four decimals and one linked contract row per sale block, and shows the sealed fulfillment headline only at an exact total of at least 8.67 ETH with all three rules passing. The third-act gate uses the requested new sentences and second-act link. His paid-layout watch row shows only token balance.
- The first act, letter text, chart component, all stylesheets, `chain.ts`, `wallet.ts`, transaction handlers, configuration, dependencies, public assets and CSP are preserved. The integrity script checks 29 preserved files and verifies that App/KeyAct changes are only record/gate wiring. No new CSS, palette, typography or product copy beyond the requested lines was added.

The record's unit is a **block-level balance change**, as requested: net-zero activity entirely inside one block is outside this definition. If several outgoing transactions occur in one sale block, the block's aggregate amount/proceeds link to the first matching outgoing transaction he sent (or the first matching outgoing transfer if none was sent by him). No transaction-level proceeds split is inferred. The visit extends when the polling watch observes a different balance; offsetting activity between polls is included on the next extension or reload. It uses latest-block reads, without an additional finality/reorg policy. Archive availability and latency remain external; the exhaustive fallback is slower than log-assisted discovery. Failures retain data, display existing retry text and retry on watch updates.

## Validation — 7 October 2026

Commands actually run after the final source change, with dependencies isolated outside the repository:

```sh
npm run typecheck
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-record-browsers npx --no-install playwright-core install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-record-browsers npx --no-install tsx scripts/check-record-browser.mjs
npx --no-install tsx scripts/check-mainnet.ts
npx --no-install tsx scripts/check-record-mainnet.ts
python3 scripts/check-record-preservation.py
python3 scripts/check-package.py
```

Chromium installation was performed once before browser validation. Browser and mainnet scripts use read-only requests; no transaction was signed or broadcast. The production-browser script serves the finished export at `/preview/` and closes its own server/browser. The tool browser separately inspected the live production preview.

- Typecheck and production build pass; **86/86 unit tests pass**. Coverage includes paid-search endpoints and threshold, post-burn deposits, all changed blocks including equal-endpoint cancellations, RPC-log fallback, exact previous-block quotes, subsequent sales, gifts, own buys, wrong-token/self-direction exclusions, moves, gas correction, fulfillment boundary, pending/failure states, visit persistence/retry, exact new copy, and existing trade/testament/chart tests.
- **49/49 production-browser assertions pass** in Chromium **153.0.8010.12**. Covered paid discovery after a top-up on a new visit; automatic switching; live folded balances; exact copy; record-driven gifts/buys/early/allowed sales; gas-adjusted 8.6700 ETH fulfillment; second-act linking; chart keyboard/touch; wallet chooser/Escape; buy/sell quote inputs; legacy hash routes; failed quote retention/recovery. No uncaught errors, console errors or missing local resources in the mocked run.
- Reflow passed at **320, 360, 640, 641, 768 and 1440px**. Desktop/mobile fulfilled screenshots and forced-colors focus were inspected. Live unpaid views were inspected at 1280 and 360px. Measured rendered contrast: orange/black **7.36:1**, muted/black **8.40:1**, body/black **18.33:1**. Axe reports only inherited `.skip-link` `region`/`skip-link` findings, outside the protected first-act scope.
- Live range-log queries returned HTTP 400; the balance-scan fallback completed successfully and found an empty record. Each live document load logged two handled network errors; no uncaught exception was observed. dRPC batches above three requests were rejected during development, so final code uses batches of three. The final mainnet repeat is recorded below and in `artifacts/record-mainnet.json` / `artifacts/mainnet-check.json`.
- **Final mainnet repeat:** at **15:54:35 UTC**, watch/record block **26,141,531**, the nine wallets held **0.00 FREE1376**, his wallet **12,160,406.58**, and burned **189,216,124.32**. The paid block is **26,141,482**, **7 October 2026, 15:43:59 UTC**. The record is empty; all rows pass; recouped is **0.0000 ETH**. The real capped sell quote was **1.381014157663534015 ETH**. The preceding buy check at block **26,141,530** quoted **0.001 ETH → 8,028.805469947870275562 FREE1376**; the page's exact buy calldata returned **`0x`** successfully in `eth_call`, and manifesto integrity passed. Earlier in this run, full wallets correctly showed the unchanged unpaid layout; the live browser subsequently switched to the paid layout with the verified time and zero recouped.
- Export size: **691,965 bytes**. The final conservative bundle inventory is recorded in `artifacts/package-report.json`, below the **8,388,608-byte** budget. Only current runtime chunks ship. No dependency directory, cache, package archive, registry mirror or submodule is delivered. Vite retains its existing advisory for the approximately 507 kB main chunk; protected build configuration was not changed.

See [DESIGN.md](DESIGN.md) for implemented tokens/components and [the consolidated review](artifacts/validation.md) for all six Better Interface domains, findings, fixes and limitations. Browser screenshots and compact reports are evidence of worker checks, not independent certification. Screen readers, native zoom/text enlargement, physical wallets/devices, Firefox/Safari and a post-publication hosted check were not performed.

## Publish under free1376

1. Repeat `npx --no-install tsx scripts/check-mainnet.ts` and `npx --no-install tsx scripts/check-record-mainnet.ts`; report the actual current holdings and state.
2. Submit source, the unchanged package manifest/lockfile, documentation, and **all of dist/** as the next version of **free1376.site.identitymd.eth**, name **free1376**. The IdentityMD publisher serves the committed export without rebuilding. Preserve the existing social-image alias and all relative runtime assets.
3. Verify the published first-, second- and third-act hash links, watch, record, quote and wallet chooser.

**Publication remains pending:** no publisher tool or hosting credentials are available in this environment, and this assignment prohibits modifying `.git/`. The complete source/export is prepared for the submission system to commit and publish under the same name. No Git commit, hosted deployment or onchain transaction is claimed.
