/**
 * Devnet end-to-end launch.
 * Run: pnpm --filter @adaptive/api devnet:launch
 * Requires: SOLANA_RPC_URL (optional, defaults to devnet),
 *           SOLANA_PRIVATE_KEY (devnet wallet with SOL for fees).
 * Optional: LAUNCH_ID (pin a launch id so a retry never creates a second mint),
 *           LAUNCH_STATE_DIR (checkpoint directory, default .devnet-launches).
 */
import type { AssetProfile } from "@adaptive/shared";
import { CheckpointError, PartialDeploymentError, log } from "@adaptive/shared";
import { recommendStrategy } from "@adaptive/strategy-engine";
import { runSimulation } from "@adaptive/simulation-engine";
import { buildLaunchConfig, deployLaunch, getRpcUrl, loadKeypairFromEnv } from "@adaptive/meteora";
import {
  DEFAULT_STATE_DIR,
  checkpointFile,
  existingMintRecovery,
  readCheckpoint,
  writeCheckpoint,
} from "./launch-checkpoint.js";

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

  // A pinned launch id makes retries safe: the same id reuses the checkpoint.
  const launchId = process.env["LAUNCH_ID"] ?? `devnet-${Date.now()}`;
  const stateDir = process.env["LAUNCH_STATE_DIR"] ?? DEFAULT_STATE_DIR;
  const rpcUrl = getRpcUrl();

  // Read the checkpoint BEFORE requiring the private key: a partial launch must
  // be reported even when SOLANA_PRIVATE_KEY is not set, and reading the
  // checkpoint never needs the key.
  const recovery = existingMintRecovery(readCheckpoint(stateDir, launchId));
  if (recovery) {
    console.error(`\n${recovery}`);
    process.exit(1);
  }

  const payer = loadKeypairFromEnv();
  console.log(`Deployer: ${payer.publicKey.toBase58()}`);
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Launch id: ${launchId} (checkpoint: ${checkpointFile(stateDir, launchId)})`);

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
      onCheckpoint: (cp) => {
        const file = writeCheckpoint(stateDir, cp);
        console.log(`  checkpoint [${cp.phase}] -> ${file} (baseMint ${cp.baseMint})`);
      },
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
  if (err instanceof CheckpointError) {
    console.error("\n*** REFUSING TO CONTINUE — launch checkpoint is not usable ***");
    console.error(err.message);
    console.error(
      "No further transaction will be submitted. Inspect the checkpoint file and verify on-chain " +
        "state (mint, config, pool) before retrying; do not create another base mint.",
    );
    process.exit(1);
  }
  if (err instanceof PartialDeploymentError) {
    console.error("\n*** PARTIAL DEPLOYMENT — the launch did NOT finish ***");
    console.error(`launchId: ${err.launchId}`);
    console.error(`baseMint: ${err.baseMint}`);
    if (err.configAddress) console.error(`config: ${err.configAddress}`);
    if (err.poolAddress) console.error(`pool: ${err.poolAddress}`);
    err.transactionSignatures.forEach((sig, i) => console.error(`tx[${i}]: ${sig}`));
    if (err.recovery) console.error(`\n${err.recovery}`);
    process.exit(1);
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
