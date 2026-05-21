# Polymarket Whale Bot — Dashboard Design Spec

**Status:** Design pass v0 · 2026-05-21
**Scope:** Single-operator Next.js dashboard for the dry-run whale-following signal bot. Live execution is gated but visible in the UI.

---

## 1. Visual Theme & Atmosphere

A trading cockpit, not a generic dashboard. Dense and information-first. Pixels are earned by live data, not decoration. The interface feels closer to a Bloomberg terminal restyled by someone with taste than to a SaaS marketing page — charcoal canvas, mono-typeset numerics, a single warm accent, and motion that confirms data freshness without ever flashing or screaming.

**Taste-design calibration**

- **Density:** 8 / 10 — Cockpit Dense. Multiple live regions on one viewport.
- **Variance:** 6 / 10 — Asymmetric three-region split. Rails are deliberately unequal (280 / fluid / 400). No 3-equal-card grids anywhere.
- **Motion:** 5 / 10 — Spring physics for drawer transitions, perpetual sub-second pulse on the freshest signal card, stagger reveals on list mount. No banner flashes, no "NEW!" tags.

---

## 2. Color Palette & Roles

All values calibrated for dark cockpit context. Saturation ceiling 75%. No pure black, no neon, no purple, no Polymarket-blue.

### Surfaces
- **Charcoal Ink** `#0C0D0F` — App canvas
- **Slate Plane** `#16181C` — Elevated panel base
- **Graphite Edge** `#1F2226` — Card surface
- **Whisper Border** `rgba(255,255,255,0.06)` — 1px structural lines
- **Active Halo** `rgba(217,119,87,0.08)` — Translucent flood for selected rows

### Text
- **Bone** `#E6E7EA` — Primary text, headers, key numerics
- **Steel** `#A1A6AD` — Body text
- **Muted Steel** `#6B7280` — Metadata, timestamps, helper text
- **Ghost** `#3A3D42` — Disabled / placeholder

### Accent (single)
- **Phosphor Amber** `#D97757` — Primary CTA, focus rings, freshest-signal pulse, brand mark. Warm without neon.

### Semantic (BUY / SELL only — used nowhere else)
- **Long Teal** `#3FA796` — BUY side, positive PnL, upward flow
- **Short Rust** `#C85450` — SELL side, negative PnL, downward flow
- **Caution Sand** `#D8AE5C` — Stale data, reconnecting state (rare; never for success/error)

### Banned in this design
- Pure black `#000000`
- Polymarket brand blue (`#2D9CDB` family)
- Robinhood-style high-saturation green
- Bloomberg-orange (too close to our accent — keep accent restrained)
- Any purple
- Any neon outer glow

---

## 3. Typography

