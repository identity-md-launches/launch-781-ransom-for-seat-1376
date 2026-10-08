# Design system — Seat #1376 / FREE1376

## Overview

A static, near-black, monospace Ethereum site with three hash-selected acts. This continuation of job `840d299f-690c-408f-aa14-45dfa61f89ff` changes chart loading, recovery and display-read providers. Existing layout, palette, typography, components and other wording remain intact. All stylesheets are byte-identical to the parent.

The first act contains the portrait, ransom meter, trade panel and testament. The second contains the letter/watch and, after payment, the headline, disclosures, offer, MAY HE SELL, CHART, EVERY SWAP and RECOUPED. The third retains the key gate and provenance. Reuse these rails and functional sections; this revision introduces no new visual system. See `artifacts/validation.md` for the six-domain review and limits.

## Colors

`src/style.css` defines the canonical hex primitives and aliases:

| Primitive | Value | Role |
| --- | --- | --- |
| `--black` | `#030303` | `--bg`: page/input backgrounds and primary-action text |
| `--warm-black` | `#14100e` | `--surface`: trade/holder/dialog panels |
| `--white` | `#f5f1eb` | `--text`: body and numbers |
| `--stone` | `#aca49d` | `--muted`: secondary labels |
| `--orange` | `#f97316` | `--accent`: headline, active chart mode, downward movement |
| `--peach` | `#fdba74` | `--accent-text`: links, bag ETH and chart line |
| `--cyan` | `#22d3ee` | `--signal` / `--focus`: verification, upward movement and focus |
| `--charcoal` | `#352c27` | `--line`: dividers |
| `--control-gray` | `#776b63` | `--control-border` |

The existing meter gradient is `linear-gradient(110deg, #f97316, #fdba74 48%, #22d3ee)`. `src/live-paid.css` aliases `--live-up` to `--signal` and `--live-down` to `--accent`. BUY/SELL, arrows, signed impacts, active underlines and `aria-pressed` supplement color. No new color was introduced.

Measured solid rendered pairs in `artifacts/chart-review.json`: cyan/page black 11.41:1, muted/page black 8.40:1, orange/page black 7.36:1, and black/active orange 7.36:1. These results do not establish every gradient/overlay pair.

## Typography

`--font` is `SFMono-Regular`, Consolas, `Liberation Mono`, Menlo, monospace. Fonts come from the visitor's system; there are no downloads. Root text uses 16px/1.6, weight 400, tabular numerals and antialiasing. Caption/small/body/title tokens are 12/13/16/22px. Section titles use 22px/1.3 and weight 500. Hero/sealed headlines retain the responsive clamp, 700 weight, .99 line-height and −.075em tracking. Letter/testament text uses 16px/1.9 desktop and 15px/1.9 mobile; full addresses wrap and remain selectable.

MAY HE SELL retains `clamp(76px, 19vw, 152px)`, weight 800, line-height 1, −.075em tracking, .54em digit slots and a .49em percent sign. The point uses a .3em slot with centered inline-flex, visible overflow and no shrinking. Bag and market-cap punctuation use the same centering with their established widths. Clipped reels have one accessible full-value label.

Bag text is 14px (13px below 560px); tape values are 13px (12px below 560px); chart grid labels are 11px; permission status is 20px/800 (18px below 560px). Chart values retain two decimals; quarter ticks use two where needed. Financial decisions use bigint; these sizes and rounding rules concern presentation.

This revision inspected Linux Chromium and the computed system-font stack. It did not repeat the parent job's multi-font/macOS checks.

## Layout

`--space-1/2/3/4/6/8/12/16` are 4/8/12/16/24/32/48/64px. `.wrap` caps content at 1120px with 32px gutters, becoming 16px below 47rem. The header remains in normal flow.

The first-act `.opening` is `1fr 440px` with an 80px gap, then a 400px action column/36px gap below 62rem, and stacks below 47rem. The compact story grid at 641px–47rem and full story-column portrait at ≤640px remain unchanged. `.hero-note` and `.testament-link` stay visible and follow provenance in reading order.

Act links use equal desktop columns and `.8fr 1.2fr 1fr` mobile proportions. Active links have an underline and `aria-current`. Sections retain the orange rail, 76ch measure and `.paid-section` spacing: 32px between sections, 12px heading gaps. Native disclosures retain 13px labels, dividers and 44px targets. Contract rows stack on phones.

