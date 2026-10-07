# Design system — Seat #1376 / FREE1376

## Overview

A dark, monospace Ethereum site in three hash-selected acts. The first retains the existing seat portrait, ransom meter, trading panel, testament, mechanics and contracts. The second is a sealed testament-style block. The third presents the key's contract image and provenance. The new navigation sits immediately below the existing header; all other first-act composition stays in place.

Orange carries the seat's voice, cyan marks verification and focus, and warm black distinguishes functional panels. The only content images are the onchain seat and key, each rendered as an `img` with a data URI. No new theme, font or component library is introduced.

## Colors

Canonical sRGB values and semantic aliases live in `src/style.css:1`.

| Primitive | Value | Semantic role |
| --- | --- | --- |
| `--black` | `#030303` | `--bg`, page/input backgrounds; primary-button text |
| `--warm-black` | `#14100e` | `--surface`, trade/holder/dialog panels |
| `--white` | `#f5f1eb` | `--text`, body and values |
| `--stone` | `#aca49d` | `--muted`, labels and sealed marks |
| `--orange` | `#f97316` | `--accent`, headline and testament border |
| `--peach` | `#fdba74` | `--accent-text`, selected tabs and fee text |
| `--cyan` | `#22d3ee` | `--signal`, `--focus` |
| `--charcoal` | `#352c27` | `--line`, structural hairlines |
| `--control-gray` | `#776b63` | `--control-border`, controls and tab baseline |

`--gradient` is `linear-gradient(110deg, #f97316, #fdba74 48%, #22d3ee)`. Active navigation has a peach underline and `aria-current`, so color is not its only cue. The favicon uses the key's circular ring, an orange-to-peach stroke on black; its outer stroke is 4 units in a 32-unit viewBox, with a faint inner ring matching the original key artwork.

Rendered testament contrast measured in Chromium: orange/black 7.36:1, white/black 18.33:1, muted/black 8.40:1, cyan/black 11.41:1. The holder panel's muted/warm-black pair measured 7.70:1. The existing gradient action remains an incomplete automated contrast check; no full accessibility certification is claimed.

## Typography

`--font`: `SFMono-Regular`, Consolas, `Liberation Mono`, Menlo, monospace. System fonts only, with no font downloads. Root: 16px/1.6, weight 400, tabular numerals, antialiasing. Actual installed fallback varies by system.

Tokens: caption 12px, small 13px, body 16px, title 22px. Section titles use 22px/1.3 at weight 500. Hero and `.sealed-headline` use `clamp(3.5rem, 5.4vw, 4.75rem)`, weight 700, line-height .99, tracking −.075em. Below 62rem this becomes 3.3rem, below 47rem `clamp(1.9rem, 8.9vw, 3.4rem)`, and on short phones 1.875rem. The third act intentionally adds no visible heading or explanatory copy.

Act links use 13px desktop / 12px mobile and 10px sealed marks, retaining the site's compact label hierarchy. Their labels stay on one line at 360px; at narrower widths or enlarged text their contents may wrap. The opened manifesto stays 16px/1.9 desktop, 15px/1.9 mobile, preserving its whitespace. Long addresses and hashes wrap anywhere; only the explicitly abbreviated dead-address links stay unbroken.

`src/display.ts` formats changing quote values without floating-point conversion: two fixed decimals for FREE1376, six for ETH, thousands separators on both quote lines. Estimates round to nearest, minimums down, and exact values remain in titles. The paid amount truncates to four decimals; the remaining ETH rounds up to four, so the displayed pair sums to 2.8.

## Layout

Spacing tokens `--space-1/2/3/4/6/8/12/16` map to 4/8/12/16/24/32/48/64px. `.wrap` caps width at 1120px with 32px desktop gutters; below 47rem gutters are 16px. Header remains in normal flow.

The first act's `.opening` grid uses `1fr 440px` with an 80px gap, becoming a 400px action column with a 36px gap below 62rem. Below 47rem it becomes one column; at ≤640px the face fills the story column above the caption/headline. The 641px–47rem compact face/headline grid is retained. Trade and hook controls remain in normal flow. Live data and mechanics reflow from columns to stacked content. Existing contract rows move addresses below labels on phones.

