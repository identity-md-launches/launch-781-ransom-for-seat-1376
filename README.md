# FREE1376 — Seat #1376

Static React/TypeScript/Vite continuation of job **4556beff-adfc-40ab-83b9-f70c713aa41d**, for the same publication name **free1376** at **free1376.site.identitymd.eth** / https://free1376.site.identitymd.eth.limo.

This revision makes one fix: wallet-history discovery uses pure bisection. Equal endpoint balances finish a range immediately. Only unequal ranges split until their endpoints are adjacent blocks. The transfer-log helper and block-by-block fallback are removed. The already-read latest balance is reused, so an unchanged visit needs **two balance reads**. Exact cancellations within any equal-ended range are intentionally invisible, as requested.

Only `src/walletRecord.ts` and `src/recordReads.ts` change in the application. All components, copy, layout, CSS, public assets, other logic, CSP, build configuration and dependencies stay byte-for-byte unchanged. Receipt decoding, sale/move/buy/gift classification, proceeds, first-decrease quote, offer rows, verdicts, RECOUPED, fulfillment and third-act wording stay unchanged. Historical reads still use **https://eth.drpc.org**. `chain.ts` and `wallet.ts` retain their exact parent bytes. Nothing is deployed onchain, replaced or minted.

## Install, preview and rebuild

Use Node 22+ and the existing manifest and lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the printed preview URL. Vite's unchanged `base: "./"` emits relative asset URLs. Hash navigation works under gateway subpaths. The complete **dist/** export includes its icons, social image and runtime licenses. No backend, private credentials, remote fonts or vendored registry are needed.

For this assignment, protected dependency paths were left untouched. The worker copied `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/`, `scripts/` and `public/` into `/tmp/free1376-bisection`, installed there with `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/free1376-npm-cache`, and ran the checks there. The finished export was copied back to `dist/`. Dependencies, browser binaries and caches remain outside the deliverable. The ignore file is unchanged.

## Live measurement — 7 October 2026

These are actual mainnet measurements of the production logic/export, with no RPC mocks:

| Measurement | Result |
| --- | --- |
| Record alone, 16:36:51 UTC, through block **26,141,746** | **3 HTTP / JSON-RPC requests**: one latest header and two `balanceOf` reads; **0.390 seconds**, zero `eth_getLogs` |
| Earlier record repeat, 16:33:59 UTC | Same 3 requests / 2 balance reads; **0.704 seconds** |
| Fresh desktop visit, 1440px, 16:34:42 UTC | All three offer rows show **✓ after 0.477 seconds** from navigation |
| Fresh mobile visit, 360px, 16:34:44 UTC | All three offer rows show **✓ after 0.584 seconds** from navigation |

The record was empty; his balance was **12,160,406.58 FREE1376**. Full-page traffic through the appearance of ticks was **11 desktop / 12 mobile dRPC HTTP requests**, including other unchanged consumers (paid-block search, chart, burial and sell quote). That total is distinct from the record's three requests and is not a total for the page's ongoing polling. Timing depends on network/provider conditions.

The full state check at block **26,141,737** found nine-wallet balance **0.00 FREE1376**, burned **189,216,124.32 FREE1376**, paid block **26,141,482** (**2026-10-07 15:43:59 UTC**), RECOUPED **0.0000 ETH**, all three rows passing, and a live capped sell quote of **1.386201555591304873 ETH**. At block **26,141,743**, the unchanged buy path quoted **0.001 ETH → 8,303.510601952947740731 FREE1376** and simulated successfully with `eth_call` returning `0x`; manifesto integrity passed. No transaction was signed or sent.

Raw results: [record count](artifacts/bisection-mainnet.json), [first repeat](artifacts/bisection-mainnet-first.json), [browser timings](artifacts/bisection-live-browser.json), [full record state](artifacts/record-mainnet.json), [trade simulation](artifacts/mainnet-check.json).

