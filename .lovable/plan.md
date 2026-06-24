## PricePilot — Frontend Prototype Plan

A power-user pricing console for Nordic ecommerce. Fully mocked data, focused on a calm, analytical UX where everyday actions (review changes, approve recommended prices) are front-and-center and advanced configuration stays one click away.

### Design direction
- **Aesthetic**: Nordic-restrained analyst tool — think Linear/Pylon meets early Stripe dashboard. Not playful pastel, not dark Bloomberg.
- **Palette**: Light surface with one decisive accent. Off-white background `#FAFAF7`, ink `#0E0F12`, muted line `#E6E5DF`, accent signal `#1F5BFF`, positive `#15803D`, negative `#B91C1C`.
- **Type**: Inter Tight for UI, JetBrains Mono for all numeric/price cells (tabular figures everywhere prices appear).
- **Density**: Compact rows (36–40px), right-aligned numerics, status pills, keyboard-friendly affordances.

### App shell
- Fixed left sidebar (collapsible to icon): Dashboard, Products, Strategies, Competitors, Connections, Settings.
- Top bar: shop/connection switcher (e.g. "nordic-shop.myshopify.com"), market selector (DK/SE/NO/FI), search, user menu.
- TanStack Start routes under `src/routes/`: `index` redirects to `/dashboard`; then `dashboard`, `products`, `strategies`, `competitors`, `connections`, `settings`.

### Screens (priority order)

**1. Dashboard** (primary)
- KPI strip (4 cards): Price changes today, Avg margin, Revenue impact 7d, Competitor moves 24h — each with sparkline and delta.
- "Recommended price changes" panel: list of 6–10 SKUs awaiting approval with current → suggested price, reason, Approve / Skip buttons. Bulk approve at top.
- Competitor activity feed: timeline of competitor price moves on watched SKUs.
- Small chart: price index vs. market avg over 30 days.

**2. Products & pricing**
- Dense table: SKU, name, current price, cost, margin %, competitor min / avg / max, recommended, Δ vs current, strategy applied, status pill (Synced / Pending / Excluded).
- Sticky header, sortable columns, row click → side drawer with price history chart, competitor breakdown by retailer, applied rule, exception toggle.
- Filters: market, strategy, status, margin range. Bulk action bar appears on selection.

**3. Strategies** (secondary, kept simple)
- Card list of strategies (Match lowest, Beat by X%, Margin floor, Premium positioning). Each card shows: rule summary, # products assigned, last edited.
- "New strategy" opens a simple 3-field form, not a complex builder. Exceptions tab inside each strategy.

**4. Competitors**
- List of tracked competitors per market with coverage % and last-crawl time.
- Click a competitor → table of overlapping SKUs with price comparison.

**5. Connections**
- Cards for shop platforms (Shopify, Centra, WooCommerce). Connected card shows status, last sync, product count, read/write permissions, Disconnect.
- "Connect new shop" card opens a mocked 3-step setup (Platform → API credentials → Test connection).

**6. Settings** (minimal placeholder)
- Profile, team, notifications, billing — single page with sections.

### Mock data
A single `src/lib/mock-data.ts` exports: shops, markets, products (~40 SKUs across categories), competitors (5–7 Nordic retailers), strategies, recent price changes, KPI series. All prices in DKK by default with currency switching for display only.

### Out of scope for prototype
Real API wiring, auth, persistence, real charts library beyond lightweight inline SVG sparklines/line charts (use Recharts only where it adds clarity — KPI sparklines + dashboard 30d chart).

### Technical notes
- Stack: TanStack Start, Tailwind v4, shadcn/ui sidebar + table + dialog + drawer + tabs.
- Numbers use `font-variant-numeric: tabular-nums` via a small `.num` utility in `src/styles.css`.
- Define tokens in `src/styles.css` `@theme` (accent, positive, negative, muted-line). No hardcoded colors in components.
- Recharts for the 30d line + KPI sparklines.
- Lucide icons.

### Deliverable
A clickable, navigable prototype where an analyst can land on the dashboard, scan recommended changes, drill into a SKU, browse strategies and competitors, and walk through connecting a shop — all with mocked data and polished interactions.