`.act-tabs` reuses `.trade-tabs`, adding three native links instead of trade buttons. Desktop columns are equal; mobile proportions are `.8fr 1.2fr 1fr` to accommodate the sealed marks. Each link has at least 44px height, 14px vertical padding, and an active 2px underline. No scrolling tab strip or clipped labels.

Second-act spacing and border come from `.document-section` and `.testament-body`: 64px desktop section padding, existing mobile section spacing, a left orange line and a 76ch maximum measure. Third-act `.key-act` also caps at 76ch. Its image caps at 440px and shrinks with available width; a 32px gap precedes the rows. `.key-row` reuses `.contract-row`, with 150px label plus a flexible value column on desktop, one column below 47rem. Full checksummed holder/liberator addresses remain selectable.

Rendered checks cover 320, 360, 375, 640, 641, 768 and 1440px, plus short/tall 375px viewports. No horizontal document overflow was observed. Act links also reflowed under 200% text enlargement. Native browser zoom was not exercised.

## Elevation & Depth

Flat surfaces and 1px dividers; no shadows, glows or floating navigation. Seat and key images have white 10% outlines. The existing native wallet dialog uses an 85% black backdrop, contains scrolling, and retains native modal focus behavior.

## Shapes

Square panels, 2px control corners, 8px meter. The new ring favicon is circular without introducing a rounded panel style. The social preview is 1200×630: the actual seat face in its outlined frame beside `SEAT #1376` and `$FREE1376`, in the same palette and monospace stack. Source assets live in `public/`; identical copies ship in `dist/`.

## Components

| Pattern / source | Behavior |
| --- | --- |
| `External`, `ContractRow` / `src/App.tsx` | Existing external links with decorative arrows; full address, copy control and persistent result. The key contract/resource use these patterns. |
| `.act-tabs` / `src/App.tsx:507` | Native hash links with `aria-current="page"`; second always marked sealed, third until key supply is 1. Tab/Enter navigation, ordinary browser history and shareable links. |
| `useAct`, `scrollToHash` / `src/acts.ts` | Hash selects exactly one act. Act links scroll to top; other hashes select the first act and scroll to the matching section if present. |
| `seatCopy`, `feeNote` / `src/display.ts` | Existing enslaved copy; paid-state fire copy; buried headline/title. Each state is tested. |
| `.testament-body` / `src/App.tsx` | First-act testament remains sealed until a buried snapshot. Second act renders only `SEALED.` and its specified opening sentence, without a commitment or chain reads. |
| `useKey`, `KeyAct` / `src/KeyAct.tsx` | Key image and definition-list rows. Supply zero shows only `holder: nobody yet`. Given key adds conditional liberator, transaction if logs succeed, witness counts/request, Etherscan/OpenSea. |
| `readKey` / `src/key.ts` | Reads at one block; contractURI before issuance, tokenURI afterwards. Full checksum conversion, exact log window and first-16-byte UUID. SVG remains in an img. |
| Existing trade/dialog/hook controls | Quote, slippage, approval, simulation, transaction and error behavior retained. Original action handlers and both transaction modules are byte-identical. |

Key polling retries every 15 seconds; an initial failure leaves the key section busy and empty, and later failures retain the last successful data. This follows the assignment's prohibition on extra third-act text; it does not invent a holder or add an error paragraph. A direct second-act load makes no RPC reads and retains the initial browser title until another act reads the seat. Once known, burial controls the title across act switches.

Existing focus outlines remain 2px cyan with 4px offset; forced-color rules use `Highlight`. Reduced motion disables the existing 120ms transitions. Navigation adds no animations. Wallet Escape and focus return, trade keyboard tabs, validation focus and copying were exercised.

## Do's and Don'ts

Use `.wrap`, existing semantic color tokens, `.document-section`, and contract-row spacing. For another act, use native hash links and keep browser history/keyboard behavior. Preserve `chain.ts`, `wallet.ts`, the CSP and transaction handlers when making presentation changes. Only pass decoded SVG metadata to `img`; never inject it into the document. Keep exact base-unit values for trading and conservative display rounding for minimums.

Retain the requested wording, system monospace stack, static relative URLs and locally bundled icons. Use one gradient primary trade action. Do not introduce new explanatory copy into the sealed/key acts or replace unavailable chain data with sample values.
