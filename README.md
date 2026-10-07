# FREE1376 — Seat #1376

Static React/TypeScript/Vite site for Ethereum mainnet launch #775, continuing job `c6c324b5-d5e7-4ef7-935e-19be7aaf9a4d`. Publication name remains **free1376**, hosted as **free1376.site.identitymd.eth** at https://free1376.site.identitymd.eth.limo. No contract is deployed or replaced.

## Install, preview and rebuild

Use Node 22+ and the committed, unchanged package manifest and lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the preview URL printed by Vite. `dist/index.html` and all runtime assets in `dist/` are the publication deliverable. `base: "./"` remains unchanged; asset URLs are relative, and hash navigation supports static hosting beneath a subpath. Fonts are system monospace; image metadata comes from the contracts. Runtime licenses and existing icons/social image are included. No backend, private credentials, vendored registry or dependency archives are needed.

For this bounded assignment, dependency installation happened **only in `/tmp/free1376-revision`**, with npm cache and browser downloads also under `/tmp`. The repository's manifest, lockfile, dependency directories, build configuration, ignore file and Git metadata were not modified. Reproduce that isolated workflow by copying the existing manifest/lockfile, `src/`, `scripts/`, `public/`, `index.html`, `tsconfig.json` and `vite.config.ts` to a temporary directory, running the commands above there, then copying its complete `dist/` back. Remove obsolete output chunks when synchronizing an export.

## This revision

- When burial is known, a single shared search finds the first true `buried()` block between **26,130,900** and latest. All search state calls use **https://eth.drpc.org**. `eth_getBlockReceipts` selects the receipt containing the hook's exact `CreatorPaid` topic; its **from**, never its destination or payout recipient, supplies the liberator before key issuance. The block timestamp supplies both elapsed time and UTC date. One attempt is cached per document visit, including failures; a reload starts another attempt. No `eth_getLogs` range query remains in production.
- The headline's address link is checksummed, shortened to `0x` + four characters + `…` + four characters, visible on phones, and updates elapsed time each minute. It opens `#third-act`. Once given, the key's `liberator()` takes precedence. Third-act `made me free` is omitted when it equals the holder; `free since` links the burial transaction and shows UTC. Failed provenance reads hide the affected content.
- Key supply and, when given, owner 1376 and liberator are read on **every act**, every 15 seconds. The connected owner sees `yours` and `Welcome, keyholder.`. Key read failure clears stale detail and shows `Live reads are unavailable. Retrying…`; polling recovers automatically. Supply zero retains the live `contractURI()` image.
- The opened testament reveals at 120 characters/second on its first viewport intersection per visit. Click/tap, keyboard focus, copy, or reduced motion reveal all immediately. A complete, selectable text layer remains in the DOM and accessibility tree; the visual reveal layer is excluded from both selection and accessibility. The original hash computation/gating is unchanged.
- Chainlink `latestRoundData()` uses the existing public RPC fallback on the snapshot's 15-second refresh. Its eight-decimal ETH/USD answer produces cents for the million-token price and whole dollars for market cap, with grouping. Failed, nonpositive, incomplete, future-dated or older-than-three-hours rounds are hidden. Exactly three hours is accepted.
- Second act adds the exact creator hint/link. Burial removes the duplicate status line and retains the cyan IMD total. Sell-fee parentheses appear only with a quote.

`src/chain.ts` and `src/wallet.ts` remain byte-for-byte identical, as do the App's trade, approval, wallet action, manumit and burn handlers. CSP, palette, typography, existing copy and layout remain unchanged outside the requested additions. The dollar lines reuse labels; explicit `.pool-value` selectors preserve the existing ETH-value typography after adding a new last child. See [DESIGN.md](DESIGN.md).

## Validation — 7 October 2026

Commands actually run in the isolated copy:

```sh
npm run typecheck
npm test
npm run build
npm run check:mainnet
npx --no-install tsx scripts/check-revision-mainnet.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-test-browsers npx --no-install playwright-core install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-test-browsers npx --no-install tsx scripts/check-revision-browser.mjs
```

The browser runner owns and closes its foreground server at `/preview/` on port 4173 and Chromium. Its RPCs and wallet are mocked, with real ABI encoding. `scripts/fixtures/revision.json` contains a public chain snapshot/testament for offline interaction checks; it is not imported into the production site. `CHROME_BIN` can override the browser executable. A separately served export was inspected with the provided browser tool against live mainnet. The first system-Chrome attempt failed with `ERR_ACCESS_DENIED`; a temporary Playwright Chromium installation ran successfully. Intermediate test harness failures involved ambiguous selectors, fake-clock pending reads, and same-document hash navigation; these were repaired before the final run. Historical `browser-*.js`, `browser-acts.mjs`, `browser-revision.mjs` and `check-browser.mjs` belong to earlier revisions; use the current runner above, since those fixtures assume earlier copy and an unburied mainnet seat.