### Fonts
- **Display + Body:** `Satoshi` (variable, 400–700). Fallback stack: `Satoshi, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- **Mono:** `JetBrains Mono` (variable, 400–600). Used for **every number, wallet address, condition_id, asset_id, timestamp, and key**. No exceptions.

Inter is banned. Serif is banned in this dashboard context.

### Scale (rem-anchored, paired with line-height)

| Token | Size | Line | Use |
|-------|------|------|-----|
| `text-2xs` | 11px / 0.6875rem | 16px | Mono metadata (timestamps, wallet truncations) |
| `text-xs` | 12px / 0.75rem | 18px | Labels, captions, table headers (uppercase, tracked) |
| `text-sm` | 13px / 0.8125rem | 20px | Body default in dense regions |
| `text-base` | 14px / 0.875rem | 22px | Body in less-dense regions, drawer copy |
| `text-md` | 16px / 1rem | 24px | Section subheaders |
| `text-lg` | 20px / 1.25rem | 28px | Panel titles |
| `text-xl` | 28px / 1.75rem | 32px | Hero numerics (signal score, PnL totals) |
| `text-2xl` | 40px / 2.5rem | 44px | Modal/page hero only |

### Rules
- Headers use weight 600, never 700+. Hierarchy through weight + color, not size alone.
- Numbers are **always mono**, tabular-nums, weight 500.
- Section labels are uppercase, tracked `+0.06em`, color `Muted Steel`. Never longer than 3 words.
- No all-caps body. No "SYSTEM // 2026" formatting.
- Truncate wallets as `0x1234…f0e1` (4-leading, 4-trailing, mono).

---

## 4. Layout Principles

### Container
- Max app width: **1480px**, centered. Below 1280px the right rail collapses into a tab on the main pane.
- Outer padding: `clamp(16px, 2vw, 32px)`.
- Vertical section gap: `clamp(20px, 2.5vw, 36px)`.

### The asymmetric three-region grid (Command Deck)
```
┌─────────────┬───────────────────────────┬──────────────────┐
│ Rail-L 280  │ Main fluid                │ Rail-R 400       │
└─────────────┴───────────────────────────┴──────────────────┘
```
CSS Grid: `grid-template-columns: 280px minmax(0,1fr) 400px;` with `gap: 20px`.

### Responsive collapse
- `< 1280px`: Rail-R becomes a slide-in sheet, toggled by a tape icon in the header. Main expands.
- `< 1024px`: Rail-L collapses to icon strip (64px). Wallet labels become tooltips.
- `< 768px`: Single column. Rails become full-screen sheets. Signal cards stack. **Numbers do not shrink below 13px.** Touch targets ≥ 44px.

### Spacing scale
Use Tailwind defaults `0/0.5/1/1.5/2/2.5/3/4/5/6/8/10/12` × 4px. Never arbitrary pixel values. Card interior padding `24px` (p-6). Card-to-card gap `16px` (gap-4).

### Rules
- **No overlapping elements.** No absolute-positioned content stacking. The freshest-signal pulse is a `transform: scale()` and ring, not an overlay.
- **No three-equal-column feature rows.** Anywhere we present three things, they are intentionally sized (signal score panel is 2× the trade-count panel, etc.).
- Use `min-h-[100dvh]` not `h-screen` for full-height regions.

---

## 5. Component Stylings

### Buttons
- **Primary:** Phosphor Amber fill, Charcoal Ink text, no glow, `1px` solid border `rgba(217,119,87,0.4)`. Active state: `translate-y-[1px]` tactile press. Hover: brightness 1.05. Focus ring: 2px Phosphor Amber, 2px offset.
- **Secondary (ghost):** transparent fill, Whisper Border, Bone text. Hover: surface lifts to `Graphite Edge`.
- **Danger:** Short Rust fill at 90% opacity. Used only for confirmable destructive actions (cancel order, remove wallet).
- **Disabled:** `Ghost` text, no border change. **Live execution buttons in dry-run mode use this state** with a small lock icon and tooltip "Live execution disabled. Set LIVE_TRADING_ENABLED=true to enable."
- Sizes: `sm` 28px / `default` 34px / `lg` 40px. No "xl".

### Cards (signal cards specifically)
- Surface: `Graphite Edge`. Border: `1px Whisper Border`. Border-radius: `12px` (not 24px+ — this is a cockpit, not a landing page).
- Padding: `20px 24px`.
- Internal grid: 12-col card grid with explicit side/score/meta zones.
- **Freshest card** (most recent signal upsert): receives an inset ring `inset 0 0 0 1px rgba(217,119,87,0.35)` and a 1.2s spring-eased scale pulse (1.0 → 1.005 → 1.0). The pulse is *barely* perceptible — confirmation, not attention-grab.
- **Stale signal** (> max_signal_age_secs): opacity 0.55, Muted Steel timestamp, no pulse. Filtered out by default; toggleable.

### BUY / SELL pills
- Flat. No background fill — just a 1px tinted border + matching mono text.
- BUY: border `Long Teal`, text `Long Teal`. Prefix glyph `◆` (filled diamond) when score notional is strong (>5× min), `◇` (outline) when weak.
- SELL: border `Short Rust`, text `Short Rust`. Same glyph logic.
- Height 22px, padding `2px 8px`, `text-2xs` mono uppercase.
- **No emoji. No 🟢/🔴. No giant pill backgrounds.**

### Trade-tape rows
- Borderless row, 56px tall, `8px` vertical padding.
- Hairline divider `Whisper Border` between rows.
- Stagger reveal on mount (50ms cascade), no transitions on subsequent appends — they just appear at the top with a 240ms spring slide.
- Hover: row background `Active Halo`, cursor pointer (default cursor — no custom cursors), reveals a chevron at the right.

### Inputs / Forms
- Label above input (`text-xs`, Muted Steel, uppercase, tracked).
- Input: 36px tall, `Charcoal Ink` fill (darker than the card!), Whisper Border. Focus ring: Phosphor Amber 2px.
- Number inputs: right-aligned, mono, with unit suffix in Muted Steel (e.g., `2500.00 pUSD`).
- Helper text below in `text-2xs` Muted Steel. Error text below in `text-2xs` Short Rust.
- No floating labels.

### Sliders (for wallet weights, copy_fraction, etc.)
- Track: 4px tall, Whisper Border background.
- Filled portion: Phosphor Amber gradient → solid (left to right).
- Thumb: 16px circle, Bone fill, 1px Phosphor Amber ring.
- Live value bound to a mono label adjacent: `weight 1.20`.

### Tables (where used — signal history, position list)
- Header: `text-2xs` uppercase tracked, Muted Steel, `Slate Plane` row background.
- Rows: 44px tall, hairline borders, Graphite Edge on hover.
- Numbers right-aligned, mono. Text left-aligned. Sortable headers carry a 10px chevron in Muted Steel, Phosphor Amber when active.

### Loading states
- **Skeletons that match exact dimensions of the upcoming content.** Signal card skeleton = same height, same internal grid, with hairline shimmer animating left-to-right via `transform: translateX()`.
- **No circular spinners.** A 1px progress bar lives at the very top of the viewport for global pending state, Phosphor Amber, indeterminate slide.

### Empty states
- Composed, not bare. "No watched wallets yet" shows a faint dotted boundary + a primary "Add wallet" button + a hint "Whale watchlists drive signals — add a wallet address to start."
- For zero signals: the panel renders the *frame* (panel title, filters, timestamp axis) but the card region shows a dotted placeholder card outline with the text "Waiting for whale flow. Last poll [hh:mm:ss]."

### Connection status badges
- Small mono badges in the left rail: `clob-ws 92ms`, `bot-bus 14ms`, `data-api 318ms`.
- Color by latency tier: ≤100ms Bone, ≤500ms Caution Sand, >500ms or disconnected Short Rust.
- Hover reveals last 60s sparkline of round-trip time.

### Toasts / notifications
- Bottom-right, 320px wide, Graphite Edge, 1px Whisper Border, 12px radius.
- Auto-dismiss 6s. Stack max 3, oldest collapses to a count badge.
- **Used sparingly.** Reconnects, errors, signal-action confirmations only. Never for routine signal arrivals — those belong in the stream.

---

## 6. Screens

### 6.1 Command Deck (`/`)
**Default landing.** Three-region grid as drawn in the brief.

- **Rail-L (Watched Wallets + Connections):**
  - List of watched wallets. Each row: status dot (●/○ active vs paused), truncated address (mono), weight value, lifetime PnL contribution (mono, semantic-tinted). Click → wallet profile drawer.
  - "+ Add wallet" affordance at bottom of the list.
  - Connections sub-panel beneath, divider above.

- **Main (top: Signal Stream, bottom: Market Detail):**
  - **Signal Stream:** Header with filter chips (`all` / `BUY` / `SELL` / `> $5k score`), search by market title, refresh-pause toggle. Below: scrollable column of signal cards, freshest at top. Empty/loading states per §5.
  - **Market Detail (bottom):** Activated when a signal card is clicked. Shows: probability sparkline (last 60m via lightweight-charts), order book depth canvas, recent trades mini-table, and the **Execute** affordance (locked in dry-run; see §6.5).

- **Rail-R (Whale Tape):**
  - Header: filter by wallet (chips of watched wallets), filter by side, search by market.
  - Body: virtualized list of trade-tape rows (2000 in memory, ~30 visible). Newest at top, slide-in on append.
  - Footer: "Showing live · last poll [hh:mm:ss]" with the refresh-pause toggle synced to the main stream's.

### 6.2 Market Drilldown (`/market/[condition_id]/[asset_id]`)
- Full-page when navigated to (replaces Command Deck), or slide-in drawer when opened from a signal card.
- Hero strip: market title (Satoshi 600, text-lg), outcome (text-md Steel), condition_id and asset_id (mono text-2xs Muted, copyable).
- Two-column body: left = price chart (full lightweight-chart, 1h/4h/1d/all tabs), right = order book (canvas, 20 levels each side).
- Below: contributing whale trades table for this market (mono numbers, sortable).
- Footer drawer: Execute panel (gated).

### 6.3 Wallet Profile (slide-in drawer from Rail-L)
- Header: pseudonym (if known) or full address (mono, copyable, links to Polygonscan via icon button).
- Stats strip: lifetime trades, win rate (only if computable — else `—`), avg notional, current open positions count. **All numbers mono. Null = `—`. No invented stats.**
- Weight slider with live update.
- Recent trades table (mono).
- Current positions table.
- "Pause watching" / "Remove" actions in footer.

### 6.4 Settings (`/settings`)
- Sectioned single-column form, max-width 720px.
- Signal config sliders bound to `PolymarketWhaleSignalConfig`: `min_trade_notional`, `min_signal_notional`, `copy_fraction`, `max_order_notional`, `max_signal_age_secs`.
- Wallet weights matrix (table with editable weight column).
- Live-execution toggle: **read-only display of the LIVE_TRADING_ENABLED env state**, with copyable instructions ("Set on the bot host and restart the bus to enable"). Not user-toggleable from the UI by design — flipping execution mode should be an explicit env-level action.

### 6.5 Execute Panel (drawer footer, all market views)
**Behavior under dry-run (default):** Always rendered. Shows the suggested copy size from the signal, the candidate Nautilus order shape (instrument_id, side, size, reference price), and a disabled "Execute" button with the lock icon + tooltip described in §5.

**Behavior under live (`LIVE_TRADING_ENABLED=true`):** Same UI, but Execute is enabled, with a 2-step confirm: first click reveals a 5-second hold-to-confirm circular fill on the button (spring eased, Phosphor Amber). Releasing early cancels. Completion fires the order.

This *visibly disabled* pattern forces the live-trading UX to be fully designed today, so the cutover is a flag flip and not a redesign.

### 6.6 Connection Console (`/connections`)
- Table of upstream connections (CLOB WS per asset_id, Data API, Bot Bus, Nautilus engine if connected).
- Columns: name, URL (truncated mono), status (Connected / Reconnecting / Disconnected), latency, last message age, action (force-reconnect button).
- Bottom: log stream (last 200 lines from the bus, mono, color-coded by level). Tail-follow toggle.

---

## 7. Motion Philosophy

### Engine
`motion` (framer-motion v11+). Default transition: `{ type: "spring", stiffness: 100, damping: 20 }`. **No** linear easing. **No** ease-in-out durations used for layout transitions.

### Perpetual micro-loops
- Freshest signal card: `scale: [1, 1.005, 1]` over 1.2s, ease-in-out, infinite. Imperceptible at rest, present when noticed. Stops the moment a newer signal arrives.
- Connection status dot: 1.6s gentle pulse at 0.7 → 1.0 opacity for "Connected" state. Static for "Disconnected". Caution Sand fast pulse (0.6s) for "Reconnecting".
- Active sparkline cursor: 2s gentle phosphor-amber wash from left to right at low opacity.

### Stagger orchestration
- List mounts (signals, tape, wallets): 50ms cascade delay between children, with each child entering as `opacity 0 → 1`, `translateY 8px → 0`. Spring physics, no fade duration.

### Performance
- Animate `transform` and `opacity` only. Never `top`, `left`, `width`, `height`.
- Heavy components (order book canvas, lightweight-chart) live in isolated client components with `dynamic(() => …, { ssr: false })`.
- The tape uses `requestAnimationFrame` batched appends — never re-render on every WS message.

---

## 8. Real-Time Architecture

### Topology
```
Polymarket CLOB WS ──┐
Polymarket Data API ─┤  ws-bridge (Python, FastAPI + websockets)  ──> Next.js client (/ws/stream)
Nautilus engine (opt)┘    │
                          ├─ debouncer / signal recomputer (calls build_whale_signals())
                          └─ per-client subscription filter
