# Design system — Seat #1376 / FREE1376

## Overview

This continuation of job `4556beff-adfc-40ab-83b9-f70c713aa41d` changes only wallet-history discovery. All components, product copy, styling, assets and layout are byte-identical to that parent. The production export and responsive states were rechecked on 7 October 2026; see `artifacts/validation.md`.

A dark, monospace Ethereum site in three hash-selected acts. The first retains the existing seat portrait, ransom meter, trading panel, testament, mechanics and contracts. The second retains the full letter and watch until the full-burn verdict or a verified paid block. The paid block persists even when new tokens arrive in those wallets. Its paid state uses the same rail, sealed headline, meter and contract rows, with two folded disclosures and a quote-history chart. The third retains the key image/provenance below the sale-recovery gate and remains marked sealed. The new navigation sits immediately below the existing header; all other first-act composition stays in place.

Orange carries the seat's voice, cyan marks verification and focus, and warm black distinguishes functional panels. The only content images are the onchain seat and key, each rendered as an `img` with a data URI. No new theme, font or component library is introduced.

## Colors

Canonical sRGB values and semantic aliases live in `src/style.css:1`.

| Primitive | Value | Semantic role |
| --- | --- | --- |
| `--black` | `#030303` | `--bg`, page/input backgrounds; primary-button text |
| `--warm-black` | `#14100e` | `--surface`, trade/holder/dialog panels |
| `--white` | `#f5f1eb` | `--text`, body and values |
| `--stone` | `#aca49d` | `--muted`, labels and sealed marks |
| `--orange` | `#f97316` | `--accent`, headline, testament border and chart line |
| `--peach` | `#fdba74` | `--accent-text`, selected tabs and fee text |
| `--cyan` | `#22d3ee` | `--signal`, `--focus` |
| `--charcoal` | `#352c27` | `--line`, structural hairlines |
| `--control-gray` | `#776b63` | `--control-border`, controls and tab baseline |

`--gradient` is `linear-gradient(110deg, #f97316, #fdba74 48%, #22d3ee)`. Active navigation has a peach underline and `aria-current`, so color is not its only cue. The favicon uses the key's circular ring, an orange-to-peach stroke on black; its outer stroke is 4 units in a 32-unit viewBox, with a faint inner ring matching the original key artwork.

Rendered paid-state measurements are 18.33:1 for offer/body text (`#f5f1eb` on `#030303`), 8.40:1 for receipt/chart-detail labels (`#aca49d` on `#030303`), and 7.36:1 for the headline (`#f97316` on `#030303`). These were computed from browser styles in this revision; records are in `artifacts/record-browser.json`. The chart line uses the same orange; its 100% threshold is dashed muted gray, so position and line style also distinguish it. No full accessibility certification or new gradient analysis is claimed.

## Typography

`--font`: `SFMono-Regular`, Consolas, `Liberation Mono`, Menlo, monospace. System fonts only, with no font downloads. Root: 16px/1.6, weight 400, tabular numerals, antialiasing. Actual installed fallback varies by system.

Tokens: caption 12px, small 13px, body 16px, title 22px. Section titles use 22px/1.3 at weight 500. Hero and `.sealed-headline` use `clamp(3.5rem, 5.4vw, 4.75rem)`, weight 700, line-height .99, tracking −.075em. Below 62rem this becomes 3.3rem, below 47rem `clamp(1.9rem, 8.9vw, 3.4rem)`, and on short phones 1.875rem. The third act uses the existing 12px label style for the conditional `Welcome, keyholder.` line and retry message. The new gate uses body type, with a 32px gap above the preserved key.

Act links use 13px desktop / 12px mobile and 10px sealed marks, retaining the site's compact label hierarchy. The second act has no sealed mark. Their labels stay on one line at 360px; at narrower widths or enlarged text their contents may wrap. The opened manifesto stays 16px/1.9 desktop, 15px/1.9 mobile, preserving its whitespace. Its full text reserves the final height throughout the 120-character/second reveal, preventing layout shifts. The visual overlay is aria-hidden and unselectable; the complete text underneath remains selectable and available to assistive technology. Long addresses and hashes wrap anywhere; only the explicitly abbreviated dead-address links stay unbroken.

