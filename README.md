# Adaptive DBC

Intelligent launch infrastructure for assets on Meteora DBC, DAMM v2, and DLMM.

## Structure

- `apps/web` — Next.js frontend (moved from repo root, single-page dashboard for now)
- `apps/api` — Backend API (stub)
- `packages/strategy-engine` — Core Adaptive logic (stub)
- `packages/meteora` — DBC/DAMM/DLMM integrations (stub)
- `packages/simulation-engine` — Launch simulations (stub)
- `packages/market-data` — Solana/Meteora indexing (stub)
- `packages/shared` — Shared types/constants/schemas/utils (stub)
- `services/*` — Background workers (stubs)
- `configs/strategies` — Strategy JSON configs (stubs)

## Dev

- `pnpm install`
- `pnpm --filter @adaptive/web dev` — frontend only
- `pnpm build` — turbo build all

If deploying `apps/web` to Vercel, set Root Directory to `apps/web`.
