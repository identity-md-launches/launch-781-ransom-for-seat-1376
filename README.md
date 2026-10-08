# FREE1376 — Seat #1376

Continuation of job **e7e7db8f-092b-4d71-8deb-45d9ee6946cc**, prepared for the same publication name **free1376**, **free1376.site.identitymd.eth** / https://free1376.site.identitymd.eth.limo.

This revision fixes the seven reviewed issues: centered odometer punctuation, nonnegative chart ranges with round grid steps, trader ETH including the hook fee, unsigned impacts that round to zero, a one-minute failed-log cooldown, batched watch/first-act snapshots, the phone hero lines, and the two specified copy replacements. The established palette, fonts, components, other wording and transaction logic are preserved. `chain.ts`, `wallet.ts`, CSP, build configuration, dependencies and lockfile retain their original bytes.

## Install, preview and rebuild

Use Node 22+ and the supplied lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Vite's unchanged `base: "./"` emits relative asset URLs. Deliver all of `dist/`, including its images and runtime licenses. No backend, keys, remote fonts or dependency archives are needed at runtime.

The worker installed dependencies in `/tmp/free1376-axis` using copies of the existing manifest and lockfile (`npm ci --ignore-scripts --no-audit --no-fund`), built there, and copied the production export back. This respects the assignment's protected dependency paths. No repository `node_modules`, package-manager cache, submodule, ignore-file change or Git metadata write was made.

## Data behavior

`watchBatch.ts` reads eleven balances, supply, pool price, Chainlink and block number/time through one Multicall3 `aggregate3` call on each unchanged 15-second watch tick. Required failures reject the entire snapshot; the watch retains its previous values and its exact `Live reads are unavailable. Retrying…` message.

`snapshotBatch.ts` supplies App's first-act snapshot through one aggregate per refresh, including the optional Chainlink feed. It discovers the hook's immutable IMD address once per visit, then reads and verifies that address and its decimals inside each aggregate. That one-time discovery is an additional startup call. A failed optional feed clears only dollar estimates; a required failure preserves the existing snapshot error behavior. Sealed manifesto data is not exposed or required. The original readers remain available for regression comparison, without modifying `chain.ts`.

Latest reads and recent logs use **ethereum-rpc.publicnode.com**; existing historical readers retain **eth.drpc.org**. The live swap meter's existing capped quote, 4-second head polling, 60-second heartbeat and all wallet/permission logic remain intact. Startup history and live catch-up share a 60-second cooldown after a failed log response, preserving cursors and the ability to show new swaps during a slow initial history scan.

Tape BUY ETH is `abs(amount0) × 100 / 98`; SELL ETH is `abs(amount0) × 98 / 100`. Bigint calculations precede the existing four-decimal display. The token amount is unchanged. Rounded zero impacts display `0.00%`. Chart ranges retain their padding with a zero floor; ticks are multiples of 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 25 or 50 percentage points, including during animation.

## Checks and evidence

**116/116 unit tests**, clean typecheck and production build, **91 production-browser checks**, and a real local mainnet-fork buy/sell/pump check passed. The build retains Vite's advisory about the JS chunk exceeding 500 kB; configuration is protected. See [validation](artifacts/validation.md), [design system](DESIGN.md), and [preservation hashes](artifacts/preservation.json).

Measured publicnode requests in real 60-second browser windows after 20 seconds of warmup, without a connected wallet:

| Act | All RPC requests before → after | `eth_call` before → after |
| --- | --- | --- |
| First | 160 → 28 | 148 → 24 |
| Second | 98 → 42 | 70 → 18 |

These are observed quiet-market windows, not a cap under trading activity. The measurement includes unchanged key/head polling; the one-time discovery occurs before the measured window. [Before](artifacts/requests-before.json) and [after](artifacts/requests-after.json) include method counts and timestamps. [The mainnet screenshot](artifacts/after-mainnet.png) shows the centered `7.58` and corrected tape. The fork's 0.5 ETH buy shows `0.5000 ETH`; its pump reaches 292.33% with a nonnegative axis and 50-point steps.

Reproduce the checks with installed Chromium/Anvil:

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/path/to/chrome-headless-shell npx --no-install tsx scripts/check-swap-browser.mjs
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/check-live-fixes-mainnet.ts
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/check-live-fixes-render.mjs
NODE_USE_ENV_PROXY=1 npx --no-install tsx scripts/check-live-fixes-fork.mjs
NODE_USE_ENV_PROXY=1 node scripts/check-request-rate.mjs after dist
python3 scripts/check-live-fixes-preservation.py
python3 scripts/check-package.py
```

Browser scripts manage and close a temporary static server and browser, serving the export under `/preview/`. This worker's Chromium path is `/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell`. For a before measurement, point the request-rate script at an unmodified parent export. The fork script uses zero generated accounts, locally impersonates the existing public holder and funds it only in Anvil. It deploys nothing and sends no mainnet transaction.

Etherscan returned HTTP 403/challenge pages; its direct trade comparison remains unverified. Receipt amounts and the required formulas were checked on eight mainnet trades; six also have a matching WETH transfer at displayed precision. Sender native-balance changes do not establish trader receipts for routed trades. Native macOS/SF Mono, physical phones, screen readers and native browser zoom were unavailable. Local Chromium tested four installed monospace choices and all three odometers; this is not a claim to have rendered every platform font.

## Publish as free1376

Submit the source, unchanged manifest/lockfile, documentation and complete `dist/` export to the IdentityMD publisher as the next version of **free1376.site.identitymd.eth**, publication name **free1376**. The publisher serves the export without rebuilding. After publishing, check all three act links, phone hero/testament, chart modes, tape links and wallet chooser at the hosted address.

**Publication is pending the network publisher.** No publishing capability is exposed in this environment; no new IPFS CID, Git commit or hosted update is claimed. The local source/export are ready for submission. Direct Etherscan comparison remains a prepublication check limitation, documented with the actual evidence rather than reported as passed.
