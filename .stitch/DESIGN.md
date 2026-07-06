---
name: AccountBox Tactical Ops
colors:
  background: '#010102'
  surface: '#0f1011'
  surface-dim: '#010102'
  surface-bright: '#18191a'
  surface-container-lowest: '#010102'
  surface-container-low: '#0f1011'
  surface-container: '#141516'
  surface-container-high: '#18191a'
  surface-container-highest: '#191a1b'
  on-background: '#f7f8f8'
  on-surface: '#f7f8f8'
  on-surface-variant: '#8a8f98'
  inverse-surface: '#f7f8f8'
  inverse-on-surface: '#0f1011'
  outline: '#23252a'
  outline-variant: '#34343a'
  primary: '#f46a3c'
  on-primary: '#ffffff'
  primary-container: '#f46a3c'
  on-primary-container: '#ffffff'
  inverse-primary: '#db5a2e'
  secondary: '#1fb8a6'
  on-secondary: '#ffffff'
  secondary-container: '#1fb8a6'
  on-secondary-container: '#ffffff'
  tertiary: '#4ea7fc'
  on-tertiary: '#ffffff'
  error: '#eb5757'
  on-error: '#ffffff'
  error-container: '#352516'
  on-error-container: '#f49e4c'
  surface-variant: '#141516'
  surface-tint: '#f46a3c'
typography:
  display-lg:
    fontFamily: Roboto
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Roboto
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  title-sm:
    fontFamily: Roboto
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: '0'
  body-md:
    fontFamily: Roboto
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: '0'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
---

# Design System: AccountBox Command Console
**Project ID:** 11643438807169311403

## 0. BANNED — never generate these

These patterns instantly read as LLM/Stitch output. **Do not use** in any screen, component, or iteration:

1. **Vertical (or horizontal) color accent stripes** on the left/right edge of list rows, cards, or diagnostics — the full-height teal/orange/red bar beside status items. Status = **small pill on the right** or **1.5px dot**, never a stripe.
2. **Gradient shine overlays** — `linear-gradient` white wash top-to-bottom on panels, "card shine", glassmorphism streaks.
3. **Neon glow** — outer glows, saturated bloom, Fortnite-style rim lighting, pulsing halos on everything.
4. **Section header accent bars** — no colored vertical ticks beside kickers. Use `// SECTION NAME` mono prefix only.
5. **Over-rounded bubbly UI** — no pill-everything, no soft consumer SaaS cards. Corners stay tight (`rounded-md` max on panels).
6. **Purple/blue AI gradients** — no default "AI product" palettes.

**Vibe target:** StarCraft Brood War ops panel meets a serious mail console — matte gunmetal, hairline borders, orange command accents, teal only for runtime/ready signals. Hardware module logo (beveled square mark, not flat chevron-only).

## 1. Visual Theme & Atmosphere

Dark-first **tactical operations console**. Canvas `#010102`, subtle dot grain (no gradient wash). Surfaces stack in tight steps with **hairline borders** only — no drop shadows, no neon. Color encodes operational state. Compact on desktop; horizontal scroll loadout on mobile.

## 2. Brand

- **Mark:** `/brand/accountbox-mark-512.png` — matte hardware module, orange accent plate, cyan status LEDs (ChatGPT reference art; chosen over Stitch variants).
- **Lockup:** `/brand/accountbox-lockup-wide.png` — mark + Account/Box wordmark.
- **App icons:** `/icon-192.png`, `/icon-512.png` derived from mark crop.
- **Wordmark in UI:** Roboto "AccountBox" or lockup image; sidebar uses mark + mono label.

## 3. Color Palette & Roles

### Foundation
- Canvas `#010102` · Surface `#0f1011` · Hairline `#23252a`

### Accents
- **Command orange** `#f46a3c` — primary actions, brackets, active nav
- **Runtime teal** `#1fb8a6` — ready/equipped dots, valid pills (dev/runtime only)
- **Blocker amber** bg `#352516` / border `#a66a33` / ink `#f49e4c` — warning banners

### States
- Ready `#4cb782` · Blocked `#eb5757` · Warning `#f2c94c` · Info `#4ea7fc`

### Text
- Ink `#f7f8f8` · Muted `#d0d6e0` · Subtle `#8a8f98`

## 4. Typography

- **Roboto** — human copy, titles, buttons
- **JetBrains Mono** — machine output, section kickers (`// READINESS DIAGNOSTICS`), status, IDs, grid cells

## 5. Component Patterns (React + Stitch)

### Panels
- `wb-panel`: rounded-lg, hairline border, uniform surface fill, optional inset top highlight only
- **No** left border accent by state on cards

### Loadout strip
- Horizontal scroll, uniform hairline cards, mono label + status **dot** + detail string

### Readiness diagnostics
- Flat rows: label + optional detail subline left, **status pill right** (VALID / PENDING / ERROR)
- Uniform border; **no left stripe**

### Blocker banner
- Full-width amber panel, mono message, optional action button

### Gate / vault / journey
- `GateCard` with orange corner brackets, grid bg at 4% opacity, hardware mark centered on unlock

### Command grid
- Outline buttons in grid; `// commands` section kicker

### Command Center layout
- **Center:** loadout, readiness, logs/after-action — flat rows; status via **pill on the right** or dot; **never** vertical accent stripes on log/diagnostic rows
- **Right rail (required):** agent chatbox — mode switcher, thread, prompt input; metrics/inspector below or secondary

## 6. Stitch Prompt Template

Always include in generation prompts:

> Matte dark tactical UI. Hairline borders only. No vertical accent stripes on rows. No gradient shine. No neon glow. Status as right-aligned pills or dots. StarCraft ops panel aesthetic. Command orange #f46a3c. Section labels as // MONO KICKER. Command Center must show agent chatbox on the right rail.

### Example prompts
- Mobile command center: amber blocker, scroll loadout, readiness 2-col **without left stripes**, sources 2-up, bottom tab bar.
- Vault unlock: hardware module logo, bracket card, mono MASTER PASSWORD, telemetry footer.

## 7. Source of Truth

- Tokens: `src/styles.css` `@theme` block
- Components: `src/components/workbench/*`, `src/components/shell/gate-card.tsx`, `src/components/shell/accountbox-mark.tsx`
- Stitch HTML reference: `public/stitch-designs/` (desktop + mobile)
- This file: `.stitch/DESIGN.md` — upload to Stitch project on change via `upload_design_md` + `create_design_system_from_design_md`
