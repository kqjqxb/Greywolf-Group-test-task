# DESIGN — PDF Insight visual contract

Owner-approved direction for the UI redesign. Agents implement this; deviations must be reported, not improvised.
Goal: a calm, premium, *cool-toned* tool — not a landing page. The upload zone is the hero.

## Principles
1. **Tool first.** At 1280×800 and 360×740 the upload zone (with its button) is fully visible without scrolling.
2. **Beauty in the background, clarity in the foreground.** Gradients and glass live behind content; text sits on solid-enough surfaces.
3. **Every pixel passes AA.** Text 4.5:1, large text (≥ 24px bold / 32px regular) and UI boundaries 3:1 — in both themes. `src/lib/contrast.test.ts` stays the gate; extend it for every new pair.
4. **Motion is optional.** Everything animated must be disabled under `prefers-reduced-motion: reduce`.
5. **Strict CSP stays.** No external fonts, images or scripts. No inline scripts.

## Palette (tokens — exact values may be tuned only to pass contrast)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F7FB` | `#0A0E1A` | page |
| `--surface` | `#FFFFFF` (glass: 78% alpha + backdrop blur) | `#121829` (glass: 72% alpha) | cards, dropzone |
| `--surface-raised` | `#FFFFFF` | `#182036` | hover, popovers |
| `--text` | `#0F172A` | `#E7E9F3` | body |
| `--muted` | `#4A5568` | `#A4ABC4` | secondary text |
| `--border` | `rgba(79,70,229,.12)` | `rgba(165,180,252,.14)` | decorative edges |
| `--border-strong` | `#8A93B8` | `#5B6488` | inputs, dropzone (3:1) |
| `--primary` | `#4F46E5` | `#8B93F8` | buttons, links |
| `--primary-hover` | `#4338CA` | `#A5ACFA` | |
| `--on-primary` | `#FFFFFF` | `#0A0E1A` | text on primary |
| `--accent-lavender` | `#7C3AED` | `#B79CFB` | gradient stop, icons |
| `--accent-peach` | `#FDBA8C` | `#F4A27A` | decorative only (blobs, gradient end on dark) |
| `--focus` | `#7C3AED` | `#C4B5FD` | focus ring (3:1 vs bg & surface) |
| warning / error / success / info | keep existing semantic tokens, re-tuned to the cool palette | | notices |

**Gradients**
- Background: 2–3 large *static* `radial-gradient` blobs (indigo-300, lavender-300, peach-200 at ~35% light / ~25% dark), fixed to the viewport, no `filter: blur` animation.
- Accent text (hero keyword only, ≥ 32px bold): `linear-gradient(90deg, --primary, --accent-lavender)`; every stop must reach 3:1 on `--bg`. In dark theme the gradient may end on `--accent-peach`.
- Primary button: solid `--primary` (gradient optional only if both ends keep 4.5:1 with `--on-primary`).

## Typography
- **Manrope Variable**, self-hosted (`@fontsource-variable/manrope`, Latin + Latin Extended for Polish). Fallback: `system-ui`.
- Display: 700–800, letter-spacing `-0.02em`, `clamp(2rem, 4.5vw, 3.25rem)`.
- Body 16px / 1.6; small 14px. Measure: max **68ch** for paragraphs.
- Numbers in amounts/dates: `font-variant-numeric: tabular-nums`.

## Shape, depth, motion
- Radius: 12 (controls) · 20 (cards) · 28 (dropzone) · 999 (pills).
- Shadows: soft, tinted (`0 1px 2px rgb(15 23 42 / .04), 0 8px 24px rgb(79 70 229 / .08)`); dark theme uses border glow instead of shadow.
- Durations 150 / 250 / 400 ms, `cubic-bezier(.2,.8,.2,1)`. Cards fade-up 8px on first appearance, staggered ≤ 40 ms.

## Layout and components
- Container max 1040px, side gutter 16px (mobile) / 24px.
- **Header:** logo wordmark left; right: theme icon button. Sticky with glass background on scroll.
- **Hero (compact):** H1 e.g. „Zamień PDF w **konkretne dane**” (gradient on the bold part), one-line subtitle (≤ 68ch), then the dropzone directly below.
- **Dropzone:** glass card, solid 1.5px `--border-strong` border (no dashed corner artifacts) or a dashed border drawn with SVG/`background-image` so corners are clean; icon in a soft gradient circle; drag-over: border → `--primary` + soft glow; primary pill button „Wybierz plik PDF”.
- **Privacy notice:** compact info row with icon under the dropzone, not a heavy block.
- **How it works (1-2-3):** small step chips with clearly visible numbers (`--primary` on soft tint, AA).
- **Progress:** horizontal stepper (Odczyt → OCR (if needed) → Analiza AI) with animated active step + elapsed seconds; skeleton cards of the result below.
- **Result:** dashboard grid (2 columns ≥ 900px):
  - document card with type badge + meta chips (język, data, strony);
  - summary card (larger text);
  - key points with check icons;
  - entities as two lists with avatar-initial chips for people;
  - **amounts** as small cards: value large + currency badge + context;
  - **dates** as a vertical timeline (date left, context right);
  - keywords as pills;
  - JSON panel: primary „Pobierz JSON”, secondary „Kopiuj JSON”, code preview with mono font on `--code-bg`.
- **History („Ostatnie analizy”):** cards in a row/grid with file name, type badge, relative date; delete as icon button with accessible name.
- **Theme toggle:** single icon button (sun ↔ moon), accessible name „Przełącz motyw (jasny/ciemny)”, `aria-pressed`. First visit follows `prefers-color-scheme`; a click stores the explicit choice. Switch animated with the **View Transitions API** as a circular reveal from the button; unsupported browsers or reduced motion → instant switch.

## Must not regress
Polish UI text · keyboard order and visible focus · `aria-live` announcements · 360px without horizontal scroll · print = black on white, controls hidden · JSON export unchanged · CSP unchanged · no `dangerouslySetInnerHTML`.

## Bugs to fix (from owner's screenshot)
1. Theme segmented control: clipped left edge / radius, active option overflowing the group → replaced by the icon button.
2. Dashed dropzone border: gap/artifact in the top-left corner.
3. Step numbers 1–2–3 nearly invisible.
4. Paragraph lines ~110 characters.
5. Flat hierarchy: title, dropzone and notices have equal weight.
