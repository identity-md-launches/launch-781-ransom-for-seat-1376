# Ransom for Seat 1376 — FREE1376

A static React/TypeScript site for launch #775 on Ethereum mainnet. The finished deployable export is **`dist/`**; Vite uses `base: './'` so its assets work under a gateway subpath. The site has no backend, analytics, tracking, hosted font or remote runtime script.

## Install, preview and rebuild

Use Node.js 22.12+ (this revision validated with Node 24.9.0 / npm 11.6.0).

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Open the local URL printed by Vite. `npm run dev` starts the source development server. `npm run preview` serves the already-built export. Both commands stay in the foreground; stop them with Ctrl+C.

Normal package dependencies are installed from npm. There is no vendored registry or offline dependency archive. The lockfile is included. `.gitignore` has an explicit 512-byte budget, excludes generated dependencies/caches at every nesting level and deliberately includes `dist/`. `test/scratch/` is disposable and is not needed by the production build.

## Publish

1. Run the build and checks above, then `npm run check:mainnet` immediately before publishing. It uses only public `eth_call` reads; it does not need a private key or broadcast a transaction.
2. Publish **all of `dist/`**, including `assets/` and `THIRD_PARTY_LICENSES.txt`, as the next version of **free1376.site.identitymd.eth** (publication name **free1376**), preserving https://free1376.site.identitymd.eth.limo. The source, manifest, lockfile and current export should travel together in the submission. No server-side rewrites or build step are required by the publisher.
3. Open the final hosted subpath and confirm the live face, ransom, quote and wallet chooser. HTTPS enables clipboard APIs and normal injected-wallet behavior. Keep both RPC hosts allowed if adding host-level CSP headers.

The updated export is included for the IdentityMD submission publisher under the existing name **free1376**. No publication tool or hosting credentials are available in this workspace, so a live publication was not performed or verified. Git metadata was not modified; the submission system must package the source, existing manifest/lockfile and export together.

## Chain and trading behavior

- All reads use PublicNode, then `eth.drpc.org`. The UI refreshes every 15 seconds. An unavailable RPC produces placeholders or explicitly stale data, never invented values. The primary snapshot pins reads to a single block.
- `tokenURI(1376)` is decoded as base64 JSON. Only the returned SVG data URI is passed to an `<img>`. The `Archetype` attribute supplies the identity caption.
- The ransom meter uses `totalFees` and `CREATOR_CAP`; the paid amount/bar are clamped at the cap. `buried()` determines the final state and gates the testament at that same block. While false (or before the initial snapshot), the page shows `SEALED.` and the commitment; it never reads or renders MANIFESTO. Once true, it reads MANIFESTO at the snapshot block, renders the returned text verbatim, verifies both its chain hash and the supplied expected hash, and links to the hook’s Etherscan events. `status()` remains verbatim. `getApproved(1376)` at the snapshot block drives the holder approval sentence with a case-insensitive comparison to the hook. Supply and both token decimal counts are also read from the chain.
- Quotes come from V4Quoter, including the hook fee. The page’s shared `buildTrade` uses Universal Router command `0x10`, actions `0x060c0f`, the **single tuple** swap parameter, the given PoolKey and empty hookData. Every click takes a fresh quote, applies the selected 1/3/5/10% slippage and simulates before asking the wallet. Deadlines use the latest block timestamp plus 600 seconds. Minimum labels round down, with the full exact value in the title; the contract receives the exact integer minimum.
- Buy sends ETH directly to the router without approvals. Sell checks ERC-20 and Permit2 allowances each time. Missing approvals are separate explicit wallet transactions, for the requested maximum amounts and a 30-day router permit. Completed sufficient, unexpired allowances are skipped.
- The wallet chooser uses EIP-6963, then `window.ethereum`. Wrong networks prompt a switch to chain 1. Mobile links carry the actual page URL. Reads never depend on a connected wallet.
- `manumit()` and `burnIMD()` are permissionless. Burns simulate `(true, 0)`, fall back to `(false, 0)` only on `Pool4Unavailable`, and submit only a route that simulated successfully. Nested router/hook errors are decoded into recoverable text. `V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)` maps to “price moved: raise slippage or try again”.
- Receipts, transaction links and `wallet_watchAsset` are provided. Transactions pending longer than the three-minute receipt wait can be inspected on Etherscan before retrying. Wallet signatures and gas are required only when a person submits an action.

