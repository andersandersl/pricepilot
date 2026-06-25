# Backend Migration Plan (v2 -> Navigator Frontend)

## Current Status
- Legacy backend from `Old.EANrunner/PricePilotv2/api` is running on port 8788.
- New frontend now includes a live API client and attempts to load Woo products from `/api/v1/woocommerce/products`.
- Products page falls back to prototype mock data when backend is unavailable or returns an error.
- CORS now allows localhost:8080 (new frontend dev server).

## Endpoints Available in Legacy API
- `GET /health`
- `GET /api/v1/woocommerce/products`
- `POST /api/v1/bulk-price`
- `POST /api/v1/woocommerce/price-sync`
- `POST /api/v1/purchasing-feed/summary`
- `POST /api/v1/purchasing-feed/eans`
- `POST /api/v1/woocommerce/matched-products`
- `POST /api/v1/woocommerce/matched-products/jobs`
- `GET /api/v1/woocommerce/matched-products/jobs/:jobId`

## What the New Frontend Still Uses Mock Data For
- Recent changes feed
- Strategies list and strategy metadata
- Exclusions dashboard
- Product enrichment fields (competitor history, comp min/avg/max) when backend does not provide them directly

## Recommended Migration Phases

### Phase 1 (done)
- Add frontend API client.
- Wire Products route to prefer live Woo products with fallback.
- Enable CORS for frontend origin.

### Phase 2
- Replace Exclusions route data source with real backend payloads:
  - Use matched products + feed EAN endpoints.
  - Derive excluded status from feed/shop matching logic.
- Replace Strategies route with backend-backed strategy entities (or keep static if strategy engine is still single-rule).

### Phase 3
- Replace Recent changes route with real audit trail source:
  - Add backend persistence table for applied updates (who/why/when/from/to).
  - Read from that endpoint instead of generated feed.

### Phase 4
- Remove legacy v2 frontend (`Old.EANrunner/PricePilotv2/web`) after feature parity.
- Extract only required backend services from old API:
  - Keep: `pricingEngine`, `purchasingFeedService`, `woocommerceService`, selected routes.
  - Remove if unused: single-product endpoint placeholder, dead UI-only assumptions, duplicated auth flow from old web.

## Immediate Blockers to Go Live with Real Data
- WooCommerce credentials are currently missing or invalid in backend env (API returns 401).
- Configure these in legacy API env:
  - `WOOCOMMERCE_BASE_URL`
  - `WOOCOMMERCE_CONSUMER_KEY`
  - `WOOCOMMERCE_CONSUMER_SECRET`
- After credentials are valid, Products page should switch from fallback to live source automatically.

## Safety Notes
- Keep fallback mode in UI until all key routes are migrated.
- Avoid deleting old backend modules before route-by-route replacement is verified.
- Add integration tests for `/woocommerce/products`, `/bulk-price`, and `/price-sync` before removing old v2 web.