`LiveSellChart` retains its responsive SVG viewBox, 262 units high, plot top/bottom 48/230, minimum left gutter 46 and right gutter 76. The numeric axis uses the existing nonnegative padded range and round steps from `src/chartAxis.ts`; the 100% line remains dashed cyan. LIVE's points use ordinal spacing; hourly points use their actual block timestamps. The outer chart and empty-state styles remain unchanged.

Below 560px, the tape's token column is visually hidden but included in the transaction link's accessible name. The meter labels/flag retain their reflow. Browser checks found no document overflow at 320, 360, 560, 768 and 1280px. Native zoom, RTL and physical-device behavior were not tested.

## Elevation & Depth

The established flat panels and 1px structural dividers remain. Images keep their outlines; the wallet dialog keeps its dark backdrop. The meter/chart retain their glow, gradient area, direction feedback and head pulse. This revision adds no surface, shadow, overlay or glow.

## Shapes

Reuse rectangular panels, outlined controls and round indicators. The live pill, mode switch and distance badge retain rounded pills. The existing rounded meter clips its gradient. Lock/flag SVGs use `currentColor`. The chart's existing clip rectangle now also reveals the initial line from left to right, without changing its final geometry.

## Components

| Component / source | Behavior |
| --- | --- |
| `Odometer`, `LiveSellMeter` / `src/LivePaidSections.tsx` | Existing accessible full values, centered punctuation, progressbar, live block pill, bag/market values and exact permission rule. A failed live read keeps the previous value and its established retry text. |
| `LiveSellChart` / `src/LiveSellChart.tsx` | Native LIVE/SINCE THE BURN buttons with `aria-pressed`; hover/tap and arrows/Home/End select a point. The slider announces timestamp, percentage and market cap. |
| Chart motion / `src/useChartFrame.ts`, `src/chartMotion.ts` | Empty **“loading…”** until first attempts settle or eight seconds. A 900ms left-to-right reveal on initial draw and mode switches; later movement keeps the existing 850ms cubic ease-out. New points start beyond the right edge, at the left edge using the first value, or halfway between current neighbours. Departures move left. Frame dots are x-ordered even during interruption. Reduced motion is immediate. |
| Chart recovery / `src/hourHistory.ts`, `src/swapVisit.ts`, `src/chartCache.ts` | Cached final points/receipt render immediately. Incomplete reads retry independently. A settled series with no past points retains its available head and shows **“Past reads are unavailable. Retrying…”**. No chart connection-error paragraph remains. |
| `EverySwap` / `src/LivePaidSections.tsx` | Seven latest transaction anchors, unchanged BUY/SELL/ETH/token/impact/age presentation. Only log-read failures show the existing tape retry sentence. Pending point reads leave the affected impact `—`. |
| `Watch`, paid disclosures/offer/RECOUPED, `Letter`, `Provenance`, `KeyAct` | Existing semantics, text and rendering; source preserved apart from the display-reader imports in the read modules. |
| Trade/wallet / `src/App.tsx`, `src/chain.ts`, `src/wallet.ts` | Existing quote, approval, simulation, transactions, modal and errors; all three files retain their bytes. |

Focus retains the cyan 2px outline with 4px offset and forced-color handling. Keyboard chart selection, pointer selection, disclosures, act links and wallet Escape were exercised. Reduced motion produced no active chart animation. Screen-reader announcements were not tested with assistive software; an automated scoped audit found no WCAG A/AA violations at the three tested widths.

## Do's and Don'ts

Start from `.wrap`, `.paid-section`, the existing row/disclosure patterns and semantic color aliases. Keep the established wording, monospace stack, relative static URLs and runtime licenses. Do not add a font, theme, backend or wallet framework to change chart behavior.

Keep financial decisions exact and round only display values. Derive ticks from round steps rather than interpolating arbitrary labels. New display calls belong to the appropriate PAST/LATEST pool; historical state never uses PublicNode. Keep the first-load gate distinct from history completion so an unavailable point can retry without hiding the rest. Preserve `chain.ts`, `wallet.ts`, build/dependency files and existing components when extending these readers.
