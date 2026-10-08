# Design system — Seat #1376 / FREE1376

## Overview

A static, dark, monospace Ethereum website in three hash-selected acts. This continuation of job `e7e7db8f-092b-4d71-8deb-45d9ee6946cc` repairs the seven reviewed issues while retaining the established design. The first act contains the portrait, ransom meter, trading panel and testament. The second contains the letter/watch and, after verified payment, the paid headline, disclosures, offer, MAY HE SELL, CHART, EVERY SWAP and RECOUPED. The third retains the key gate and provenance.

Reuse the existing rails, typography and functional panels. Orange carries the seat's voice; cyan marks verification, upward movement and focus. Onchain SVG metadata remains inside image elements. No font, icon library, theme or visual component was added. Review evidence and limitations are in `artifacts/validation.md`.

## Colors

Canonical values and aliases are in `src/style.css:1`:

| Primitive | Value | Role |
| --- | --- | --- |
| `--black` | `#030303` | `--bg`, page/input backgrounds and primary-button text |
| `--warm-black` | `#14100e` | `--surface`, trade/holder/dialog panels |
| `--white` | `#f5f1eb` | `--text`, body and numerical values |
| `--stone` | `#aca49d` | `--muted`, secondary labels |
| `--orange` | `#f97316` | `--accent`, headline, selected chart mode, downward movement |
| `--peach` | `#fdba74` | `--accent-text`, active links, bag ETH, chart line |
| `--cyan` | `#22d3ee` | `--signal`, `--focus`, upward movement |
| `--charcoal` | `#352c27` | `--line`, structural dividers |
| `--control-gray` | `#776b63` | `--control-border` |

The existing gradient is `linear-gradient(110deg, #f97316, #fdba74 48%, #22d3ee)`. `src/live-paid.css` aliases `--live-up` to `--signal` and `--live-down` to `--accent`. BUY/SELL labels, arrows, signed nonzero impacts, active underlines and `aria-pressed` supplement color. Zero impacts now display `0.00%` without a sign.

Measured rendered pairs in `artifacts/live-fixes-render.json`: cyan on page black 11.41:1, muted on black 8.40:1, orange on black 7.36:1. These identified solid pairs do not establish contrast for every gradient or overlay.

## Typography

`--font` is `SFMono-Regular`, Consolas, `Liberation Mono`, Menlo, monospace. Fonts are system-provided, with no font download. Root text uses 16px/1.6, weight 400, tabular numerals and antialiasing. Caption/small/body/title tokens are 12/13/16/22px. Section titles use 22px/1.3 and weight 500. The hero/sealed headline retains its responsive clamp, 700 weight, .99 line-height and −.075em tracking. The manifesto/letter uses 16px/1.9 desktop and 15px/1.9 mobile; full addresses wrap and remain selectable.

MAY HE SELL uses `clamp(76px, 19vw, 152px)`, weight 800, line-height 1, −.075em tracking, .54em digit slots and a .49em percent sign. Its point retains a .3em slot. `.live-punctuation` now uses centered inline flex, visible overflow and no flex shrinking, centering the glyph inside the narrow slot instead of positioning its full font advance from the slot's left edge. Bag ETH and market-cap punctuation use the same centering rule with their existing natural widths. Reels remain clipped independently; each whole value has one accessible label.

Bag text remains 14px (13px below 560px); tape values 13px (12px below 560px); chart grid labels 11px; status 20px/800 (18px below 560px). Current chart values retain two decimals. Quarter-point tick labels use two decimals when necessary. Precision is presentation-only; permission decisions retain exact bigint comparisons.

Four monospace choices were rendered in Linux Chromium: Liberation Mono, DejaVu Sans Mono, FreeMono and the generic fallback. Point/glyph box centers differed by at most 0.008 CSS px in those checks. Native SF Mono/macOS rendering remains unverified.

## Layout

Spacing tokens `--space-1/2/3/4/6/8/12/16` map to 4/8/12/16/24/32/48/64px. `.wrap` caps content at 1120px with 32px desktop gutters and 16px gutters below 47rem. The header stays in normal flow.

The first-act `.opening` grid remains `1fr 440px` with an 80px gap, using a 400px action column and 36px gap below 62rem. Below 47rem it stacks. The 641px–47rem story grid retains its compact portrait/headline; at ≤640px the portrait fills the story column. `.hero-note` and `.testament-link` are now visible at every width. Below 47rem they span the story grid so both sit below `.made-free` in reading order. The phone testament link uses the same hash navigation and wording as desktop.

