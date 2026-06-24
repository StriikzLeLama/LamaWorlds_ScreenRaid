# ScreenRaid Design System

> **HomeBoard design language** — Dashboard Anthracite Orange  
> Flat, modern admin-panel UI. No glassmorphism. No neon effects.

All client UI (main window, modals, settings, auth screens) **must** use these tokens and patterns. The overlay window is media-only and has no chrome.

Visual references: Discord, Steam, modern self-hosted dashboards (Home Assistant, Portainer, etc.).

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color Palette](#2-color-palette)
3. [Typography](#3-typography)
4. [Spacing & Layout](#4-spacing--layout)
5. [Border Radius](#5-border-radius)
6. [Shadows & Elevation](#6-shadows--elevation)
7. [Tailwind Configuration](#7-tailwind-configuration)
8. [CSS Variables](#8-css-variables)
9. [Component Library](#9-component-library)
10. [Layout Patterns](#10-layout-patterns)
11. [States & Interactions](#11-states--interactions)
12. [Icons & Imagery](#12-icons--imagery)
13. [Do's and Don'ts](#13-dos-and-donts)

---

## 1. Design Principles

| Principle | Rule |
|-----------|------|
| **Flat surfaces** | Solid background colors only. No `backdrop-filter`, no frosted glass, no translucent panels. |
| **Anthracite base** | Dark grey layers (`#1a1a1a` → `#2f2f2f`) create depth through color steps, not blur. |
| **Orange accent** | `#f97316` is the single brand accent. Used sparingly for CTAs, active nav, focus rings, badges. |
| **Readable hierarchy** | Primary text `#ececec`, secondary `#b4b4b4`. Never pure white on dark grey. |
| **Rounded cards** | 16px radius on cards, modals, inputs. Consistent across the app. |
| **Dashboard density** | Clean admin layout: sidebar + content area, generous padding, clear section headers. |
| **No glow** | No `box-shadow` with colored glow, no `text-shadow`, no neon outlines. |

---

## 2. Color Palette

### Core Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `bg` | `#1a1a1a` | App background, page base |
| `surface` | `#232323` | Sidebar, title bar, secondary panels |
| `card` | `#2f2f2f` | Cards, modals, dropdowns, inputs |
| `border` | `#3a3a3a` | Dividers, input borders, card outlines |
| `accent` | `#f97316` | Primary buttons, active nav, links, focus |
| `accent-hover` | `#ea580c` | Hover state for accent elements |
| `text` | `#ececec` | Headings, body, labels |
| `text-secondary` | `#b4b4b4` | Captions, placeholders, meta info |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#22c55e` | Online status, consent granted, success toasts |
| `danger` | `#ef4444` | Panic button, errors, destructive actions |
| `warning` | `#eab308` | Warnings, pending states |
| `info` | `#94a3b8` | Neutral informational badges (not accent orange) |

### Layer Stack (top → bottom)

```
card       #2f2f2f   ← elevated content (cards, modals)
surface    #232323   ← sidebar, nested panels
bg         #1a1a1a   ← page background
```

### Contrast Rules

- Body text on `bg`: `#ececec` (passes WCAG AA)
- Secondary text on `card`: `#b4b4b4` minimum
- Accent text on `card`: use `#f97316` only for links/labels, not long paragraphs
- Disabled elements: `#6b6b6b` text on `#2a2a2a` background

---

## 3. Typography

**Font family:** [Inter](https://fonts.google.com/specimen/Inter) — loaded via `@fontsource/inter` or Google Fonts.

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

### Type Scale

| Name | Size | Weight | Line-height | Usage |
|------|------|--------|-------------|-------|
| `display` | 28px / 1.75rem | 700 | 1.2 | Page titles |
| `heading` | 20px / 1.25rem | 600 | 1.3 | Section headers, card titles |
| `subheading` | 16px / 1rem | 600 | 1.4 | Subsection labels |
| `body` | 14px / 0.875rem | 400 | 1.5 | Default body text |
| `small` | 12px / 0.75rem | 400 | 1.4 | Captions, timestamps, badges |
| `label` | 12px / 0.75rem | 500 | 1.2 | Form labels (uppercase optional) |

### Rules

- Use `font-medium` (500) for nav items and buttons, `font-semibold` (600) for headings.
- No decorative or display fonts.
- Letter-spacing: default; `tracking-wide` only for small uppercase labels.
- Monospace (`font-mono`): invite codes, IDs, logs only.

---

## 4. Spacing & Layout

Base unit: **4px**. Use Tailwind spacing scale (`1` = 4px).

| Context | Padding |
|---------|---------|
| Page content area | `p-6` (24px) |
| Card interior | `p-5` (20px) or `p-6` (24px) |
| Sidebar item | `px-3 py-2` (12px × 8px) |
| Button (md) | `px-4 py-2` (16px × 8px) |
| Input | `px-3 py-2.5` (12px × 10px) |
| Gap between cards | `gap-4` (16px) or `gap-6` (24px) |
| Section spacing | `space-y-6` (24px) between sections |

### Grid

- Dashboard stat row: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`
- Two-column settings: `grid grid-cols-1 lg:grid-cols-2 gap-6`
- Max content width: `max-w-7xl` centered in main area

---

## 5. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius` | **16px** (`rounded-2xl`) | Cards, modals, panels — **default** |
| `radius-md` | 12px (`rounded-xl`) | Buttons, inputs, dropdowns |
| `radius-sm` | 8px (`rounded-lg`) | Badges, chips, small buttons |
| `radius-full` | 9999px | Avatars, status dots |

**Rule:** Cards always use 16px. Never mix sharp corners with rounded cards.

---

## 6. Shadows & Elevation

Flat UI — elevation is conveyed by **background color steps**, not heavy shadows.

| Level | Shadow | Usage |
|-------|--------|-------|
| None | — | Default cards (border only) |
| Low | `0 1px 3px rgba(0,0,0,0.3)` | Dropdowns, popovers |
| Modal | `0 8px 24px rgba(0,0,0,0.5)` | Modals only |

**Forbidden:** colored shadows, glow effects, `inset` highlights simulating glass.

---

## 7. Tailwind Configuration

```typescript
// client/tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        raid: {
          bg: '#1a1a1a',
          surface: '#232323',
          card: '#2f2f2f',
          border: '#3a3a3a',
          accent: '#f97316',
          'accent-hover': '#ea580c',
          text: '#ececec',
          'text-secondary': '#b4b4b4',
          success: '#22c55e',
          danger: '#ef4444',
          warning: '#eab308',
          info: '#94a3b8',
          disabled: '#6b6b6b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

---

## 8. CSS Variables

```css
/* client/src/index.css */
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --raid-bg: #1a1a1a;
  --raid-surface: #232323;
  --raid-card: #2f2f2f;
  --raid-border: #3a3a3a;
  --raid-accent: #f97316;
  --raid-accent-hover: #ea580c;
  --raid-text: #ececec;
  --raid-text-secondary: #b4b4b4;
  --raid-radius: 16px;
}

body {
  @apply bg-raid-bg text-raid-text font-sans antialiased;
}
```

---

## 9. Component Library

Component files live in `client/src/components/ui/`. Naming uses flat HomeBoard conventions — **no** `Glass*` or `Neon*` prefixes.

### Card (`Card.tsx`)

```tsx
// Solid flat card — the primary container
<div className="bg-raid-card border border-raid-border rounded-2xl p-6">
  {children}
</div>
```

Variants:
- **Default** — `bg-raid-card border border-raid-border`
- **Interactive** — add `hover:border-raid-accent/40 transition-colors cursor-pointer`
- **Accent header** — top border `border-t-2 border-t-raid-accent` for featured cards

### Button (`Button.tsx`)

| Variant | Classes |
|---------|---------|
| Primary | `bg-raid-accent hover:bg-raid-accent-hover text-white font-medium rounded-xl px-4 py-2` |
| Secondary | `bg-raid-surface border border-raid-border hover:border-raid-text-secondary text-raid-text rounded-xl` |
| Ghost | `hover:bg-raid-surface text-raid-text-secondary hover:text-raid-text rounded-xl` |
| Danger | `bg-raid-danger hover:bg-red-600 text-white rounded-xl` |

No gradients. No glow on hover.

### Input (`Input.tsx`)

```tsx
<input className="w-full bg-raid-card border border-raid-border rounded-xl px-3 py-2.5
  text-raid-text placeholder:text-raid-text-secondary
  focus:outline-none focus:border-raid-accent focus:ring-1 focus:ring-raid-accent" />
```

### Badge (`Badge.tsx`)

```tsx
// Accent badge
<span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium
  bg-raid-accent/15 text-raid-accent border border-raid-accent/30">

// Neutral badge
<span className="... bg-raid-surface text-raid-text-secondary border border-raid-border">
```

### Modal (`Modal.tsx`)

- Backdrop: `bg-black/60` (solid dim, no blur)
- Panel: `bg-raid-card border border-raid-border rounded-2xl shadow-lg max-w-lg`
- No `backdrop-filter`

### Sidebar Nav Item

```tsx
// Active
<a className="flex items-center gap-3 px-3 py-2 rounded-xl
  bg-raid-accent/10 text-raid-accent border-l-2 border-raid-accent">

// Inactive
<a className="flex items-center gap-3 px-3 py-2 rounded-xl
  text-raid-text-secondary hover:bg-raid-card hover:text-raid-text">
```

### Panic Button (special)

Always visible in sidebar footer. Uses `danger` variant, not accent:

```tsx
<button className="w-full bg-raid-danger hover:bg-red-600 text-white font-semibold
  rounded-xl px-4 py-2.5 flex items-center justify-center gap-2">
  Panic — Hide All
</button>
```

### Table (dashboard lists)

```tsx
<table className="w-full text-sm">
  <thead className="text-raid-text-secondary border-b border-raid-border">
  <tbody className="divide-y divide-raid-border">
  <tr className="hover:bg-raid-surface/50">
```

### Toast / Notification

- Background: `bg-raid-card border border-raid-border rounded-xl`
- Success left border: `border-l-4 border-l-raid-success`
- Error left border: `border-l-4 border-l-raid-danger`

---

## 10. Layout Patterns

### App Shell

```
┌──────────────────────────────────────────────────────────┐
│ TitleBar          bg-surface  border-b border-border     │
├────────────┬─────────────────────────────────────────────┤
│  Sidebar   │  Main content          bg-bg  p-6          │
│  w-60      │  ┌─────────────┐  ┌─────────────┐          │
│  bg-surface│  │  Card       │  │  Card       │          │
│  border-r  │  │  rounded-2xl│  │  rounded-2xl│          │
│            │  └─────────────┘  └─────────────┘          │
│  ─────     │                                              │
│  Nav items │  Section heading (text-heading)              │
│            │  ┌──────────────────────────────────┐       │
│  ─────     │  │  Large card (table / composer)   │       │
│  User      │  └──────────────────────────────────┘       │
│  [Panic]   │                                              │
└────────────┴─────────────────────────────────────────────┘
```

| Region | Background | Width |
|--------|------------|-------|
| Title bar | `surface` | Full width, 40px height |
| Sidebar | `surface` | 240px (`w-60`) fixed |
| Main | `bg` | Fluid, scrollable |

### Auth Pages (login / register)

Centered card on `bg` background — no sidebar:

```
┌────────────────────────────────────┐
│           bg #1a1a1a               │
│     ┌──────────────────────┐      │
│     │  Card #2f2f2f        │      │
│     │  Logo + form          │      │
│     │  [Primary button]     │      │
│     └──────────────────────┘      │
└────────────────────────────────────┘
```

### Consent Gate

Full-screen `bg` with centered `card` modal. Primary CTA uses accent; decline uses ghost/secondary. Cannot dismiss without choice.

### Room Page

Two-column on wide screens:
- Left (60%): prank composer card + history table
- Right (40%): member list card with presence dots

---

## 11. States & Interactions

| State | Treatment |
|-------|-----------|
| Hover | Background shift or border color change — never glow |
| Focus | `ring-1 ring-raid-accent border-raid-accent` |
| Active/pressed | `bg-raid-accent-hover` (buttons) |
| Disabled | `opacity-50 cursor-not-allowed` |
| Loading | Orange spinner (`border-raid-accent`) — no skeleton glass |
| Selected | `bg-raid-accent/10` + left accent border |

Transitions: `transition-colors duration-150` — keep snappy, no slow fades.

---

## 12. Icons & Imagery

- Icon set: **Lucide React** (consistent stroke width)
- Icon color: `text-raid-text-secondary` default, `text-raid-accent` when active
- Icon size: 20px nav, 16px inline
- Avatars: `rounded-full`, fallback `bg-raid-surface` with initials in `text-raid-text-secondary`
- No emoji as primary UI chrome (OK in user-generated prank text)

---

## 13. Do's and Don'ts

### Do

- Use solid `bg-raid-card` for all elevated surfaces
- Use `#f97316` only for interactive emphasis
- Keep sidebar and title bar on `surface` (#232323)
- Use 16px radius on all cards and modals
- Use Inter at 14px for body text
- Follow Discord/Steam layout patterns (sidebar nav, content area)

### Don't

- `backdrop-filter`, `backdrop-blur`, or translucent backgrounds
- Neon blue, cyan, or purple accents
- `box-shadow` with orange/blue glow
- Gradient buttons or gradient backgrounds
- Pure white `#ffffff` text
- Sharp 0px corners on cards
- Glass-style components (`GlassCard`, frosted panels)
- Heavy animations on layout chrome (overlay prank animations are separate)

---

## File Checklist (implementation)

When building the client, every UI file must:

- [ ] Import tokens from Tailwind `raid.*` — no hardcoded hex in components (except `index.css` vars)
- [ ] Use `Card`, `Button`, `Input`, `Badge` from `components/ui/`
- [ ] Use Inter via `font-sans`
- [ ] Use `rounded-2xl` (16px) on cards
- [ ] Avoid `backdrop-*` utilities anywhere in `client/src/`

---

*Design system version: 1.0.0 — HomeBoard Anthracite Orange*
