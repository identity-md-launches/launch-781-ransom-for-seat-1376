# FREE1376 — Seat #1376

Static React/TypeScript/Vite continuation of job `5291e465-6534-454e-8c90-2bf9c2454e33`. Publication name remains **free1376**, hosted as **free1376.site.identitymd.eth** at https://free1376.site.identitymd.eth.limo. This revision adds the second ransom's paid state and keeps the third act sealed until a later build records sales. No contract or token is deployed, replaced, or minted.

## Install, preview, rebuild

Use Node 22+ and the existing manifest/lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open Vite's printed URL. The complete static export is `dist/`: HTML, hashed JavaScript/CSS, icons, social image, and runtime licenses. `base: "./"` and hash navigation support gateway subpaths without a backend. Fonts are system monospace; no font or chart library download is needed at runtime.

This restricted workspace was built in `/tmp/free1376-paid-ransom`, leaving repository dependency/configuration paths untouched. To reproduce that method, copy `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/`, `scripts/`, and `public/` to a fresh `/tmp` directory. There, run `npm ci --cache /tmp/free1376-paid-npm-cache --ignore-scripts --no-audit --no-fund`, then the commands above. Copy its complete `dist/` back and remove obsolete hashed chunks. Dependencies, browser binaries, and caches remain outside the submission. The unchanged ignore file has its existing explicit 512-byte budget.

## Implemented behavior

- `SecondActView` switches only when the unchanged watch contains `BURNED. ALL OF IT.`: all nine balances are zero and burned tokens reach H0. Every other state renders the original `SecondAct` component. The original letter, watch, verdicts, and both existing stylesheets are byte-identical.
- The paid view shows the exact headline and receipt, closed native disclosures for the live wallets and original letter/creator hint, three offer rows, sell meter, SVG history, the static recouped line, and the unchanged watch. The paid receipt is the timestamp of the first zero-total block found by binary search from **26,139,700** through the visit's latest block.
- New past-block calls use **https://eth.drpc.org exclusively**. The existing publicnode/dRPC fallback supplies the current block. `src/paidReads.ts` encodes the same V4 sell quote as the first act: the existing pool key, `zeroForOne: false`, exact token input, and empty hook data. One Multicall3 `aggregate3` at **0xcA11bde05977b3631167028862bE2a173976CA11** reads each historical quote, `getSlot0`, Chainlink `latestRoundData`, and that block's `totalSupply`. The extra supply entry keeps market cap correct after supply burns without another historical call.
- Live sell reads run every **15 seconds**, capped at `min(balance, M0)`, with balance, quote, supply, pool price, and feed pinned to one block. Four-decimal ETH and one-decimal percentages are display formatting; permission uses the exact **8,670,000,000,000,000,000 wei** boundary. A zero bag has zero proceeds without making an invalid zero-amount swap. Market cap uses the first act's pool-price × supply × ETH/USD formula.
- History is read once per visit, with hourly targets below 48 hours and 48 evenly spaced targets afterwards. The live point occupies the last slot; there are at most 47 historical points plus live. In the last fractional hour before 48 hours, live replaces the final hourly slot to respect the 48-point cap. Timestamp lookup resolves each target to its own actual block. Failed points are skipped. Chainlink freshness is checked against each historical block's time.
- Any successful chart sample or live quote reaching 100% is remembered for that visit, across tab changes and later price drops. Offer rules 1 and 2 fail strictly above M0. Rule 3 fails below M0 only without observed permission; while the history search is unresolved, its uncertain status is `—`. The original watch's independent spot-price verdicts remain exactly as requested and can differ from the offer's remembered quote-based rule.
- Live failure retains the last reading and displays the existing retry line; polling recovers automatically. History failure leaves the unknown time as `—` and uses existing error copy; reloading starts a new visit. Permission is based on the requested samples, not an exhaustive reconstruction of every intervening block. The required binary search assumes an ordered transition to zero.
- The third-act tab always retains `sealed`; the exact gate sentence appears above the preserved key, rows, and links. Recouped remains zero. All new logic/components/styles are in new files; App and KeyAct only add wiring.

`chain.ts`, `wallet.ts`, transaction handlers, existing configuration/dependencies, CSP, first-act markup/copy, and existing letter/watch code are preserved. See [DESIGN.md](DESIGN.md) for the implemented design.

## Validation performed — 7 October 2026

Commands run in the isolated build directory (typecheck, unit tests, build, browser checks and the final mainnet buy/sell repeat ran after the last source change):

```sh
npm run typecheck
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-paid-browsers npx --no-install playwright-core install chromium
CHECK_LIVE_BROWSER=1 PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-paid-browsers npx --no-install tsx scripts/check-paid-browser.mjs
npx --no-install tsx scripts/check-mainnet.ts
npx --no-install tsx scripts/check-paid-mainnet.ts
```

Read-only preservation and packaging checks, from this repository:

```sh
python3 scripts/check-paid-preservation.py
python3 scripts/check-package.py
```