Act navigation retains native hash links, equal desktop columns and mobile `.8fr 1.2fr 1fr` proportions. The active link has an underline and `aria-current`. Sections retain the orange testament rail and 76ch maximum measure. `.paid-section` groups content with existing 32px separation and 12px heading gaps. Native disclosures retain 13px labels, dividers and 44px targets. Contract rows stack on phones.

`LiveSellChart` uses a responsive SVG viewBox 262 units high, with chart top/bottom at 48/230, minimum 46px left gutter and 76px space at right. The line retains its existing padding and animation. Its lower bound is clamped to zero. `src/chartAxis.ts` derives ticks from the current animated range using steps of 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 25 or 50 points. Ticks remain exact multiples while the line glides. The 100% rule is still dashed cyan. This numeric range does not determine permission to sell.

Below 560px the tape token column is hidden visually but retained in the transaction link's accessible name. Meter labels and the flag reflow as before. Browser checks covered 320, 360, 559, 560, 768 and 1440px in the second act; phone hero checks additionally covered 641, 700 and 752px. Actual mainnet layouts were inspected at 320, 360, 560 and 1280px. No document overflow was observed. Native zoom, RTL and physical devices were not tested.

## Elevation & Depth

The base site uses flat panels and 1px structural dividers. Seat/key images retain their outlines; the native wallet dialog uses its existing dark backdrop. Paid sections retain their orange line/area glow, direction feedback, floating change chip and live head pulse. No new shadow, overlay or glow was added.

## Shapes

Use existing rectangular panels, outlined controls and round active indicators. The live block pill, chart switch and distance badge retain their rounded pill shapes. The meter's existing rounded track clips its full-width orange/peach/cyan gradient. SVG lock/flag icons retain currentColor strokes. Punctuation is the font's glyph, not a replacement icon or image.

## Components

| Component / source | Behavior and states |
| --- | --- |
| `Odometer`, `LiveSellMeter` / `src/LivePaidSections.tsx` | One accessible full value; aria-hidden reels; centered punctuation; exact permission rule, progressbar, block pill, lock and distance. Failed reads keep the previous good reading. |
| `LiveSellChart` / `src/LiveSellChart.tsx` | Native LIVE/SINCE THE BURN buttons; `aria-pressed`; hover/tap and arrows/Home/End for point detail; slider name/value text; empty dash; unchanged recovery copy. |
| `EverySwap` / `src/LivePaidSections.tsx` | Seven newest transaction anchors; BUY/SELL, trader ETH, token amount, impact and age. Required fee adjustment affects ETH text, accessible name and proportional bar consistently. |
| `Watch` / `src/Watch.tsx` | Existing definition-list rows, verdicts and stable polite retry region. `watchBatch.ts` supplies one complete aggregate per 15-second tick, retaining previous values on failure. |
| First-act snapshot / `src/snapshotBatch.ts` | One aggregate per refresh after one-time IMD discovery. Optional feed failures hide dollar estimates; sealed manifesto data stays unexposed; existing failure text and cadence are retained. |
| `Provenance`, hero/testament / `src/App.tsx`, `src/Provenance.tsx` | The made-me-free line precedes the restored phone hero note and native testament link. Testament gating, reveal and hash verification remain unchanged. |
| `PaidSecondAct`, `Letter`, `Recouped` | Existing headline, receipt, disclosures, offers, letter, wallet record and recovery rendering retain their source bytes. |
| Trade and wallet controls / `src/App.tsx`, `src/chain.ts`, `src/wallet.ts` | Existing quotes, approvals, simulation, transaction flow, dialog and errors; transaction modules remain byte-identical. The read adapter is the only integration change to handlers. |

Focus retains the cyan 2px outline/4px offset and forced-color handling. Reduced motion disables the existing reels, chart interpolation, glow, pulse, chip, burst and shake. Native keyboard navigation and wallet dialog Escape were exercised. No screen-reader session or physical-device test is claimed.

## Do's and Don'ts

Start from `.wrap`, the existing section/contract-row patterns and semantic color aliases. Preserve the requested wording, monospace stack, static relative URLs and locally bundled icons/licenses. Keep extra read logic in separate modules; preserve `chain.ts`, `wallet.ts`, CSP and dependency/build configuration for this revision.

Use bigint amounts for economic decisions and round only for presentation. Preserve the odometer's narrow slot and centering together. Generate chart ticks from round numeric steps; never interpolate label values into arbitrary fractions. Keep errors recoverable and retain previous good readings. Do not substitute sample live data or introduce a new palette, font, backend, theme or wallet stack.