```

**Why a bridge instead of browser-direct:**
- One reconnect strategy, one rate-limit budget
- Server-side signal computation reuses `nautilus_trader/adapters/polymarket/whales.py` verbatim
- Browser is never exposed to Polymarket auth/secrets (none today, but ready)
- Subscriptions can be filtered per client to avoid sending unwanted asset books

### Reconnect strategy (client side)
- Exponential backoff: `min(1000 * 2^attempt, 30000)` ms, jittered ±20%
- On reconnect: client sends last seen sequence number (`t`); bridge replays missed events from a ring buffer (last 5000 events / 5 minutes, whichever smaller).
- UI shows Caution Sand "Reconnecting" badge during retries. Connected state restores Bone.

### Backpressure
- Tape buffer hard cap 2000 rows in memory, oldest dropped silently.
- If event rate exceeds 50/s for 3s sustained, the client switches to "Aggregated mode": signals upserted at 250ms tick, tape rows batched at 500ms. Indicator surfaces in Rail-L.

---

## 9. WebSocket Event Schema

All events share a typed envelope. Server emits JSON, client parses with a zod schema and discards malformed events with a console error (no toast — this is operator-facing).

```typescript
type StreamEvent =
  | { type: "trade.whale";   t: number; data: WhaleTrade }
  | { type: "signal.upsert"; t: number; data: WhaleSignal }
  | { type: "signal.expire"; t: number; data: SignalKey }
  | { type: "book.delta";    t: number; data: BookDelta }
  | { type: "position.update"; t: number; data: WhalePosition }
  | { type: "heartbeat";     t: number; data: Heartbeat };

