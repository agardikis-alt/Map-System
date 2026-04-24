# Vendor Booth Map System — Design System

## Overview

The **Vendor Booth Map System** is a static web application for managing vendor booth assignments at art shows and festivals. It is used by chamber and event organizers in the **Prescott, Arizona** area to assign vendors to booth spaces on an interactive SVG map, track categories, manage statuses, import/export data, and print maps.

**Source repository:** `agardikis-alt/Map-System` (GitHub)  
Direct URL: https://github.com/agardikis-alt/Map-System

There is one product surface: a **browser-based admin dashboard** (desktop-first, responsive to tablet).

### Events Covered
- OFFStreet Festival
- Territorial Days
- 45th Annual Bluegrass Festival
- Prescott Labor Day Show
- Prescott Fall Show

---

## CONTENT FUNDAMENTALS

### Tone & Voice
- **Functional and direct.** This is an admin tool, not a consumer product. Copy is terse and task-oriented.
- **No-nonsense labels.** UI elements use plain English: "Edit Mode," "Export JSON," "Reset to Original," "Toggle Diagnostics."
- **No marketing language.** No taglines, slogans, or brand voice flourishes.
- **Sentence case for labels** — NOT title case. E.g. "Vendor name," not "Vendor Name" in form labels (though the app uses Title Case in practice).
- **Imperative verbs for actions**: "Export JSON," "Import JSON," "Fit Map to View," "Reset to Original."
- **Short, plain status words**: open · assigned · hold · unavailable (all lowercase in data, capitalized in display badges).
- **No emoji in production UI** — emoji only appear in error/warning states (⚠️) and inline diagnostic messages.
- **Numbers shown as numerals**, never spelled out: "42 booths," "0 matched."
- **"You" perspective** for user-facing messages: "Your changes load automatically," "All changes discarded."
- **Technical copy in diagnostics panel** is more verbose — it's for power users debugging map issues.

### Examples
- Notification: `"Changes saved automatically"`
- Notification: `"Booth updated successfully!"`
- Error state: `"Failed to load map"` → `"Check the SVG file exists in maps/ folder"`
- Panel header: `"SEARCH"` / `"FILTERS"` / `"STATISTICS"` (uppercase, spaced)
- Tooltip: `"Booth 42 · Smith Jewelry · Jewelry · assigned"`

---

## VISUAL FOUNDATIONS

### Color System
See `colors_and_type.css` for all CSS custom properties.

**Brand / UI Colors**
| Token | Hex | Use |
|---|---|---|
| `--primary` | `#1976D2` | Primary actions, selected state, header title, stat values |
| `--primary-dark` | `#1565C0` | Button hover, selected booth stroke |
| `--bg` | `#F5F5F5` | Page background, stat item backgrounds |
| `--card-bg` | `#FFFFFF` | Sidebar, detail panel, all cards |
| `--border` | `#E0E0E0` | Card borders, input borders, dividers |
| `--text-primary` | `#212121` | Body text, headings |
| `--text-secondary` | `#757575` | Labels, placeholders, secondary info |
| `--success` | `#4CAF50` | Diagnostics OK state |
| `--warning` | `#FF9800` | Diagnostics warning, hold status |
| `--danger` | `#F44336` | Reset button, diagnostics error |
| `--map-bg` | `#ECEFF1` | Map container background (Blue Grey 50) |

**Status Badge Colors**
- Open: `#E8F5E9` bg / `#2E7D32` text (green)
- Assigned: `#E3F2FD` bg / `#1565C0` text (blue)
- Hold: `#FFF8E1` bg / `#F57F17` text (amber)
- Unavailable: `#ECEFF1` bg / `#455A64` text (blue-grey)

**Category Colors** (16 vendor categories — see `data/categories.json` and `colors_and_type.css`)
All category colors follow the Material Design palette. Each has a `bgColor` (light tint fill, used with 55% opacity on map overlays), `borderColor` (darker stroke), and `color` (text/icon).