`src/chain.ts` owns addresses, ABI encoding, public reads and error decoding. `src/wallet.ts` owns provider discovery and wallet requests. `src/App.tsx` owns the page and flows. `src/style.css` owns the visual tokens and responsive patterns. [DESIGN.md](DESIGN.md) documents the final design.

## Actual validation for this revision

The production build, TypeScript check and all 10 deterministic tests passed. The quote, Universal Router recipe, Permit2/holdings path, wallet source and App transaction handlers remain byte-for-byte unchanged; CSP, build configuration, manifest, lockfile and ignore file are unchanged. See [artifacts/preservation.json](artifacts/preservation.json).

Chromium inspected the production export at `/preview/`; **103 interaction assertions passed**. Checks cover keyboard tabs, quick amounts, invalid inputs, wallet dialog/Escape/focus return, copy, mobile links, mocked wallet approvals and receipts, future hook actions, RPC failure/recovery, sealed/opened/funded states, exact manifesto bytes/hash, approval changes and the actual two-argument nested router error. At 375px the face is **341px wide above the headline**. No horizontal overflow at 320, 375, 640, 641, 768 or 1440px. Phone trading now requires scrolling past the larger face.

At Ethereum mainnet **block 26,131,482**, a **0.001 ETH** buy quoted **10,254.31708782173482314 FREE1376** and `eth_call` of the page’s own buy calldata succeeded with `0x`. The snapshot reported `buried=false` and the hook already approved. Exact block, amount, calldata and response: [artifacts/mainnet-check.json](artifacts/mainnet-check.json). The verification script independently reads the 1,126-byte MANIFESTO for the future-state fixture; that text is stored only under `/tmp`, never bundled into the site. The production snapshot omits it while sealed.

The Better Interface review covered accessibility (semantics, keyboard/focus), layout (phone/breakpoint reflow), writing (exact requested copy), typography (headline reuse and verbatim text), colors (rendered contrast), and UI (loading, errors and chain-driven states). Detailed coverage and actual limitations are in [artifacts/validation.md](artifacts/validation.md); machine-readable browser results are in [artifacts/browser-checks.json](artifacts/browser-checks.json). Screenshots: [desktop](artifacts/desktop.png), [375px phone](artifacts/mobile-375.png), [sealed](artifacts/sealed.png), [mocked opening](artifacts/opened.png), [keyboard focus](artifacts/keyboard-focus.png).

Axe reports one pre-existing minor best-practice finding: `role="tabpanel"` on the unchanged trade form. It is retained under this assignment’s four-change scope. The existing gradient has an incomplete automated contrast check. All four revised testament text/background pairs were measured and exceed 4.5:1. There were no page exceptions or failed local resources in the successful run. These are worker observations, not independent certification or a full accessibility compliance claim.

### Reproduce interaction checks

```sh
npm run typecheck
npm test
npm run build
npm run check:mainnet
npx tsx scripts/prepare-browser.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-browsers npx playwright-core install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-browsers npx tsx scripts/check-browser.mjs
python3 scripts/check-package.py
```

The static export is **511,340 bytes**. The conservative deliverable archive estimate, including evidence and report overhead, is under **1.9 MB**, below the **8 MiB** budget. No dependency/cache directories or packaging archives are delivered.

The runner uses `playwright-core` and axe from the existing lockfile, serves `dist/` at a local `/preview/` subpath, runs all browser functions, writes evidence to `artifacts/`, and closes its server/browser in the same foreground process. `/tmp/free1376-fixtures/` holds temporary responses and the separately read manifesto. Tests mock future states and wallet writes; they never broadcast transactions. Keep port 4173 free for this runner.

For this managed assignment, installation and execution used an identical source/configuration copy under `/tmp/free1376-check`, with `npm ci --cache /tmp/free1376-npm-cache`, to avoid touching the repository’s prohibited `node_modules/`. The tested export and evidence were copied back; dependencies/caches/browser binaries stayed under `/tmp`. Source and export equivalence was checked. The supplied browser MCP could not start because its required Chrome binary was absent; the standalone runner above provided the rendered checks instead.

Physical wallet apps, real signed trades, native browser zoom, screen-reader sessions, Safari/Firefox and production-host publication were not exercised. Real mainnet buy quotation/simulation passed; sell/approval and future hook execution used deterministic tests and mocked browser flows. The existing dependency set was preserved; npm reported three audit advisories during installation and no dependency changes were authorized.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for design-guide and dependency attribution.