// Mirrors PolymarketWhaleTrade dataclass
interface WhaleTrade {
  wallet: string;
  side: "BUY" | "SELL";
  asset_id: string;
  condition_id: string;
  size: string;       // decimal string, parsed with decimal.js
  price: string;      // decimal string
  notional: string;   // decimal string (size * price)
  timestamp: number;  // unix seconds
  title: string | null;
  slug: string | null;
  event_slug: string | null;
  outcome: string | null;
  outcome_index: number | null;
  name: string | null;
  pseudonym: string | null;
  transaction_hash: string | null;
}

interface WhaleSignal {
  condition_id: string;
  asset_id: string;
  instrument_id: string;            // resolved by bridge via get_polymarket_instrument_id
  side: "BUY" | "SELL";
  score_notional: string;
  suggested_notional: string;
  reference_price: string;
  trade_count: number;
  latest_timestamp: number;
  wallets: string[];
  title: string | null;
  slug: string | null;
  event_slug: string | null;
  outcome: string | null;
}

type SignalKey = Pick<WhaleSignal, "condition_id" | "asset_id">;

interface BookDelta {
  asset_id: string;
  bids: [price: string, size: string][];
  asks: [price: string, size: string][];
  // bridge emits FULL book snapshot on first send, delta replacement on subsequent
  snapshot: boolean;
}

