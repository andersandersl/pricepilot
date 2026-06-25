# PricePilotv2

Minimal live EAN pricing calculator.

## Scope (v1)
- Input one EAN
- Lookup purchase cost from Azure SQL
- Lookup live competitor prices from PriceRunner
- Apply strategy: match cheapest with minimum margin floor
- Optional fixed override per EAN
- Return one recommended price
- No competitor snapshot storage
- Global rate limit: 600 requests per minute

## Structure
- `api/` Express + TypeScript backend
- `web/` React + Vite frontend

## Quick Start
1. Install root utilities:
   ```bash
   npm install
   ```
2. Install API deps:
   ```bash
   cd api && npm install
   ```
3. Install web deps:
   ```bash
   cd ../web && npm install
   ```
4. Configure API env:
   - Copy `api/.env.example` to `api/.env`
5. Run both apps from root:
   ```bash
   npm run dev
   ```

Web runs on `http://localhost:5173` and API on `http://localhost:8788`.
