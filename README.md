# FREE1376 — Seat #1376

Static React/TypeScript/Vite website, continuing job `c15f5d1a-158b-48b3-ac1a-f8442572b7d0`. Publication name remains **free1376**, hosted as **free1376.site.identitymd.eth** at https://free1376.site.identitymd.eth.limo. This revision opens the second act. No contract or token is deployed, replaced or minted.

## Install, preview and rebuild

Use Node 22+ with the existing, unchanged package manifest and lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the URL printed by Vite. Publish the entire `dist/`, including `dist/index.html`, hashed JavaScript/CSS, icons, social image and runtime licenses. The export uses relative asset URLs (`base: "./"`) and hash navigation, so it works below a static gateway subpath. System monospace fonts need no downloads. No backend or private credentials are used.

For this restricted workspace, use an isolated build directory under `/tmp`: copy the unchanged `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/`, `scripts/` and `public/` there. Run `npm ci --cache /tmp/free1376-npm-cache --ignore-scripts --no-audit --no-fund` there, followed by the commands above. Copy its complete `dist/` back, removing obsolete chunks. Successful build/validation here used `/tmp/free1376-second-act`; browser downloads and npm cache stayed under `/tmp`. An initial workspace install failed because the default npm cache is read-only; no dependency or configuration change was needed. Generated dependency/cache directories are excluded at every nesting level by the unchanged ignore file (existing explicit budget: 512 bytes).

## Implemented revision

- `src/letter.ts` contains the exact letter. `src/SecondAct.tsx` renders its paragraphs and semantic numbered rules immediately, with nine full Etherscan links and live balances, the main-wallet link, the specified dead-address link, and the unchanged creator hint. It reuses the opened testament's measure, type and orange rail; the second-act sealed mark is removed.
- `src/watch.ts` reads all eleven `balanceOf` values, `totalSupply`, the existing pool's `getSlot0`, and the same Chainlink ETH/USD feed as the first act. Every read in a refresh uses one block. The existing public RPC fallback is reused: `https://ethereum-rpc.publicnode.com` and `https://eth.drpc.org`. `src/useWatch.ts` mounts in App, so polling continues every 15 seconds on every act. Overlapping refreshes are skipped. No wallet connection is needed.
- The watch uses exactly `H0 = 189216124316902036478811955`, `S0 = 10^27`, `M0 = 12160406576973525384826126`, and deadline `1791392400`. Burned tokens equal `S0 − totalSupply + dead balance`. Every verdict comparison uses `bigint` wei. The early-sale comparison uses the exact pool-price ratio against `8.67 ETH`, before display rounding. Every applicable verdict is shown.
- The countdown refreshes each second, showing whole hours/minutes and switching at the exact deadline. Token displays round to two decimals, ETH to six, dollars to whole dollars. The original eight-decimal Chainlink answer and pool square-root price remain exact for calculations. Invalid/incomplete/stale Chainlink rounds follow the first act's three-hour freshness rule and reject the refresh.
- Before the first complete live snapshot, balances show `—` and there is no assumed verdict. Any failed refresh retains the entire last snapshot and shows `Live reads are unavailable. Retrying…`; the next successful poll clears it. No initial holdings, price or verdict are presented as live without reading them.
- The static title and both descriptions are updated. Before its first chain read, the first act uses the buried headline and `Feed the fire`. The third act adds the requested `brothers · oracle request` separator.

`src/chain.ts`, `src/wallet.ts`, all App trade/approval/wallet/manumit/burn handlers, the CSP, existing stylesheet, dependencies, build configuration and ignore file are byte-for-byte preserved against the parent. New presentation CSS is scoped in `src/second-act.css`. First/third-act behavior and copy otherwise remain unchanged. See [DESIGN.md](DESIGN.md).

## Actual validation — 7 October 2026

Commands run in the isolated build copy, after the final source changes:

```sh
npm run typecheck
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-test-browsers npx --no-install playwright-core install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-test-browsers npx --no-install tsx scripts/check-watch-browser.mjs
npx --no-install tsx scripts/check-watch-mainnet.ts
```

Read-only preservation and packaging checks run from this repository:

