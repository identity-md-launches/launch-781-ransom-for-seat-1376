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
- The ransom meter uses `totalFees` and `CREATOR_CAP`; the paid amount/bar are clamped at the cap. `buried()` determines the final state and gates the testament at that same block. While false (or before the initial snapshot), the page shows `SEALED.` and the commitment; it never reads or renders MANIFESTO. Once true, it reads MANIFESTO at the snapshot block, renders the returned text verbatim, verifies both its chain hash and the supplied expected hash, and links to the hook’s Etherscan events. `status()` remains verbatim. `buried()` takes precedence in the holder note: when true it states the dead address and same-transaction payment. Otherwise `getApproved(1376)` at that same snapshot block selects the approved or must-approve sentence, comparing the hook address without case sensitivity. Supply and both token decimal counts are also read from the chain.
- Quotes come from V4Quoter, including the hook fee. The page’s shared `buildTrade` uses Universal Router command `0x10`, actions `0x060c0f`, the **single tuple** swap parameter, the given PoolKey and empty hookData. Every click takes a fresh quote, applies the selected 1/3/5/10% slippage and simulates before asking the wallet. Deadlines use the latest block timestamp plus 600 seconds. Minimum labels round down, with the full exact value in the title; the contract receives the exact integer minimum.
- Buy sends ETH directly to the router without approvals. Sell checks ERC-20 and Permit2 allowances each time. Missing approvals are separate explicit wallet transactions, for the requested maximum amounts and a 30-day router permit. Completed sufficient, unexpired allowances are skipped.
- The wallet chooser uses EIP-6963, then `window.ethereum`. Wrong networks prompt a switch to chain 1. Mobile links carry the actual page URL. Reads never depend on a connected wallet.
- `manumit()` and `burnIMD()` are permissionless. Burns simulate `(true, 0)`, fall back to `(false, 0)` only on `Pool4Unavailable`, and submit only a route that simulated successfully. Nested router/hook errors are decoded into recoverable text. `V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)` maps to “price moved: raise slippage or try again”.
- Receipts, transaction links and `wallet_watchAsset` are provided. Transactions pending longer than the three-minute receipt wait can be inspected on Etherscan before retrying. Wallet signatures and gas are required only when a person submits an action.

`src/chain.ts` owns addresses, ABI encoding, public reads and error decoding. `src/wallet.ts` owns provider discovery and wallet requests. `src/App.tsx` owns the page and flows. `src/style.css` owns the visual tokens and responsive patterns. [DESIGN.md](DESIGN.md) documents the final design.

## Actual validation for this revision

Only the holder-note sentence expression in `src/App.tsx` changed. It checks `data?.buried` first, then `data?.seatApproved`, then the existing fallback. `src/chain.ts`, `src/wallet.ts`, every other App byte (including the trade handlers), styling, build configuration, manifest, lockfile and ignore file are unchanged from parent commit `562255610b783ee0309c13f1bef262b2c2261e02`. The built CSS is byte-identical. See [artifacts/preservation.json](artifacts/preservation.json).

On 2026-10-06, `npm run typecheck`, all **13** deterministic tests and `npm run build` passed. The three new tests exercise the actual JSX sentence expression for buried, approved and neither; burial also overrides a true approval, and the loading fallback stays unchanged. Running those tests against the pre-fix App correctly fails the burial case ([regression evidence](artifacts/holder-note-regression.txt)). Existing snapshot tests verify pinned-block reads and case-insensitive hook approval.

At Ethereum mainnet **block 26,131,863**, a **0.001 ETH** buy quoted **13,137.499116564788517837 FREE1376**, above zero. `eth_call` of the page's own `buildTrade` calldata succeeded with **`0x`**, using the same snapshot block. No transaction was broadcast. The live snapshot was unburied with the hook approved; burial was exercised with mocked responses. Exact amount, calldata and response are in [artifacts/mainnet-check.json](artifacts/mainnet-check.json).

Chromium 153 inspected the production export at `/preview/`; **111 interaction assertions passed**. Coverage includes the three holder-note outcomes, zero/other-address approval, burial precedence, and `buried`, `getApproved` and MANIFESTO requests at one snapshot block. Existing flows passed: quick amounts, Buy/Sell keyboard tabs, invalid amounts, wallet dialog/Escape/focus return, copy, mobile wallet links, simulated approval/receipt and hook flows, RPC failure/recovery, sealed/opened testament and router-error handling. The new burial sentence wraps without horizontal overflow or clipping at **320, 375, 640, 641, 768 and 1440px**. Page reflow and 200% text enlargement also passed.

The pinned Better Interface review covered all six domains. The longer holder note uses its existing 12px monospace text, warm-black panel and wrapping rule; its measured contrast is **7.70:1**. Full coverage, findings and limitations: [artifacts/validation.md](artifacts/validation.md). Machine results: [artifacts/browser-checks.json](artifacts/browser-checks.json). Inspected screenshots: [desktop](artifacts/desktop.png), [375px phone](artifacts/mobile-375.png), [buried note at 320px](artifacts/holder-buried-320.png), [buried note at 1440px](artifacts/holder-buried-1440.png), [keyboard focus](artifacts/keyboard-focus.png).

No page exceptions or failed local resources were recorded. Axe reported the existing minor `role="tabpanel"` finding on the unchanged trade form, and an incomplete gradient contrast check. These remain outside this sentence-only change. Worker observations are not independent certification or a full accessibility compliance claim.

### Reproduce interaction checks

```sh
npm run typecheck
npm test
npm run build
npm run check:mainnet
npx tsx scripts/prepare-browser.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-holder-browsers npx playwright-core install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-holder-browsers npx tsx scripts/check-browser.mjs
python3 scripts/check-package.py
```

The existing browser suite assumes the current live seat is unburied and approved at its initial live check; if chain state changes later, that fixture assumption must be revisited. It then mocks the required alternative states. The runner uses `playwright-core` and axe from the existing lockfile, serves `dist/` at a local `/preview/` subpath, writes evidence to `artifacts/`, and closes its server/browser in the same foreground process. `/tmp/free1376-fixtures/` holds temporary responses and the separately read manifesto. Wallet writes are mocked; the suite never broadcasts transactions. Keep port 4173 free.

The static export is **511,457 bytes**. The conservative deliverable archive estimate, including evidence and report overhead, is **under 2 MiB**, below the **8 MiB** budget; [artifacts/package-report.json](artifacts/package-report.json) records the file inventory and exact totals. No dependency/cache directories, submodules or packaging archives are delivered. Source, lockfile and all required runtime assets remain included.

For this managed assignment, installation and execution used an identical source/configuration copy under `/tmp/free1376-holder-check`, with `npm ci --cache /tmp/free1376-holder-npm-cache`, to avoid touching the prohibited repository `node_modules/`. The tested export and evidence were copied back and source/export equivalence checked. Dependencies, npm cache and Chromium stayed under `/tmp`. The supplied browser MCP could not start because its required Chrome binary was absent; the standalone runner provided rendered validation instead.

Physical wallet apps, signed transactions, native browser zoom, screen-reader sessions, Safari/Firefox and production-host publication were not exercised. Mainnet buy quotation/simulation passed; sell/approval and future hook execution used deterministic tests and mocked browser flows. The unchanged dependency installation reported three audit advisories; no dependency changes were made.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for design-guide and dependency attribution.