The second-act letter reuses `.manifesto` at 16px/1.9 desktop and 15px/1.9 mobile. Its opening sentence is an h1 with inherited body typography (400 weight, normal tracking); remaining paragraphs use native p elements, rules use ol/li, and addresses stay fully selectable and underlined. `src/second-act.css` uses 1.9em paragraph gaps, 3ch list indentation and 0.5em gaps between wallet entries. The whole letter appears immediately with no animation. Watch rows use existing 13px contract values and 12px labels; verdicts use the normal 16px body.

`src/display.ts` formats changing quote values without floating-point conversion: two fixed decimals for FREE1376, six for ETH, thousands separators on both quote lines. Estimates round to nearest, minimums down, and exact values remain in titles. The first ransom paid amount truncates to four decimals; remaining ETH rounds up to four so the pair sums to 2.8. The second ransom's sell proceeds instead round to four decimals for display, percentage to one decimal, market cap to whole dollars; permission is compared in exact bigint wei before rounding. RECOUPED uses the same four-decimal ETH formatting; sale lines reuse two-decimal token formatting, UTC timestamps and existing contract rows. The fulfillment sentence reuses `.sealed-headline` without new styles. The fixed receipt amount is the requested `189,216,124 $FREE1376`, while wallet/watch balances retain two decimals.

## Layout

Spacing tokens `--space-1/2/3/4/6/8/12/16` map to 4/8/12/16/24/32/48/64px. `.wrap` caps width at 1120px with 32px desktop gutters; below 47rem gutters are 16px. Header remains in normal flow.

The first act's `.opening` grid uses `1fr 440px` with an 80px gap, becoming a 400px action column with a 36px gap below 62rem. Below 47rem it becomes one column; at ≤640px the face fills the story column above the caption/headline. The 641px–47rem compact face/headline grid is retained. Trade and hook controls remain in normal flow. Live data and mechanics reflow from columns to stacked content. Existing contract rows move addresses below labels on phones.

`.act-tabs` reuses `.trade-tabs`, adding three native links instead of trade buttons. Desktop columns are equal; mobile proportions are `.8fr 1.2fr 1fr` to accommodate the sealed marks. Each link has at least 44px height, 14px vertical padding, and an active 2px underline. No scrolling tab strip or clipped labels.

Second-act spacing and border come from `.document-section` and `.testament-body`: 64px desktop section padding, existing mobile section spacing, a left orange line and a 76ch maximum measure. The added headline provenance uses `.label` and the existing link underline, with a 16px top margin and full grid width in the compact story layout. Dollar estimates use `.label`, 4px top spacing, and explicit `.pool-value` selectors preserve the existing ETH typography. Third-act `.key-act` also caps at 76ch. Its image caps at 440px and shrinks with available width; a 32px gap precedes the rows. `.key-row` reuses `.contract-row`, with 150px label plus a flexible value column on desktop, one column below 47rem. Full checksummed holder/liberator addresses remain selectable.

Current rendered checks cover the paid view at 320, 360, 640, 641, 768 and 1440px without horizontal document overflow. The native disclosures were opened/closed, full addresses inspected, and real-mainnet paid screenshots checked at 360 and 1440px; the tool browser also inspected the live paid export at 1280px. Native browser zoom and text enlargement were not exercised in this revision. The parent documented an inherited header overflow at 320px with doubled text; that historical result is not a fresh check.

In the unpaid view, the watch begins 32px below the creator hint; in the paid view it follows RECOUPED with the same 32px spacing. Its definition list reuses `.contract-row` padding/dividers with 150px labels and a flexible value column. Below 47rem the labels stack above values. Long amounts and verdicts wrap instead of truncating. Verdict spacing is 24px above and 8px below. No new panel background, shadow or color is added.

The paid-state styles live in `src/paid-act.css`; all three stylesheets are unchanged in this revision. `.paid-section` groups content with 32px separation and 12px heading gaps. `.paid-disclosure` retains the native triangular marker and uses a 1px existing-line divider, 13px summary, 12px vertical padding and a minimum 44px target. Offer rows use existing contract-row padding/dividers but one text column. `.sell-percent` aligns right below the unchanged 8px ransom meter.

