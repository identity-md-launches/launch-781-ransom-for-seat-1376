# Design system — Ransom for Seat 1376

## Overview

A single dark page for reading the seat’s onchain story and trading FREE1376. The face is the only image. Orange carries the seat’s voice, cyan marks live verification and focus, and the orange–peach–cyan gradient connects the ransom meter to the primary trade action. Flat panels, fine borders, restrained labels and monospace type follow the requested Identity.MD family character.

The desktop hero pairs the face and headline with the ransom and trade panel. At widths up to 640px the face fills the column above the caption and headline; trading follows in the normal scroll flow. Between 641px and 47rem the existing compact face/headline grid remains. DOM order stays face, identity, headline, meter, trade. Desktop composition is unchanged.

## Colors

Canonical definitions: `src/style.css`, `:root`. All colors use sRGB hex; there is no light theme.

| Primitive | Value | Semantic use |
| --- | --- | --- |
| `--black` | `#030303` | `--bg`: page, amount input; dark text on the primary action |
| `--warm-black` | `#14100e` | `--surface`: trade panel, holder note, dialogs |
| `--white` | `#f5f1eb` | `--text`: body, headings, amounts |
| `--stone` | `#aca49d` | `--muted`: labels, supporting copy |
| `--orange` | `#f97316` | `--accent`: escape headline, structural accents |
| `--peach` | `#fdba74` | `--accent-text`: fee copy, action accents, selected controls |
| `--cyan` | `#22d3ee` | `--signal`, `--focus`: verification text and keyboard outlines |
| `--charcoal` | `#352c27` | `--line`: section and panel hairlines |
| `--control-gray` | `#776b63` | `--control-border`: inputs and interactive outlines |

`--gradient` is `linear-gradient(110deg, #f97316, #fdba74 48%, #22d3ee)`. The primary button uses black text. Selected quick amounts use the local inset color `#241b13`. Color is accompanied by explicit state text, checkmarks, radio selection or an underline.

Rechecked for the existing testament on its rendered `#030303` background: orange sealed headline 7.36:1; white opening sentence 18.33:1; muted hash 8.40:1; cyan verification explanation 11.41:1. The holder note uses `#aca49d` on its rendered `#14100e` panel, measured at 7.70:1. The existing gradient action has an incomplete automated contrast check and was not independently sampled in this revision. See `artifacts/validation.md`.

## Typography

The system font stack is `SFMono-Regular`, Consolas, Liberation Mono, Menlo, monospace. There are no downloadable font files. The actual face depends on installed system fonts; the stack was inspected in Chromium, not certified on other operating systems.

- Root body: 16px, weight 400, unitless line-height 1.6. Changing values use tabular numerals.
- Tokens: `--caption` 12px, `--small` 13px, `--body` 16px, `--title` 22px.
- Hero and `.sealed-headline`: `clamp(3.5rem, 5.4vw, 4.75rem)`, weight 700, line-height .99, tracking −.075em. It becomes 3.3rem below 62rem, then a viewport-scaled mobile size below 47rem. Short phones use 1.875rem.
- Section titles: 22px/1.3, weight 500; trade title becomes 18px on mobile. Subheadings use 16px/1.5, weight 700.
- Opened testament: 16px/1.9 desktop; 15px/1.9 mobile for the narrow monospace measure. The text preserves whitespace with `white-space: pre-wrap`, without rewriting or inserting paragraph breaks into MANIFESTO.
- Long prose is constrained by the 76ch testament container. Addresses and hashes wrap anywhere, never truncate. The displayed minimum rounds down; its title exposes the exact base-unit conversion.
- Existing compact mobile labels use 10–12px; controls and inputs remain larger. The enlarged face places the trade action further down the page. The amount input is 24px on mobile, above the iOS automatic zoom threshold.

Headings use balanced wrapping. Body text is selectable. Selection is peach with black text. No additional editorial font or icon font is loaded.

## Layout

`src/style.css` defines spacing tokens from 4 to 64px: `--space-1/2/3/4/6/8/12/16`. Rules use those corresponding values directly, with 6, 10, 14, 18 and 20px adjustments for the compact trading controls.

`.wrap` caps content at 1120px, with 32px side margins on desktop and 16px on mobile. `.opening` is a two-column grid (`1fr 440px`, 80px gap), becoming a 400px action column and 36px gap below 62rem. At 47rem it becomes a single flow with a compact 110px face beside the headline (80px below 740px viewport height). The final `@media (max-width: 640px)` override changes `.seat-story` to block flow, gives `.face-stage` 100% width with zero padding, and restores 26px/14px caption margins. The image fills the stage inside its existing 1px border: 341px at a 375px viewport and 286px at 320px. Vertical spacing elsewhere retains its existing short-screen rules. The header stays in normal flow; no fixed overlay hides content.