interface WhalePosition {
  wallet: string;
  asset_id: string;
  condition_id: string;
  size: string;
  avg_price: string;
  current_value: string;
  cur_price: string;
  cash_pnl: string;
  percent_pnl: string;
  realized_pnl: string;
  redeemable: boolean;
  title: string | null;
  slug: string | null;
  event_slug: string | null;
  outcome: string | null;
}

interface Heartbeat {
  clob_ms: number;            // round-trip to CLOB WS
  data_api_ms: number;        // last Data API poll latency
  signal_count: number;       // live signal count
  watched_wallets: number;
  live_trading_enabled: boolean;  // mirrors env
  bridge_uptime_secs: number;
}
```

### Client-to-server messages
```typescript
type ClientMessage =
  | { type: "subscribe.books"; asset_ids: string[] }
  | { type: "unsubscribe.books"; asset_ids: string[] }
  | { type: "resume"; since_t: number }
  | { type: "ping" };
```

---

## 10. State Management

**Zustand stores** (small, focused, no global blob):
- `useSignalStore` — Map keyed by `${condition_id}:${asset_id}` → WhaleSignal. Upsert/expire actions.
- `useTapeStore` — bounded queue of last 2000 WhaleTrade events.
- `useBookStore` — Map keyed by asset_id → current book snapshot.
- `useConnectionStore` — heartbeat + latency derived state.
- `useWalletStore` — watched wallets + weights, synced to backend on change.

**TanStack Query** — initial REST hydration of: watched wallets, current positions, last-known signals (server caches a snapshot). WS messages mutate the Zustand stores directly; TanStack Query is just the cold-start bootstrap.

**nuqs** — URL-bound filter state on the Command Deck (side filter, search query, paused/live). Means a deep-linked view restores faithfully.

---

## 11. Component Manifest

### From shadcn/ui (install via CLI)
```
button card dialog drawer sheet tabs tooltip popover dropdown-menu
table input label slider switch toggle toggle-group
scroll-area separator badge skeleton sonner (toast) form
command (cmdk palette) breadcrumb avatar
```

### Custom components (live in `components/`)
- `<SignalCard />` — the heart of the stream
- `<TradeTapeRow />` — virtualized row primitive
- `<WhaleTape />` — virtualized container, manages scroll & batching
- `<ConnectionBadge />` — latency-tiered status pill with hover sparkline
- `<MonoNumber value size unit />` — enforces tabular-nums, decimal-safe formatting, semantic tinting
- `<WalletAddress address truncate="4-4" copyable />` — consistent address rendering
- `<ProbabilitySparkline asset_id />` — lightweight-charts wrapper
- `<OrderBookDepth asset_id levels=20 />` — canvas-rendered depth view
- `<ExecutePanel signal />` — gated execution UI per §6.5
- `<FreshnessPulse />` — wraps a child with the 1.2s scale pulse, prop-controlled active state

### Anti-shadcn patterns to avoid here
- Don't use the default "Card" component for signal cards — it's too rounded and too padded. Roll a custom one matching §5.
- Don't use `<Badge>` for BUY/SELL pills — those need the diamond glyph and a specific border-only treatment. Roll custom.

---

## 12. Tech Stack

### Runtime
- **Next.js 15** App Router, Turbopack dev
- **React 19**, server components by default; client components for live regions
- **TypeScript** strict, `noUncheckedIndexedAccess: true`
- **Node 22 LTS**

### Styling
- **Tailwind v4**, CSS variables driven by shadcn
- **shadcn/ui** style `new-york`, base color `zinc`
- Custom design tokens layered on top in `app/globals.css` per §2

### Data
- **TanStack Query v5** — REST bootstrap
- **Zustand v5** — live state
- **decimal.js** — every notional/price/size operation
- **zod** — WS event parsing
- **nuqs** — URL state
- **date-fns** — minimal time formatting

### Rendering
- **motion v11** (framer-motion) — spring physics only
- **lightweight-charts v4** — price probability sparklines
- **@tanstack/react-virtual v3** — tape virtualization
- **lucide-react** — icons, used sparingly, never for BUY/SELL semantics

### Tooling
- **Biome** (or eslint + prettier) — pick one, not both
- **Vitest** + **@testing-library/react** for unit tests
- **Playwright** for E2E (the WS reconnect flow needs it)

### Bundle budget
- Initial JS budget: **< 200KB gzipped** for the Command Deck route
- Lightweight-charts and the order book canvas are dynamically imported only when a market is opened

---

## 13. Accessibility

- All interactive components built atop Radix primitives via shadcn — keyboard nav comes free.
- Color is never the sole channel for BUY/SELL — the `◆/◇` glyph + `BUY/SELL` text both carry the signal.
- Contrast: every text/background pair audited to 4.5:1 minimum (Bone on Charcoal = 14.6:1, Steel on Graphite = 5.1:1, Phosphor Amber on Charcoal = 4.7:1). The semantic teal/rust on Graphite are 4.6:1 and 4.8:1 respectively.
- Focus ring is **always visible**, 2px Phosphor Amber with 2px offset.
- Reduced motion: respect `prefers-reduced-motion` — perpetual pulses disable, stagger reveals shorten to 0, drawer transitions become instant fades.

---

## 14. Anti-Patterns (Banned)

Explicit, non-negotiable:

- No `Inter`. No generic serif.
- No pure black `#000000`.
- No purple, no neon, no outer glow shadows.
- No 3-equal-column card rows.
- No giant gradient hero copy ("Unleash your edge"). No marketing voice anywhere.
- No fabricated metrics. If we don't have the number, we render `—`.
- No `99.98% UPTIME` / `KEY STATISTICS` / `BY THE NUMBERS` panels with invented data.
- No `LABEL // YEAR` formatting.
- No emojis. No 🟢🔴. No custom mouse cursors.
- No "Scroll to explore" / chevron arrows / bouncing animations.
- No giant rounded-3xl signal cards. Cockpit radii cap at 12px.
- No background-filled BUY/SELL pills. Border-only with mono text.
- No circular spinners.
- No toast spam for routine events.
- No overlapping elements. Every element gets its own spatial zone.
- No centered hero on the Command Deck. The asymmetric three-region grid is the hero.