### Typography
- **Font family**: System font stack — `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif`
- **No custom fonts** are used. This is an admin tool; legibility over expression.
- **Base size**: 14px body text
- **Panel section headers**: 14px / font-weight 600 / `text-transform: uppercase` / `letter-spacing: 0.5px`
- **Stat values**: 24px / font-weight 700 / primary blue
- **Detail booth number**: 24px / font-weight 700 / primary blue
- **Detail labels**: 12px / text-secondary / `text-transform: uppercase` / `letter-spacing: 0.5px`
- **Tooltip title**: 13px / font-weight 600
- **Tooltip info**: 12px / text on dark bg (#323232) / secondary (#BDBDBD)
- **Line height**: 1.5

### Spacing & Layout
- **Fixed header height**: 60px
- **Sidebar width**: 280px (left)
- **Detail panel width**: 320px (right)
- **Panel padding**: 15px
- **Panel gap**: 15px (margin-bottom between panels)
- **Form field padding**: 8px 12px
- **Button padding**: 10px 16px
- **Border radius**: 8px (inputs, buttons, cards, tooltips, modals)
- **Legend color swatch**: 20×20px, 4px radius

### Shadows
- **Default (`--shadow`)**: `0 2px 4px rgba(0,0,0,0.1)` — header, cards
- **Large (`--shadow-lg`)**: `0 4px 12px rgba(0,0,0,0.15)` — map content box, modals, tooltips
- **Selected booth**: `drop-shadow(0 0 6px rgba(21,101,192,0.7))` — SVG filter on selected state

### Cards / Panels
- White (`#FFFFFF`) background
- 1px `#E0E0E0` border
- 8px border radius
- 15px padding
- Stacked vertically in sidebar with 15px gap

### Buttons
Three variants:
- **Primary** — `#1976D2` bg / white text / hover: `#1565C0`
- **Secondary** — `#F5F5F5` bg / `#212121` text / 1px `#E0E0E0` border / hover: `#E0E0E0`
- **Danger** — `#F44336` bg / white text / hover: `#D32F2F`
- All: 8px radius / 10px 16px padding / font-weight 500 / 14px / `transition: all 0.2s`

### Inputs & Form Controls
- Full-width
- 8px 12px padding
- 1px `#E0E0E0` border
- 8px radius
- 14px font
- Focus: border becomes `--primary` (#1976D2), no outline ring
- `transition: border-color 0.2s`

### Animations & Transitions
- **Button/input interactions**: `transition: all 0.2s` or `transition: border-color 0.2s`
- **Booth hover**: `transition: all 0.2s ease` + `filter: brightness(1.1)` + thicker stroke
- **Selected booth**: instant — `stroke: #1565C0`, `stroke-width: 4`, blue tint fill, `drop-shadow` filter, dashed stroke removed
- **Notifications (toast)**: CSS `animation: slideIn 0.3s ease` / `slideOut 0.3s ease`
- **Modal overlay**: `display: none` → `display: flex` (no fade; instant show)
- **No bounces, springs, or complex easing.** Everything is linear or `ease`.

### Hover / Press States
- Buttons: darker background color (no opacity change)
- Booth shapes: `filter: brightness(1.1)` + increased stroke-width 2.5
- Close buttons: color shifts from `text-secondary` to `text-primary`
- No scale transforms on press

### Backgrounds & Imagery
- Map container background: `#ECEFF1` (Blue Grey 50) — flat color
- Map SVGs render on white card with `--shadow-lg`
- Background PNGs exist for the two map layouts (`maps/plaza-bg.png`, `maps/offstreet-bg.png`) — these are aerial/overhead views of the festival venue, used as image underlays in the SVG maps
- No illustration, gradients, or decorative backgrounds in the UI

### Borders & Separations
- All borders: 1px solid `#E0E0E0`
- Panel section dividers: `border-bottom: 1px solid #E0E0E0` + padding
- Modal header/footer: 1px border-top/bottom divider
- No colored border accents; borders are always neutral grey

### Corner Radii
- Standard: 8px (cards, buttons, inputs, modals, tooltips)
- Small: 4px (status badges = 12px radius pill, legend swatches = 4px)
- Status badges: 12px radius (pill shape)

### Layout Rules
- Fixed header at top, full width, z-index 100
- Three-column layout: sidebar | map | detail panel
- Map area is flex: 1 (fills remaining space)
- Sidebar and detail panel are `flex-shrink: 0`
- Max container width: 1920px
- Responsive breakpoints: ≤1200px narrows sidebar/detail; ≤992px stacks vertically

### Use of Transparency & Blur
- Booth fill overlays: category `bgColor` at 55% opacity (`rgba(r,g,b,0.55)`) so the background map image shows through
- Modal overlay: `rgba(0,0,0,0.5)` scrim
- Tooltip: `rgba(33,33,33,0.95)` background (near-opaque dark)
- No backdrop-filter blur effects used anywhere

### Imagery Color Vibe
- Background map images are aerial/overhead venue photos — neutral, muted, real-world photography
- No grain, no color grading

---

## ICONOGRAPHY

No icon library or custom icon font is used. The app is **icon-free** in its primary UI — all actions are labelled text buttons. The only icon-like elements are:

- **Category legend swatches**: 20×20px colored rectangles with border (CSS only)
- **Status badges**: pill-shaped text labels (CSS only)
- **Warning glyph ⚠️**: used only in error states in JS-generated HTML (browser emoji)
- **Close button**: the × character (U+00D7) rendered in font, sized 24px
- **No SVG icons, no PNG icons, no icon font**

The design deliberately avoids iconography — this is a functional admin tool where text labels are clearer than symbols.

---

## Files

```
/
├── README.md                  ← This file
├── SKILL.md                   ← Agent skill definition
├── colors_and_type.css        ← CSS custom properties: colors, type scale
├── data/
│   ├── categories.json        ← 16 vendor category color definitions
│   └── events.json            ← Event configuration
├── maps/
│   ├── plaza.svg              ← Plaza venue map
│   ├── offstreet.svg          ← OFFStreet venue map
│   ├── plaza-bg.png           ← Plaza background photo
│   └── offstreet-bg.png       ← OFFStreet background photo
├── preview/                   ← Design system card previews
│   ├── colors-brand.html
│   ├── colors-status.html
│   ├── colors-categories.html
│   ├── type-scale.html
│   ├── type-tokens.html
│   ├── spacing-tokens.html
│   ├── components-buttons.html
│   ├── components-badges.html
│   ├── components-inputs.html
│   ├── components-panels.html
│   ├── components-stats.html
│   ├── components-tooltip.html
│   └── components-modal.html
└── ui_kits/
    └── booth-map/
        ├── README.md
        ├── index.html         ← Interactive prototype of the full app
        ├── Header.jsx
        ├── Sidebar.jsx
        ├── DetailPanel.jsx
        ├── MapCanvas.jsx
        └── Modals.jsx
```