## Validation

Commands actually run in the isolated workspace, with exit code 0:

```sh
npm run typecheck
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-bisection-browsers npx --no-install playwright-core install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-bisection-browsers npx --no-install tsx scripts/check-record-browser.mjs
npx --no-install tsx scripts/check-bisection-mainnet.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-bisection-browsers npx --no-install tsx scripts/check-bisection-live-browser.mjs
npx --no-install tsx scripts/check-record-mainnet.ts
npx --no-install tsx scripts/check-mainnet.ts
```

Read-only preservation and packaging checks run from the repository:

```sh
python3 scripts/check-bisection-preservation.py
python3 scripts/check-record-preservation.py
python3 scripts/check-package.py
```

- **92/92 unit tests pass**. Equal endpoints read no interior blocks; an unchanged visit makes exactly two balance reads with log/receipt tripwires. A change across one million blocks uses **21–22 reads** at tested boundaries/interior positions, below the 42-read bound. Tests cover two changes, an unequal sale then buy, intentional invisible cancellations, pruning equal subranges, adjacent/empty ranges and failed reads. Existing classification, quote, proceeds, fulfillment, paid, watch, navigation and trade tests pass. Three old tests requiring cancellation discovery/exhaustive scanning were replaced because they contradicted the new specification.
- **49/49 production-browser checks pass**, using Chromium **153.0.8010.12** and the actual `dist/` at `/preview/`. The mock RPC rejects any `eth_getLogs`. Coverage includes paid persistence, exact letter/copy, disclosures, gifts/buys/sales, early-sale quote, gas-adjusted proceeds and fulfillment, third-act navigation, chart keyboard/touch, buy/sell inputs, wallet chooser/Escape and read-failure recovery. No uncaught errors, console errors or missing local assets occurred.
- Reflow passed at **320, 360, 640, 641, 768 and 1440px**. Live desktop/mobile and mocked fulfillment screenshots were inspected, along with forced-color chart focus. The supplied browser separately inspected the live export at 1280px, opened the wallet disclosure, followed the third-act link and reported zero console errors.
- All six pinned Better Interface domains were reviewed. Existing `.skip-link` axe `region`/`skip-link` findings remain outside this strictly one-fix scope. No screen-reader, physical-wallet/device, native zoom/text enlargement, Safari/Firefox or post-publication check is claimed. See [the consolidated review](artifacts/validation.md) and [DESIGN.md](DESIGN.md).
- Preservation checks confirm **47 unchanged files**, plus byte-identical classification/copy and receipt decoding inside `walletRecord.ts`. Protected manifest, lockfile, CSS, index/CSP and transaction modules are unchanged. The final formatting-only source pass was rebuilt/typechecked/tested; its export is byte-identical to the browser-tested export.
- Vite's existing advisory for the approximately **506 kB** main chunk remains. No build configuration was changed to suppress it. The complete export is **691,265 bytes**; the conservative bundle inventory and 8 MiB budget check are in [package-report.json](artifacts/package-report.json). No dependency/cache directories, archives, registry mirrors or submodules are submitted.

Live behavior remains subject to public RPC availability. Exact cancellations within any pruned range are intentionally unseen. The existing visit extension, block-level classification and finality behavior are retained.

## Publish under free1376

1. Run the live measurement commands above and report their current request counts and offer-row timing.
2. Submit source, the unchanged package manifest/lockfile, documentation and the complete **dist/** directory as the next version of **free1376.site.identitymd.eth**, name **free1376**. The IdentityMD publisher serves that export without rebuilding; preserve all relative runtime assets and the existing social-image alias.
3. Check the hosted first-, second- and third-act links, offer rows, disclosures, quote and wallet chooser after publication.

**Publication pending:** the complete source/export is prepared for the submission system. No publisher tool or hosting credentials are exposed in this environment, and `.git/` writes are prohibited. No Git commit or hosted update is claimed.