```sh
python3 scripts/check-preservation.py
python3 scripts/check-package.py
```

- Typecheck and production build passed. **55/55 unit tests passed**: exact fixture/rendered letter, all verdicts and combinations, one-wei boundaries, countdown before/at/after deadline, both burn mechanisms, exact price threshold, all same-block reads, rejected/stale reads, 15-second polling, retained values, recovery and unmount behavior. Existing trade/calldata, approval, snapshot, testament and provenance tests also passed.
- **49/49 browser assertions passed** on Chromium **153.0.8010.12**, against the production export at `/preview/`. The runner owns and closes its foreground server and browser. ABI-encoded RPC and wallet mocks cover initial burial copy before any read, all acts, exact letter and links, every verdict, countdown crossing without a chain read, partial-failure retention/recovery, polling on all acts, buy/sell quotes, wallet chooser, keyboard navigation, direct hashes, legacy testament and reduced motion. No signed transaction is sent. There were zero page errors or failed local resources in this mocked run.
- Reflow checked at **320, 360, 375, 640, 641, 768 and 1440px**. Letter/watch also fit at 200% text enlargement on 320px. The unchanged header overflows to 339px in that extreme combination; this is documented, not silently redesigned. Axe reported only the existing cross-act `.skip-link` warnings (`region`, `skip-link`); its keyboard navigation to the first-act trade section passed. No new second-act violation was found.
- Final read-only mainnet check at **10:57:45 UTC, block 26,140,055**: nine wallets **189,216,124.32 FREE1376**; his wallet **12,160,406.58 FREE1376**; burned **0**; verdict **WAITING.** His bag was **≈ 1.058322 ETH ($2,730)**. **0.001 ETH → 11,226.266345083222233764 FREE1376**; the page's own buy calldata returned **`0x` successfully** in `eth_call`. All expected-state assertions passed. Raw wei, each address/balance, pool/feed values, calldata and results are in `artifacts/watch-mainnet.json`.
- The provided browser tool also inspected the final export with real mainnet RPCs at desktop/mobile widths. Live balances and verdict matched the independent check. A transient dRPC HTTP 429 was observed during a reload; public RPC availability is not guaranteed. Mocked failure recovery is covered independently. No browser-native zoom, screen-reader session, physical device/wallet, Safari/Firefox or hosted-publication test is claimed.
- Final export and complete submission size are recorded in `artifacts/package-report.json`; both are below the **8,388,608-byte** submission budget. No dependency archives, submodules, vendor registry, source maps or generated dependency/cache directories are delivered. The unchanged manifest and lockfile remain part of the source submission.

The pinned Better Interface guide was applied across accessibility, layout, writing, typography, colors and UI. The consolidated review records source locations, measured contrast, fixes, inherited limitations and evidence in [artifacts/validation.md](artifacts/validation.md). Reports/screenshots under `artifacts/` may be collected separately by the workspace; essential results are also recorded here. Earlier browser/mainnet scripts describe earlier revisions; `check-watch-browser.mjs` and `check-watch-mainnet.ts` are the current acceptance runners. Browser harness issues discovered during validation (paragraph newlines and inherited-header/skip-link assertions) were corrected and rerun; no failed assertion is counted as a pass.

## Publish under the existing name

1. Repeat `npx --no-install tsx scripts/check-watch-mainnet.ts` immediately before publishing. It checks the expected balances/verdict and repeats the positive 0.001 ETH quote and page-calldata simulation without sending a transaction. It writes the actual results before asserting expected holdings. If balances change or the deadline passes, record that fact; do not alter live data to force `WAITING.`.
2. Submit the source, unchanged manifest/lockfile, documentation and **all of `dist/`** to the IdentityMD publisher as the next version of **free1376.site.identitymd.eth**, name **free1376**. The publisher serves this export without rebuilding. Preserve the current social-image alias, `https://free1376.eth.limo/og.png`.
3. Verify the hosted first/second/third-act hashes, full letter, live watch, quotes and wallet chooser.

**Publication remains pending:** this session exposes no publishing capability or credentials, and `.git/` is protected. The worker prepared the source/export but did not create a commit or claim a hosted deployment. The submission/publishing system must commit and publish the next version under the existing name.