The chart occupies 234px vertically; `ResizeObserver` makes its SVG viewBox match its actual container width, preserving 12px label text on phones. It reserves 46px for y labels and uses two endpoint date/time labels rather than crowding small screens. The detail caption wraps and reserves 3.2em height. The origin is the paid block, retained even when payment is the initial latest block. The final point is the live reading; missing historical samples are omitted. Native scrolling remains available on touch (`touch-action: pan-y`). The cyan 2px/4px-offset focus perimeter and forced-colors CanvasText/Highlight rules are scoped to new controls.

## Elevation & Depth

Flat surfaces and 1px dividers; no shadows, glows or floating navigation. Seat and key images have white 10% outlines. The existing native wallet dialog uses an 85% black backdrop, contains scrolling, and retains native modal focus behavior.

## Shapes

Square panels, 2px control corners, 8px meter. The new ring favicon is circular without introducing a rounded panel style. The social preview is 1200×630: the actual seat face in its outlined frame beside `SEAT #1376` and `$FREE1376`, in the same palette and monospace stack. Source assets live in `public/`; identical copies ship in `dist/`.

## Components

| Pattern / source | Behavior |
| --- | --- |
| `External`, `ContractRow` / `src/App.tsx` | Existing external links with decorative arrows; full address, copy control and persistent result. The key contract/resource use these patterns. |
| `.act-tabs` / `src/App.tsx` | Native hash links with `aria-current="page"`; second open, third remains marked sealed, including after the second-act fulfillment notice; connected key owner gets the existing small mark with `yours`. Tab/Enter navigation, ordinary browser history and shareable links. |
| `useAct`, `scrollToHash` / `src/acts.ts` | Hash selects exactly one act. Act links scroll to top; other hashes select the first act and scroll to the matching section if present. |
| `seatCopy`, `feeNote` / `src/display.ts` | Existing state-dependent copy remains. App defaults to the buried headline/title and fire panel before its first snapshot, avoiding the old escape flash. |
| `.testament-body` / `src/App.tsx` | First-act testament remains gated by a buried snapshot, with its existing animation and hash verification. Second act reuses this rail and measure with its full static letter; see `src/SecondAct.tsx` and `src/letter.ts`. |
| `useKey`, `KeyAct` / `src/KeyAct.tsx` | Key image and definition-list rows. Supply zero shows only `holder: nobody yet`. Burial adds the sender (unless the given key names a liberator equal to its holder) and UTC `free since` transaction link. Given key adds witnesses/request and resources, with the requested `brothers · oracle request` separator. Keyholder welcome and read-failure states use existing labels. |
| `readKey` / `src/key.ts` | Reads at one block; contractURI before issuance, tokenURI afterwards. Full checksum conversion and first-16-byte UUID; no log-window query. `src/keyReads.ts` supplies status reads for every act. SVG remains in an img. |
| `Letter`, `SecondAct` / `src/SecondAct.tsx` | Unchanged letter: exact paragraphs/rules, full Etherscan links, live balances and hint. Watch verdicts now use the wallet record. The same Letter component is reused inside the paid disclosure. |
| `SecondActView`, `PaidSecondAct`, `SellMeter` / `src/PaidSecondAct.tsx` | Full-burn verdict or verified paid-block switch. Paid headline, identity sentence and receipt, initially closed wallet and letter details, record-driven contract-row offer, existing ransom meter, quote status, unchanged history chart, recouped and watch. Missing reads use a dash; failures reuse existing error text. |
| `Recouped` / `src/Recouped.tsx` | Four-decimal total and ETH proceeds, UTC sale-block times and two-decimal token amounts. Each sale uses an Etherscan link in the existing `.contract-row.offer-row` style. The fulfillment message uses `.sealed-headline` in a stable polite status region. Loading shows a dash; an empty completed record shows 0.0000. |
| `SellChart` / `src/SellChart.tsx` | Responsive SVG, orange 2px line, muted 5/5 dashed 100% threshold, UTC date/time x axis, percentage y axis. Hover/tap selects the nearest point; arrows/Home/End provide the keyboard path. The slider exposes point details through `aria-valuetext`; the same time/percentage/market cap is visible below. |
| `ThirdActGate`, `ThirdActSeal` / `src/ThirdActGate.tsx` | Exact gate sentence above the key, linking to #second-act; once fulfilled it becomes the exact second-act-fulfilled sentence. Seal independent of key ownership or issuance. The existing yours mark remains. |
| `Watch` / `src/Watch.tsx` | Countdown label, three definition-list contract rows, record-driven buy/early-sale verdicts, and a stable polite retry region. Paid mode shows only FREE1376 for his wallet. Those two verdicts stay absent while the record is pending or failed; last values are retained on failure. |
| `useWatch`, `readWatch`, `watchVerdicts` / `src/useWatch.ts`, `src/watch.ts` | App-level 15-second same-block polling on every act; same public RPC fallback and pool/feed as first act. Exact bigint comparisons; display-only rounding. |
| Existing trade/dialog/hook controls | Quote, slippage, approval, simulation, transaction and error behavior retained. Original action handlers and both transaction modules are byte-identical. |

