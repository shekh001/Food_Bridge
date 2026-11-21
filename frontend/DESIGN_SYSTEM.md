# FoodBridge Design System

Target feel: **Modern SaaS dashboard** (Stripe-style data density) **+ food-delivery warmth**
(Zomato/Swiggy-style cards) **+ live-tracking energy** (Uber-style movement) **+ a genuine
sustainability brand** (real numbers, not generic NGO clichés). Every color and component below
earns its place by meaning, not decoration — see "Why three accents" below.

## Color palette

| Token | Hex | Used for |
|---|---|---|
| `paper` | `#F6F5F1` | App background — warm off-white, not clinical white |
| `ink` | `#1C2321` | Text, dark sidebar background |
| `rescue` | `#2F6F4E` (dark `#1F4D37`, light `#E6F0EA`) | **Impact / success** — completed donations, delivered status, primary CTAs |
| `amber` | `#F2A93B` (dark `#C9840F`, light `#FCEBCB`) | **Urgency / time pressure** — expiring listings, picked-up-in-progress state |
| `transit` | `#2C6E8E` (dark `#1E4F66`, light `#E4EEF2`) | **Movement / logistics** — claimed status, distance, courier tracking |
| `claim` | `#D64545` (light `#FBE4E4`) | Alerts, cancellations, destructive actions |
| `line` | `#DAD6CB` | Borders, dividers |

**Why three accents, not "everything green":** a food-rescue app defaults to drowning in green.
Rescue green is reserved for actual impact/success moments; amber and transit-blue carry the
other two meanings (urgency, movement) that a logistics-flavored dashboard needs — so color tells
you *what kind* of thing you're looking at, not just "this is the brand app."

## Typography

Three families, three jobs — never mixed within one job:
- **Fraunces** (serif, `font-display`) — headlines, page titles, food names. Carries warmth and
  an editorial/menu feel distinct from generic SaaS sans-only pages.
- **Inter** (sans, `font-body`) — everything else: body copy, labels, buttons, nav.
- **IBM Plex Mono** (`font-mono`) — every number that matters: stat values, kg/km/time figures,
  match scores, timestamps. Precision and scannability, Stripe-dashboard style.

## Layout

- **Marketing pages** (Landing, Browse, Login, etc.) — top `Navbar` + `Footer`, centered
  `max-w-6xl` content, generous whitespace. See `components/Navbar.jsx`.
- **Dashboards** (Donor, NGO, Admin) — `components/DashboardShell.jsx`: a dark (`ink`) fixed
  sidebar with role-aware nav + a light topbar (search, notifications, avatar) + content area.
  This is the deliberate SaaS-dashboard register — denser, icon-forward, sidebar-navigated,
  distinct from the marketing chrome above it.

```
┌──────────┬───────────────────────────────────┐
│          │  [search…]      [+action] [🔔][👤] │
│  FoodBr. │───────────────────────────────────│
│          │  Page Title                        │
│ Dashboard│  Subtitle                           │
│ Live feed│                                     │
│ Impact   │  [stat tile][stat tile][stat tile]  │
│          │  ┌────────────────┐ ┌────────────┐ │
│          │  │  area chart    │ │ comparison │ │
│          │  │                │ │ + alert    │ │
│          │  └────────────────┘ └────────────┘ │
│ Log out  │  ...page content...                 │
└──────────┴───────────────────────────────────┘
```

## Core dashboard components

| Component | Purpose |
|---|---|
| `DashboardShell.jsx` | Sidebar + topbar wrapper for `/donor`, `/ngo`, `/admin` |
| `StatTile.jsx` | Icon medallion + mono number + trend delta + inline `Sparkline` |
| `Sparkline.jsx` | Minimal inline SVG trend line, no chart library |
| `AreaTrendChart.jsx` | Full gradient-fill area chart (smoothed, hand-rolled SVG) for weekly trends |
| `ComparisonBar.jsx` | This-period vs last-period horizontal bar, % delta |
| `AlertCard.jsx` | Colored callout for time-sensitive items (expiring listings, pickups awaiting collection) |
| `ListingCard.jsx` | Zomato-style food card: photo/icon header, icon chips, vehicle+distance badge, match bar |
| `RescueMark.jsx` | The one recurring brand illustration (crate + sprout + route) for empty states and CTAs |
| `RescueRail.jsx` | The posted→claimed→picked-up→delivered pipeline visual, used everywhere a listing's status appears |

All chart/stat data is derived from real listings/claims already in hand (grouped by week,
compared month-over-month) — nothing on a dashboard is a fabricated placeholder number.

## Tailwind conventions

- Custom tokens live in `tailwind.config.js` under `theme.extend` (colors, fonts, shadows) —
  never hardcode a hex that already has a token.
- `shadow-card` for elevated content cards; `shadow-tile` for denser stat tiles.
- Status → color mapping is consistent everywhere: `posted`=neutral line, `claimed`=transit,
  `picked_up`=amber, `delivered`=rescue, `cancelled`=claim. Look for `STATUS_ACCENT` maps in
  `DonorDashboard.jsx`/`NGODashboard.jsx` if adding a new status-colored element.
