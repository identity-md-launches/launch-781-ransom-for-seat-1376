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

Removed only the shared `fiction-note` paragraph from `src/App.tsx` and its unused rule from `src/style.css`. Both the sealed and opened testament now end at their existing verification content, without replacement text. Every other App and CSS byte, including the holder note and all trade handlers, matches parent commit `2b84bee7172447bd5c90a57e2235bdf8f1e3c96d`. `src/chain.ts`, `src/wallet.ts`, build configuration, manifest, lockfile and ignore file are unchanged. [Preservation evidence](artifacts/preservation.json) records the comparison and hashes.

On 2026-10-06, `npm run typecheck`, all **13 existing tests**, and `npm run build` passed. The final export's HTML, JavaScript and CSS contain neither the removed paragraph (including straight/curly apostrophe variants) nor its class. The export uses relative asset URLs and includes its runtime licenses.

At Ethereum mainnet **block 26,131,912**, a **0.001 ETH** buy quoted **13,493.022326384370127993 FREE1376**, above zero. `eth_call` of the page's own `buildTrade` calldata returned **`0x`** successfully at that same block. The unchanged check uses PublicNode first, with dRPC fallback. No transaction was broadcast. The seat was unburied with the hook approved; opened-state validation used mocked burial responses. [Mainnet evidence](artifacts/mainnet-check.json) includes the amount, calldata, block and response.

Chromium **153.0.8010.12** checked the final production export at `/preview/`; all **111 existing interaction assertions passed**. Coverage includes amounts, slippage, Buy/Sell keyboard tabs, validation/focus, wallet chooser and Escape, clipboard, mobile wallet links, mocked approvals/receipts, hook actions, RPC failure/recovery, testament sealing/opening/hash errors, and all holder-note outcomes. Layout checks passed at **320, 375, 640, 641, 768 and 1440px**, including both short/tall 375px viewports and 200% text enlargement. No page exceptions or failed local resource requests were recorded. [Machine results](artifacts/browser-checks.json).

The pinned Better Interface review covered all six domains. Inspected final screenshots: [desktop](artifacts/desktop.png), [375px phone](artifacts/mobile-375.png), [sealed testament](artifacts/sealed.png), [opened testament](artifacts/opened.png), and [keyboard focus](artifacts/keyboard-focus.png). Both testament screenshots show the deletion with no replacement. The source comparison proves the rest of the page's wording and styling were preserved. [Coverage, findings and limitations](artifacts/validation.md).

| Review domain | Actual coverage |
| --- | --- |
| Accessibility | Native controls/labels, keyboard tabs, validation focus, wallet Escape/focus return and visible testament-link focus checked. |
| Layout | Desktop/mobile screenshots, breakpoint reflow, full holder-address wrapping and 200% text enlargement checked. Only the removed paragraph's natural space disappears. |
| Writing | Parent `src/App.tsx:1022` paragraph removed; every other App byte preserved, including the holder note now at `src/App.tsx:1059`. |
| Typography | Monospace roles, computed sizes and wrapping checked; existing hash and address wrapping preserved. |
| Colors | Rendered testament contrast measured: orange 7.36:1, white 18.33:1, muted hash 8.40:1, cyan 11.41:1 against `#030303`; holder note 7.70:1 against `#14100e`. |
| UI | Trade/slippage/wallet/copy/hook/recovery states checked; reduced-motion primary-button transition is `0s`. Removed the unused parent `src/style.css:724` rule. |

Axe reported the existing minor `role="tabpanel"` finding on the unchanged trade form and an incomplete gradient contrast check. These remain outside this deletion-only change. Screen-reader sessions, native browser zoom, physical wallet apps, signed transactions, Safari/Firefox and the final production host were not tested. Worker observations are not independent certification or a full accessibility compliance claim.

### Reproduce interaction checks

```sh
npm run typecheck
npm test
npm run build
npm run check:mainnet
npx --no-install tsx scripts/prepare-browser.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-note-browsers npx --no-install playwright-core install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/free1376-note-browsers npx --no-install tsx scripts/check-browser.mjs
python3 scripts/check-package.py
```

The existing browser suite assumes the live seat is unburied and approved at its initial live check; if chain state changes, revisit that fixture assumption. It mocks the alternative states, uses `playwright-core` and axe from the existing lockfile, serves `dist/` at `/preview/`, writes evidence to `artifacts/`, and closes its server/browser in the same foreground process. `/tmp/free1376-fixtures/` holds temporary responses and the separately read manifesto. Wallet writes are mocked. Keep port 4173 free.

For this managed assignment, installation and execution used an identical source/configuration copy under `/tmp/free1376-note-check`, with `npm ci --cache /tmp/free1376-note-npm-cache --no-audit --no-fund`, to avoid touching the prohibited repository `node_modules/`. The tested export and evidence were copied back and source/export equivalence checked. Dependencies, npm cache and Chromium stayed under `/tmp`. The supplied browser MCP could not start because its required Chrome binary was absent; the existing standalone runner provided rendered validation instead. No test scripts or dependencies changed.

The static export is **511,222 bytes**. `python3 scripts/check-package.py` passed: even the conservative uncompressed archive estimate including all generated evidence is **under 2 MiB**, below the **8 MiB** budget. [Package report](artifacts/package-report.json) records the inventory and exact totals. No dependency/cache directories, submodules or packaging archives are delivered. Source, existing lockfile and all required runtime assets remain included. The managed workspace excludes `artifacts/` from Git via its protected metadata; generated reports/screenshots remain there for artifact collection, and this README records the essential outcomes independently. Git metadata was not modified; the IdentityMD submission system must commit/package the changed source and export. Publication under **free1376** remains pending that publisher; this workspace exposes no publishing tool or credentials.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for design-guide and dependency attribution.
