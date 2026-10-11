/**
 * Devnet end-to-end launch.
 * Run: pnpm --filter @adaptive/api devnet:launch
 * Requires: SOLANA_RPC_URL (optional, defaults to devnet),
 *           SOLANA_PRIVATE_KEY (devnet wallet with SOL for fees).
 */
import type { AssetProfile } from "@adaptive/shared";
import { log } from "@adaptive/shared";
import { recommendStrategy } from "@adaptive/strategy-engine";
import { runSimulation } from "@adaptive/simulation-engine";
import { buildLaunchConfig, deployLaunch, getRpcUrl, loadKeypairFromEnv } from "@adaptive/meteora";

async function main(): Promise<void> {
  const asset: AssetProfile = {
    name: process.env["ASSET_NAME"] ?? "Adaptive Real Estate",
    symbol: process.env["ASSET_SYMBOL"] ?? "ARE",
    assetType: "RWA",
    totalSupply: Number(process.env["ASSET_SUPPLY"] ?? 1_000_000_000),
    decimals: Number(process.env["ASSET_DECIMALS"] ?? 9),
    referencePrice: Number(process.env["ASSET_REFERENCE_PRICE"] ?? 0.001),
    targetLiquidity: Number(process.env["ASSET_TARGET_LIQUIDITY"] ?? 100_000),
  };

  const launchId = `devnet-${Date.now()}`;
  const rpcUrl = getRpcUrl();
  const payer = loadKeypairFromEnv();
  console.log(`Deployer: ${payer.publicKey.toBase58()}`);
  console.log(`RPC: ${rpcUrl}`);

  const strategy = recommendStrategy(asset);
  console.log(`\nStrategy: ${strategy.strategyId} (${strategy.strategyName})`);
  for (const reason of strategy.reasoning) console.log(`  - ${reason}`);

  const simulation = runSimulation({ launchId, asset, strategy });
  console.log(
    `\nSimulation: initialMarketCap=${simulation.initialMarketCap} migrationMarketCap=${simulation.migrationMarketCap} eta=${simulation.estimatedGraduationDays}d (simulation only)`,
  );

  const plan = buildLaunchConfig(asset, strategy);
  console.log(`\nConfig plan: migrationTarget=${plan.migrationTarget}`);

  console.log("\nSubmitting real devnet transactions...");
  const deployment = await deployLaunch(
    {
      launchId,
      strategyId: strategy.strategyId,
      asset,
      name: asset.name,
      symbol: asset.symbol,
      rpcUrl,
      configParameters: plan.configParameters,
    },
    payer,
  );

  console.log("\n=== DEPLOYED ===");
  console.log(`config: ${deployment.configAddress}`);
  console.log(`pool: ${deployment.poolAddress}`);
  console.log(`baseMint: ${deployment.baseMint}`);
  deployment.transactionSignatures.forEach((sig, i) =>
    console.log(`tx[${i}]: ${sig}`),
  );
  log("info", "Devnet launch complete", {
    launchId,
    strategyId: strategy.strategyId,
    configAddress: deployment.configAddress,
    poolAddress: deployment.poolAddress,
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
