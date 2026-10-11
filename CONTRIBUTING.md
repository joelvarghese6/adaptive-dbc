# Contributing

- Branch from `main`, e.g. `chore/monorepo-migrate`.
- `pnpm install`, `pnpm build`, `pnpm --filter @adaptive/web dev`.
- Keep `apps/web` single-page for now; extract `components/adaptive-dashboard.tsx` into `apps/web/features/*` on next refactor.