Key polling retries every 15 seconds on every act, including direct second-act loads. Failed key reads clear stale data and show the exact retry line; the next successful read restores the image and rows. App uses the free title even before a snapshot; subsequent state-derived titles retain their original behavior.

`src/burial.ts` uses one cached dRPC binary search per visit and selects the hook's CreatorPaid receipt sender. `src/Provenance.tsx` shares this result with the hero and updates its elapsed label every minute. `src/dollars.ts` reads Chainlink on the same snapshot refresh and hides failed or stale rounds. No extra placeholder copy is introduced for optional reads. `src/usePaidRansom.ts` and `src/burnVisit.ts` keep the paid block and chart history at App scope, so switching acts cannot restart the successful search or forget payment. `src/useWalletRecord.ts` and `src/recordVisit.ts` separately own the wallet record for the whole visit and extend it when the watch detects a balance change. Archive adapters in `src/paidReads.ts`, `src/burnReads.ts` and `src/recordReads.ts` use dRPC exclusively. Wallet change discovery now bisects only ranges with unequal endpoint balances, ending equal ranges immediately. The initial visit reuses its latest balance and needs two balance reads if unchanged; exact cancellations within an equal-ended range are deliberately invisible. Receipt decoding, classification and proceeds are unchanged. Permission comes from the first-decrease quote at the preceding block, or the current live quote; historical chart samples never decide it.

`src/Testament.tsx` observes the opened paragraph, types once per document visit and preserves full text/height during reveal. Click/tap, keyboard focus, copy, and reduced motion finish immediately. The full text remains in the accessibility tree; only the visual overlay is aria-hidden. Existing hash verification is unchanged.

Existing focus outlines remain 2px cyan with 4px offset; forced-color rules use `Highlight`. Reduced motion disables the existing 120ms transitions and testament reveal. The paid view and chart introduce no animation. Navigation adds no animations. Current browser checks include keyboard disclosure/chart interaction, chart hover and emulated touch, the wallet chooser/Escape, first-act quote direction, the exact letter, automatic paid switching, wallet gifts after payment, own buys, exact pre-sale permission, sales and proceeds, fulfillment, record persistence, and quote recovery. Unit tests cover the record decisions and pending state in addition to the base watch verdicts and countdown boundaries. Existing cross-act skip-link axe warnings are documented; keyboard activation still routes to trading. A physical device and screen reader were not used.

## Do's and Don'ts

Use `.wrap`, existing semantic color tokens, `.document-section`, and contract-row spacing. For another act, use native hash links and keep browser history/keyboard behavior. Preserve `chain.ts`, `wallet.ts`, the CSP and transaction handlers when making presentation changes. Only pass decoded SVG metadata to `img`; never inject it into the document. Keep exact base-unit values for trading and conservative display rounding for minimums.

Retain the requested wording, system monospace stack, static relative URLs and locally bundled icons. Use one gradient primary trade action. Do not introduce new explanatory copy into the acts or replace unavailable chain data with sample values. Keep the letter byte-exact against `scripts/fixtures/second-act-letter.txt`, and keep its independent watch code outside the preserved transaction modules.
