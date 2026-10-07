# Seat #1376 — FREE1376

A static React/TypeScript Ethereum site in three acts. **`dist/` is the complete production export**, included alongside source and the existing lockfile. It uses relative asset URLs (`base: './'`), no backend, and the original public RPCs and CSP.

## Install, preview and rebuild

Use Node 22.12+; this revision used Node **24.21.0**, npm **11.19.0**.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Open Vite's printed preview URL. `npm run dev` serves source; `npm run preview` serves the built export. Stop either foreground server with Ctrl+C. Ordinary npm installation uses the supplied lockfile; no vendored registry is needed. Dependency and cache directories must stay out of the submission.

This managed assignment prohibits touching repository `node_modules/`, so installation, building and browser checks ran in an identical source/configuration copy at `/tmp/free1376-acts-check`, using `npm ci --cache /tmp/free1376-acts-npm-cache --no-audit --no-fund`. The tested export was copied back. All source/runtime files and export bytes were checked against that copy. Dependencies, npm cache and downloaded Chromium stayed under `/tmp`; package manifests, lockfiles, build configuration and `.gitignore` are unchanged.

## Publish under free1376

1. Run the checks above, then `npm run check:mainnet` and `npx --no-install tsx scripts/check-key.ts` immediately before publication. Both use public mainnet reads; the buy check simulates the page's own calldata without signing or broadcasting. The key check deliberately asserts the assignment's expected pre-issuance supply of zero; if that changes onchain, reassess that pre-publication expectation rather than altering the contract.
2. Publish **all of `dist/`** as the next version of **free1376.site.identitymd.eth**, publication name **free1376**, retaining https://free1376.site.identitymd.eth.limo. Include source, existing manifest/lockfile, icons, and runtime licenses in the Git submission. The publisher serves the export without rebuilding. No server rewrites are required.
3. Check the hosted first act, `#second-act`, `#third-act`, live key image, quote and wallet chooser. The requested social-image metadata points to **https://free1376.eth.limo/og.png**; the export contains `og.png`, and the publisher must retain the corresponding host/alias.

**Publication was not performed or verified:** this workspace exposes no hosting/publishing tool or credentials. The completed export is ready for the IdentityMD publisher under the existing name. Git metadata was not modified, as required; the submission system must create the commit/package containing the changed source and export.

## Implemented behavior

- Header links select `#first-act`, `#second-act` or `#third-act`, with `aria-current` and top scrolling. `#trade`, `#testament`, an empty hash and other section hashes select the first act; matching sections still scroll into view. Second is always marked sealed, third until the key is given.
- The first act retains the existing design and transaction flows. Quote and minimum lines now share grouped fixed precision (2 FREE1376 / 6 ETH decimals); minimums always round down and both exact values remain in titles. Four-decimal remaining ETH rounds up and complements the displayed paid floor to 2.8. Post-cap panel/fee/hero copy changes as specified; burial changes the headline and document title. Dead-address links, key contract/resource, liberator invitation and creator hint link are included.
- The second act contains only its two specified lines and performs no RPC reads on a direct load. It retains the initial browser title until another act reads the seat; once burial is known, that title persists across act switches.
- The third reads key contract `0x64547f1130CCAFa2f50D98a86f1306b2e515e416` at a single snapshot block. Supply zero uses `contractURI()` and `holder: nobody yet`. Supply one uses token 1376's image, full checksummed owner, conditional liberator, optional CreatorPaid transaction from the exact window/topic, witness/panel counts, oracle UUID and resource links. Both metadata formats are base64 JSON; SVG is only used as an `img` source. No SVG/HTML injection or additional act text.
- Key reads retry every 15 seconds. Before the first successful key read, the key section is empty and `aria-busy`; later failures retain previous data. Failed log reads omit only the transaction row. This preserves the task's strict third-act content restriction.
- `favicon.svg`, 32px PNG, 180px Apple icon and 1200×630 `og.png` are present in `public/` and `dist/`. The preview uses the actual onchain hero face. Run `npm run check:mainnet`, then `node scripts/generate-icons.mjs` with installed Playwright Chromium only when regenerating these assets; normal builds use the committed images.

`src/chain.ts` and `src/wallet.ts` are **byte-for-byte unchanged**. The App's amount, trade, approval, wallet-action, manumit and burn handlers are also unchanged. New routing, formatting and key reads live in `src/acts.ts`, `src/display.ts`, `src/key.ts` and `src/KeyAct.tsx`. The original PublicNode → dRPC fallback, snapshots, testament gating, Universal Router encoding, approvals, simulations, slippage and wallet behavior remain intact. [DESIGN.md](DESIGN.md) documents the implemented visual system.