---

## 15. Information Density Audit (the "is this enough data" check)

At any moment on the Command Deck, an operator should be able to answer **without scrolling**:
- What are the top 3 active whale signals right now?
- Which wallets contributed to the freshest signal?
- Is the bus connection healthy?
- When did the most recent whale trade land?
- Is live trading enabled or dry-run?

If any of these requires a click or scroll, the layout has drifted from the design.

---

## 16. Next Steps

1. **Review this spec.** Push back on color choices (especially Phosphor Amber), the dry-run/live execute gating pattern, and the asymmetric grid proportions.
2. **Scaffold the Next.js app** at `polymarket/dashboard/web/` with shadcn init, theme tokens from §2, and a stub `<CommandDeck />` route rendering the three-region grid with mock data.
3. **Stand up the Python ws-bridge** at `polymarket/dashboard/bridge/` (FastAPI + websockets) consuming `PolymarketWhaleDataClient` and emitting the §9 envelope. Mock CLOB WS first; wire real one second.
4. **Build the Command Deck end-to-end** against the live bridge with one watched wallet. This is the cutover from "design" to "working artifact."
5. **Iterate on motion** once the screen has real data flowing — perceptual tuning needs the real frequency of events, not mock cadence.

---

## Appendix A — File layout (proposed)

```
polymarket/
  dashboard/
    DESIGN.md                  # this file
    bridge/                    # Python ws-bridge
      pyproject.toml
      src/bridge/
        __init__.py
        main.py                # FastAPI app
        polymarket_source.py   # CLOB WS + Data API client
        signal_engine.py       # wraps build_whale_signals()
        ring_buffer.py         # event replay
        envelope.py            # pydantic models matching §9
      tests/
    web/                       # Next.js app
      app/
        layout.tsx
        page.tsx               # Command Deck
        market/[condition_id]/[asset_id]/page.tsx
        settings/page.tsx
        connections/page.tsx
      components/
        ui/                    # shadcn primitives
        signal-card.tsx
        trade-tape-row.tsx
        whale-tape.tsx
        connection-badge.tsx
        mono-number.tsx
        wallet-address.tsx
        probability-sparkline.tsx
        order-book-depth.tsx
        execute-panel.tsx
        freshness-pulse.tsx
      lib/
        stream/                # WS client + zod schemas
        stores/                # zustand
        format/                # decimal-safe formatters
      package.json
      components.json
      tailwind.config.ts
```

---

**Design owner:** TBD (Jarad solo until otherwise stated)
**Last updated:** 2026-05-21
