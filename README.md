# Adaptive DBC

Intelligent launch infrastructure for assets on Meteora DBC, DAMM v2, and DLMM.

Flow: Asset profile → Strategy analysis → Strategy recommendation →
Meteora DBC configuration → DBC pool → Market monitoring → Graduation →
DAMM v2 → Post-graduation liquidity intelligence.

Adaptive does **not** modify bonding-curve parameters on live pools.
It selects and configures the right DBC strategy up front, then monitors
real pool state and recommends next steps.

## Structure

- `apps/web` — Next.js frontend (dashboard; `lib/api.ts` client + `LiveLaunchPanel` for the real backend)
- `apps/api` — Backend API (Node http): launch orchestration + `devnet:launch` script
- `packages/strategy-engine` — Deterministic strategies (`RWA_LONG_V1`, `STOCK_DISCOVERY_V1`, `AI_AGENT_V1`, `MEME_FAST_V1`). No Meteora imports.
- `packages/meteora` — All blockchain logic: `buildLaunchConfig`, `deployLaunch`, `getDbcPool`, wallet parsing. SDK `@meteora-ag/dynamic-bonding-curve-sdk@1.5.13`.
- `packages/simulation-engine` — Deterministic pre-deployment simulations (labeled `simulation`, never market data)
- `packages/market-data` — Normalized `PoolState` / `Trade` / volume / liquidity / graduation types
- `packages/shared` — Stable contracts (`AssetProfile`, `StrategyRecommendation`, `Launch`, `SimulationResult`, `DeploymentResult`) + typed errors + validation + logger
- `services/graduation-monitor` — Watches pools, detects graduation from on-chain state
- `services/indexer` — Populates market-data types from real Solana/Meteora reads
- `services/strategy-worker` — Adaptive monitoring recommendations (user-controlled, never moves funds)
- `configs/strategies` — Strategy parameter reference JSON

## Setup

```powershell
pnpm install
Copy-Item .env.example .env   # then set SOLANA_PRIVATE_KEY (devnet wallet)
pnpm typecheck
pnpm test
```

## Run

```powershell
pnpm --filter @adaptive/api dev        # API on http://localhost:4000
pnpm --filter @adaptive/web dev        # frontend on http://localhost:3000
```

API flow (also mirrored in the frontend Deploy step via `LiveLaunchPanel`):

```powershell
# create
$body = @{ asset = @{ name='Adaptive Real Estate'; symbol='ARE'; assetType='RWA';
  totalSupply=1000000000; decimals=9; referencePrice=0.001 } } | ConvertTo-Json -Depth 5
$id = (Invoke-RestMethod http://localhost:4000/api/launches -Method POST -Body $body `
  -ContentType 'application/json').launch.id
# analyze -> RWA_LONG_V1, simulate -> simulation only
Invoke-RestMethod http://localhost:4000/api/launches/$id/analyze -Method POST
Invoke-RestMethod http://localhost:4000/api/launches/$id/simulate -Method POST
# deploy -> real devnet DBC config + pool (needs SOLANA_PRIVATE_KEY)
Invoke-RestMethod http://localhost:4000/api/launches/$id/deploy -Method POST `
  -Body '{}' -ContentType 'application/json'
```

## Devnet deployment

```powershell
$env:SOLANA_RPC_URL = 'https://api.devnet.solana.com'
$env:SOLANA_PRIVATE_KEY = '<devnet keypair: base58 or JSON array>'
pnpm --filter @adaptive/api devnet:launch
```

Prints the transaction signatures, config address, and pool address.
The deployer needs devnet SOL (the script requests an airdrop if balance is low).
Demo scale is 1B tokens at 9 decimals — the tested combination that yields a
feasible on-chain curve with SDK 1.5.13. Never commit `.env`.

## Data-source honesty

Every payload carries its source: `simulation`, `devnet`, `mainnet`, or `mock`.
Mock data is never presented as blockchain state, and graduation is only
reported from on-chain curve progress (never timers).

If deploying `apps/web` to Vercel, set Root Directory to `apps/web`.