- Typecheck and production build passed; **69/69 unit tests passed**. New tests cover exact paid switching and unchanged unpaid markup, search boundaries, actual-block timestamp lookup, hourly/48-point sampling, skipped failures, aggregate calldata/results, capped live quotes, exact sell threshold, offer rules, remembered permission, polling/retention, and the third-act gate. Existing trade/calldata, approvals, testament, key, letter, and watch tests still pass.
- **47/47 browser assertions passed** in Chromium **153.0.8010.12**, serving the production export under `/preview/`. The foreground runner starts and closes its own server/browser. ABI-level RPC mocks exercise automatic paid switching, 11% and 100%, disclosures, Etherscan links, chart hover/keyboard/touch, bought-again/sold-early rules, historical permission, tab persistence, failure recovery, third-act sealing despite a given key, first-act buy/sell inputs, wallet chooser/Escape, and the legacy testament hash. The final check also used real mainnet reads: full wallets, zero burned, `WAITING.`, and the original second act.
- Rendered reflow passed at **320, 360, 640, 641, 768, and 1440px**. Screenshots of paid 11%/100%, mobile, chart focus, forced colors, offer failure, gate, and live unpaid views were inspected. No page errors, console errors, or failed local resources occurred in the mocked run; no uncaught error occurred in the live second-act check. The only axe findings were the inherited cross-act `.skip-link` warnings (`region`, `skip-link`).
- The mainnet buy check passed: **0.001 ETH → 14,440.052312921616982725 FREE1376** at block **26,141,090**, and the page's own buy calldata returned **`0x` successfully** in `eth_call`; manifesto integrity passed. No transaction was signed or broadcast.
- Final repeat at **14:40:09 UTC**, live quote block **26,141,163**: the nine wallets held **189,216,124.32 FREE1376**, his wallet **12,160,406.58**, burned **0**, paid layout **false**, verdict **WAITING.** The real sell quote was **1.002568013542564835 ETH (11.5636%)**, equal to a direct call of the same quoter at that block. The repeated **0.001 ETH** buy quoted **11,134.764690538776500471 FREE1376** and its page-calldata simulation again returned **`0x`**. An actual historical aggregate at **26,139,700** returned **0.956335162299578403 ETH**. Quotes moved during validation (an earlier 14:27 read was 0.7767 ETH); the site uses the current real quote rather than fixing it to the assignment's approximate 0.97 ETH. Raw final values/calldata are in `artifacts/paid-mainnet.json`.
- The complete static export is **685,918 bytes**. The conservative submission inventory, including review artifacts and archive overhead, is **under 2.3 MB**, below **8,388,608 bytes**. `artifacts/package-report.json` records exact byte counts and hashes. The export contains only the current runtime chunks/assets; no registry, dependency archives, generated cache, node_modules, or submodule is delivered. Vite's advisory about the approximately 501 kB minified main chunk remains; configuration is intentionally unchanged.

## Better Interface review

Applied the pinned workflow and all six domains while building. The complete review is `artifacts/validation.md`; evidence may be collected separately because the workspace's existing Git exclusion covers `artifacts/`. This README retains the essential results.

| Domain | Coverage and result |
| --- | --- |
| Accessibility | Checked native disclosures/links, meter name/value, keyboard chart controls, live status regions, touch selection, visible cyan focus, forced colors, reduced motion, and axe. Screen reader, physical device, native browser zoom, and other engines unperformed. |
| Layout | Checked requested order, reused measure/rail/contract rows, closed disclosures, wrap behavior, and 320–1440px reflow. Screenshot inspection found no clipped paid content at tested sizes. |
| Writing | Checked requested strings and independent exact-letter fixture; kept all previous copy and reused existing error text. No fabricated date, quote, or permission while loading. |
| Typography | Checked system monospace, existing sealed-headline/label sizes, tabular values, fixed precision, selectable wrapped addresses, and legible unscaled SVG labels. |
| Colors | Checked existing tokens only. Measured rendered foreground/background: orange/black **7.36:1**, muted/black **8.40:1**, body/black **18.33:1**. No full gradient or accessibility certification is claimed. |
| UI | Checked 11%/100%, unknown/failed/recovered states, offer violations, disclosures, dashed chart threshold and selected point. Native disclosure arrows communicate folded content; no new animation. |

Findings and fixes: **medium**, `src/SellChart.tsx:82`: touch pointer-leave could reset the selected sample; limited reset to mouse pointers and verified a real emulated touchscreen tap retains its detail. **medium prevented**, `src/paid.ts:47` / `src/paidVisit.ts:36`: an unresolved historical query must not accuse an early sale; show `—` until history resolves, and retain any observed permission. **medium inherited**, `src/App.tsx:502`: the unchanged skip link targets first-act trading while another act is displayed; axe records it, while the existing hash route remains available. First-act structure was explicitly protected. A browser-harness selector initially used `button` for the existing Sell `tab`; corrected the harness and reran all checks.

Limitations: native browser zoom/text enlargement, physical wallets/devices, screen readers, Firefox/Safari, exhaustive historical price peaks, and a hosted post-publication check were not performed. Public RPC availability is external. Reports are worker observations, not independent certification.

## Publish under free1376

1. Repeat `npx --no-install tsx scripts/check-mainnet.ts` and `npx --no-install tsx scripts/check-paid-mainnet.ts` immediately before publishing; report actual values if the market or holdings change.
2. Submit the source, unchanged manifest/lockfile, README/DESIGN and **all of `dist/`** to the IdentityMD publisher as the next version of **free1376.site.identitymd.eth**, name **free1376**. It serves the supplied export without rebuilding. Preserve the existing `https://free1376.eth.limo/og.png` social-image alias.
3. Check the published `#first-act`, `#second-act`, and `#third-act` links, current watch/quotes, and the third-act gate.

**Publication remains pending:** this environment exposes no publisher or hosting credentials, and the assignment forbids modifying `.git/`. The source and finished export are ready for the submission system to commit and publish under the same name; no hosted deployment or Git commit is claimed.
