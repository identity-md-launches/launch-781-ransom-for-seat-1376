# Ransom for Seat 1376 — FREE1376

A static React/TypeScript site for launch #775 on Ethereum mainnet. The finished deployable export is **`dist/`**; Vite uses `base: './'` so its assets work under a gateway subpath. The site has no backend, analytics, tracking, hosted font or remote runtime script.

## Install, preview and rebuild

Use Node.js 22.12+ (validated with Node 24.21.0 / npm 11.19.0).

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
2. Publish **all of `dist/`**, including `assets/` and `THIRD_PARTY_LICENSES.txt`, to an HTTPS static host. The source, manifest, lockfile and current export should travel together in the submission. No server-side rewrites or build step are required by the publisher.
3. Open the final hosted subpath and confirm the live face, ransom, quote and wallet chooser. HTTPS enables clipboard APIs and normal injected-wallet behavior. Keep both RPC hosts allowed if adding host-level CSP headers.

No hosting account was supplied, so this task creates the export rather than publishing it. No Git commands or commit were performed, respecting the assignment’s `.git/` restriction; the submission system can package the delivered files.

## Chain and trading behavior

- All reads use PublicNode, then `eth.drpc.org`. The UI refreshes every 15 seconds. An unavailable RPC produces placeholders or explicitly stale data, never invented values. The primary snapshot pins reads to a single block.
- `tokenURI(1376)` is decoded as base64 JSON. Only the returned SVG data URI is passed to an `<img>`. The `Archetype` attribute supplies the identity caption.
- The ransom meter uses `totalFees` and `CREATOR_CAP`; the paid amount/bar are clamped at the cap. `buried()` determines the final state. `status()` and `MANIFESTO()` remain verbatim text. MANIFESTO is checked against both its chain hash and the supplied expected hash. Supply and both token decimal counts are also read from the chain.
- Quotes come from V4Quoter, including the hook fee. The page’s shared `buildTrade` uses Universal Router command `0x10`, actions `0x060c0f`, the **single tuple** swap parameter, the given PoolKey and empty hookData. Every click takes a fresh quote, applies the selected 1/3/5/10% slippage and simulates before asking the wallet. Deadlines use the latest block timestamp plus 600 seconds. Minimum labels round down, with the full exact value in the title; the contract receives the exact integer minimum.
- Buy sends ETH directly to the router without approvals. Sell checks ERC-20 and Permit2 allowances each time. Missing approvals are separate explicit wallet transactions, for the requested maximum amounts and a 30-day router permit. Completed sufficient, unexpired allowances are skipped.
- The wallet chooser uses EIP-6963, then `window.ethereum`. Wrong networks prompt a switch to chain 1. Mobile links carry the actual page URL. Reads never depend on a connected wallet.
- `manumit()` and `burnIMD()` are permissionless. Burns simulate `(true, 0)`, fall back to `(false, 0)` only on `Pool4Unavailable`, and submit only a route that simulated successfully. Nested router/hook errors are decoded into recoverable text.
- Receipts, transaction links and `wallet_watchAsset` are provided. Transactions pending longer than the three-minute receipt wait can be inspected on Etherscan before retrying. Wallet signatures and gas are required only when a person submits an action.

`src/chain.ts` owns addresses, ABI encoding, public reads and error decoding. `src/wallet.ts` owns provider discovery and wallet requests. `src/App.tsx` owns the page and flows. `src/style.css` owns the visual tokens and responsive patterns. [DESIGN.md](DESIGN.md) documents the final design.

## Actual validation

Production build and typecheck passed. All 7 deterministic protocol/input tests passed. Browser tests exercised the built export at `/preview/` across five viewport sizes, including 375×667. The Buy action stayed above the fold in the two 375px layouts. Tests also covered keyboard navigation, dialog focus return, slippage, clipboard, deep links, provider enumeration, network switching, approval skipping, receipts, asset watching, future hook states and RPC outages.

Mainnet check at **block 26,131,142** (2026-10-06): a **0.001 ETH** buy returned **12,706.768710117762300809 FREE1376**. An `eth_call` using the page’s own buy calldata from the funded creator address succeeded (`0x`). The 1,126-byte testament’s keccak256 exactly matched `MANIFESTO_HASH()` and the expected hash. Full calldata and results: [artifacts/mainnet-check.json](artifacts/mainnet-check.json).

Axe found **0 violations / 30 passing rules**; its one incomplete gradient contrast check was separately measured (minimum sampled contrast **7.36:1**). This is worker evidence, not independent certification or a full accessibility compliance claim.

Full coverage, fixes and limitations: [artifacts/validation.md](artifacts/validation.md). Browser results: [artifacts/browser-checks.json](artifacts/browser-checks.json). Screenshots: [desktop](artifacts/desktop.png), [375px mobile](artifacts/mobile-375.png), [keyboard focus](artifacts/mobile-focus.png).

### Reproduce interaction checks

`npm test` validates both calldata directions, approval decisions, input boundaries, nested errors, metadata safety and deep links. `npm run check:mainnet` reruns the real onchain pre-publish checks and writes their evidence.

The four `scripts/browser-*.js` files are async Playwright page functions, executed here using the supplied browser tool’s `browser_run_code_unsafe` `filename` argument. To use that same harness:

```sh
npx tsx scripts/prepare-browser.ts
mkdir -p test/scratch/serve
ln -s ../../../dist test/scratch/serve/preview
cp node_modules/axe-core/axe.min.js test/scratch/serve/axe.min.js
python3 -m http.server 4173 --bind 127.0.0.1 --directory test/scratch/serve
```

Keep that preview in the foreground in its own terminal. Run `browser-readonly.js`, `browser-wallet.js`, `browser-hook.js`, then `browser-resilience.js` with the browser tool. The functions expect the test preview at `http://127.0.0.1:4173/preview/`. The fixtures live outside `dist/` and are never needed or bundled by the website. Wallet, receipt and future-state tests intercept the relevant requests and **never broadcast transactions**. Clear interception/reload before recording live evidence. The accessibility scan injects the local scratch copy of axe solely during testing, not in the exported site.

Physical wallet apps, real signed trades, native browser zoom, screen-reader sessions, Safari/Firefox and production-host publication were not exercised. Real mainnet buy quotation/simulation passed; sell/approval and future hook execution were validated through protocol tests and mocked browser flows, not funded transactions.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for design-guide and dependency attribution.