## Actual checks — 2026-10-07

- **Production build and typecheck passed.** `npm test`: **22/22 tests passed**, including all requested number, rounding, hash, UUID, ownership/log-failure and three-state copy cases, plus existing calldata/approval/snapshot tests.
- Final mainnet check at **block 26,139,027**: **0.001 ETH → 12,732.784272665413327277 FREE1376**, above zero. `eth_call` of the page's own `buildTrade` calldata returned **`0x` successfully** at that block. No transaction was broadcast. Key at the same block: **totalSupply 0**, valid **contractURI SVG image**. The production third act was inspected rendering that live image at 360px.
- Chromium **153.0.8010.12** ran the final export under `/preview/`: **196 interaction assertions passed** (26 read-only, 15 wallet, 8 hook, 4 resilience, 58 prior-revision, 85 acts). Coverage includes both quote directions, slippage, validation/focus, wallet chooser and Escape, approvals/receipts with mocked wallet writes, manumit/burn simulation paths, RPC recovery, testament and holder states, direct hashes, scrolling, all key scenarios and all three copy states. No page exceptions or failed local resources were recorded by the final runner.
- Reflow checked at **320, 360, 375, 640, 641, 768 and 1440px**, with short/tall 375px viewports and 200% text enlargement. At **360px** the three act links and sealed marks fit one line without horizontal scroll. Screenshots were inspected for desktop, phone, second act, live key, mocked given key and keyboard focus.
- Preservation checks passed for both protected transaction modules, existing build/dependency/ignore files, App action handlers and the **unchanged CSP**. PNG dimensions and source/export equality passed. Export: **660,579 bytes**. The conservative complete uncompressed delivery including evidence is **under 3 MiB**, below **8,388,608 bytes**. No dependency/cache directories, submodules or packaging archives are delivered; `.gitignore` retains its original 184 bytes and explicit 512-byte budget.

The pinned Better Interface guide was applied while implementing and reviewed across all six domains:

| Domain | Coverage and outcome |
| --- | --- |
| Accessibility | Native act links, current-state attributes, keyboard switching, visible cyan focus, labeled controls, wallet focus return and image alt text checked. |
| Layout | Reused tabs/testament/contract rows; verified narrow navigation, key/holder wrapping, first-act grids, section scrolling and text enlargement. |
| Writing | Specified strings checked in all states; unchanged words retained elsewhere. No extra text in second/third acts. |
| Typography | Existing monospace hierarchy preserved; fixed decimal grouping and conservative rounding tested; long addresses remain complete and selectable. |
| Colors | Existing palette retained; rendered active-tab contrast **12.23:1**, inactive/sealed/row labels **8.40:1**, key values **18.33:1**, against `#030303`; testament and holder contrast also measured. |
| UI | Exact contract artwork through img, required icon/preview assets, instant hash navigation, stale/read-failure behavior, existing wallet/trade/hook interactions; reduced-motion primary transition **0s**. |

Axe retains the existing minor `aria-allowed-role` finding on the untouched trade form's `role="tabpanel"`, plus an incomplete gradient contrast check. These are documented, not claimed fixed. No screen-reader session, native zoom, physical wallet/device, Safari/Firefox, signed transaction, social crawler or final production-host check was performed. Given-key states and future burial were mocked because the live key is not yet issued. Manual-browser resource errors from opening a tab as an earlier test server shut down were excluded from the separate clean final-run report. These are worker observations, not independent certification.

Detailed evidence is in [artifacts/validation.md](artifacts/validation.md), [browser-checks.json](artifacts/browser-checks.json), [mainnet-check.json](artifacts/mainnet-check.json), [key-check.json](artifacts/key-check.json), [preservation.json](artifacts/preservation.json) and [package-report.json](artifacts/package-report.json). The managed workspace excludes `artifacts/` via protected Git metadata; those files remain available for artifact collection. Essential results are recorded here independently.

## Reproduce validation

```sh
npm run typecheck
npm test
npm run build
npm run check:mainnet
npx --no-install tsx scripts/check-key.ts
npx --no-install tsx scripts/prepare-browser.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-acts-browsers npx --no-install playwright-core install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-acts-browsers npx --no-install tsx scripts/check-browser.mjs
python3 scripts/check-preservation.py
python3 scripts/check-package.py
```

The browser runner owns and closes its foreground preview/browser; keep port 4173 free. Existing live browser fixtures expect an unburied approved seat; reassess them if mainnet advances to a later state. `check-preservation.py` compares the revision with the parent `HEAD` before the submission system commits it; preserve that parent reference for later audits. Screenshots and reports go to `artifacts/`; chain fixtures and dependencies stay outside the export. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) retains the guide and dependency attribution.