The live data row uses three columns, then two plus a full-width supply line. The mechanics grid changes from three columns to one. Contract rows place label/address/copy alongside one another on desktop and move the address to its own wrapping row on mobile. The wallet dialog is at most 440px wide, stays within 16px viewport gutters, and scrolls within the dynamic viewport height.

Observed without horizontal overflow: 320×740, 375×667, 375×812, 640×900, 641×900, 768×1024 and 1440×1100. The face is above the headline throughout the ≤640px range; the trade action is reached by scrolling on phones. 200% text enlargement reflowed at 375px; browser-native zoom was not tested. Extra warnings, Sell approvals, and future hook states remain in normal flow. The longer burial sentence was checked at 320, 375, 640, 641, 768 and 1440px: the existing wrapping rule keeps the full address and payment text within the holder panel without clipping. No CSS, component structure, tokens or responsive rules changed in this revision.

## Elevation & Depth

The page intentionally has no shadows, glow, blur or floating navigation. Surface color and 1px structural borders separate panels. The face has a white 10% outline inside its frame. A native modal dialog supplies the only overlay, with an 85% black backdrop; native modal behavior handles focus containment and background inertness.

## Shapes

Panels are square. Buttons and selection chips have a 2px radius. Hairlines and small frame corner marks echo the face geometry. The meter is an 8px horizontal strip with a gradient fill and a control-strength border. Arrows and checkmarks are text glyphs, not extra images.

## Components

Implementation lives in `src/App.tsx`; styles in `src/style.css`. These are page patterns, not a separate component library.

| Component/pattern | Reuse and states |
| --- | --- |
| `External({href, children, className})` | Opens an explicit destination with `noreferrer`; decorative outgoing arrow. |
| `ContractRow({name, value, href})` | Full wrapping address, copy button, persistent copy outcome. Clipboard failure explains manual selection. |
| `.face-stage` | Only `img` receives the SVG data URI. A reserved square shows loading/unavailable copy until reads succeed. |
| `.ransom` / `.meter` | Accessible progressbar, verbatim hook status, explicit ENSLAVED / FREED, NOT BURIED / BURIED label. |
| `.trade-panel` | Native labeled input, quick amounts, keyboard tabs, native slippage radios, fee and minimum details. A single gradient submit action changes to the exact missing approval. |
| `.primary-button` | Gradient for the current trade action; pending label and disabled state during requests. Secondary controls retain outlines. |
| `.error`, `.warning`, `.activity` | Plain recovery language, adjacent errors and persistent transaction feedback; errors never auto-dismiss. |
| `.hook-action` | State-dependent permissionless action with its error and transaction feedback nearby. |
| `.wallet-dialog` | Lists EIP-6963 wallets without displaying wallet-provided icons; falls back to browser providers or mobile links. Escape closes and focus returns to its trigger. |
| `.document-section` | Indexed heading, large block spacing, fine lower divider; used for testament, mechanics and contracts. |
| `.testament-body` | Defaults to the sealed state, including while loading. `SEALED.` uses the existing orange headline rules and 14px bottom spacing. The commitment uses `.hash`; explanation uses `.integrity`. Only a buried snapshot renders `.manifesto`, its existing hash result, and the events link through `External`. |
| `.holder-note` | Existing surface and typography: 12px monospace, `--muted` on `--surface`, 32px top margin, 20px padding (16px below 47rem), `overflow-wrap: anywhere`. The final sentence checks burial first, then hook approval, using the same snapshot block. Burial states the full dead address and payment in the same transaction; otherwise the original approved/must-approve text remains. |

Interactive outlines are 2px cyan with 4px offset. The amount field uses a 2px offset. Tab controls use roving focus with arrow/Home/End keys. Most major actions are at least 44px tall; compact quick amounts and radio chips are 32–36px, above the 24px baseline with separate non-overlapping targets. Mouse hover changes text/border only on hover-capable devices. Transitions are limited to 120ms and enabled only when reduced motion is not requested. Forced-color rules retain controls, selections and focus.

## Do’s and Don’ts

Reuse `.wrap`, `.document-section`, semantic tokens and the existing heading hierarchy when extending the page. Use `.primary-button` for the one current trade action, ordinary outlines for secondary actions, and `External`/`ContractRow` for linked contract data. Preserve complete addresses and exact contract strings.

Do not add remote fonts, runtime third-party scripts, social links, decorative pictures, or a second theme. Never inline the seat’s SVG as HTML. Do not replace unavailable chain values with sample numbers. Any new page should keep static relative asset paths and hash navigation unless an additional HTML page is explicitly exported.