- Final production build and TypeScript check passed. **30/30 unit tests passed**, including burial bounds, multiple receipts, `from` selection, authoritative key liberator, caching/failures, elapsed/UTC formats, keyholder state, dollar rounding/staleness, full testament text and sell-fee fixes; existing calldata, approvals, snapshot and hash checks also passed.
- **53 browser assertions passed** on Chromium 153.0.8010.12, with zero page errors or failed local resources. Reflow was checked at 320, 360, 375, 640, 641, 768 and 1440px; 200% text enlargement, keyboard navigation, keyholder/account changes, quote direction, all four fixes, error/retry recovery, reduced motion, typewriter speed/once-per-visit/copying and minute/15-second timers passed.
- Final mainnet checks at **block 26,139,262**: **0.001 ETH → 11,239.361904159641540222 FREE1376**, own buy calldata `eth_call` returned **`0x` successfully**; Chainlink **$2,617.6773/ETH**, updated at timestamp **1791357839**, fresh; dRPC past-state call at **26,130,900** returned **false**; key **totalSupply 0**, valid **contractURI SVG image** (2,226 URI characters). The live burial boundary was also checked false at 26,139,207 and true at 26,139,208.
- Browser results and final mainnet measurements are recorded in `artifacts/revision-browser.json`, `artifacts/mainnet-check.json`, `artifacts/revision-mainnet.json`, and the consolidated [validation record](artifacts/validation.md).
- The seat became buried during the checks, at **block 26,139,208**, timestamp **1791360419** (**7 Oct 2026, 08:06 UTC**). The real sender is **0xD79248e9e0F83a30a58fE020Fdc4B6Bd74aF26ea**, transaction **0x5ef80c2d07db452555dcb50ab176d2d6128afc7582ab07bc2cd504dae37eb15f**. The new search independently found it and the live mobile site displayed it. No transaction was sent by the worker.
- Final static export: **665,703 bytes**. Conservative complete file submission including documentation/evidence and tar overhead is **under 2.2 MiB**, below **8,388,608 bytes**. Obsolete chunks were removed; no generated dependency/cache trees or archives are delivered.
- Protected-file/CSP/action-handler preservation and complete package-size checks run from the repository with `python3 scripts/check-preservation.py` and `python3 scripts/check-package.py`. These are read-only with respect to Git; the preservation baseline is the parent `HEAD`. Keep that parent reference for future audits.

The pinned Better Interface guide was applied during implementation and reviewed across accessibility, layout, writing, typography, colors and UI. Coverage, source locations, corrections and limitations are in `artifacts/validation.md`. Native links, labels, text selection, reduced motion, viewport-triggered animation, error recovery and responsive reflow are checked. No screen-reader session, physical touch device/wallet, native browser zoom, Safari/Firefox, signed transaction or final hosted-version verification is claimed. The original minor axe `aria-allowed-role` finding on the unchanged trade form and incomplete gradient contrast analysis are retained within the strict preservation scope. Reports/screenshots under `artifacts/` may be collected separately by the workspace; essential results are also recorded here.

## Publish under the existing name

1. Repeat `npm run check:mainnet` and `npx --no-install tsx scripts/check-revision-mainnet.ts` immediately before publication. They perform read-only mainnet calls: a positive 0.001 ETH buy quote, `eth_call` of this page's own buy calldata, Chainlink, a historical `buried()` call on dRPC, and key metadata. The latter deliberately expects supply zero as specified; if issuance occurs, record the new state and reassess that expectation.
2. Submit source, the unchanged package/lockfile, documentation and **all of the rebuilt `dist/`** to the IdentityMD publisher as the next version of **free1376.site.identitymd.eth**, name **free1376**. The publisher serves the committed export without rebuilding. Preserve the existing social-image host alias, https://free1376.eth.limo/og.png.
3. Verify the hosted first/second/third-act hashes, live sender/date, quote, wallet chooser, key artwork and dollar values.

**Publication is pending:** this workspace exposes no hosting/publishing capability or credentials. Git metadata is protected by the assignment, so the worker did not create a commit. The submission/publishing system must commit and publish the prepared source and export under the existing name; this report does not claim deployment.
