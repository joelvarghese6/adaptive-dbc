/**
 * Resume a partial devnet launch from its checkpoint.
 * Run: pnpm --filter @adaptive/api devnet:resume
 * Requires: LAUNCH_ID (the partial launch to resume),
 *           SOLANA_RPC_URL (optional, defaults to devnet),
 *           SOLANA_PRIVATE_KEY (devnet wallet with SOL for fees).
 * Optional: LAUNCH_STATE_DIR (checkpoint directory, default .devnet-launches).
 *
 * This NEVER creates a base mint: it reuses the mint recorded in the checkpoint,
 * adopts any config/pool that already exists, and finishes the rest.
 */
import type { AssetProfile } from "@adaptive/shared";
import { CheckpointError, PartialDeploymentError, ResumeError, log } from "@adaptive/shared";
import { recommendStrategy } from "@adaptive/strategy-engine";
import { buildLaunchConfig, loadKeypairFromEnv, resumeLaunch } from "@adaptive/meteora";
import {
  DEFAULT_STATE_DIR,
  checkpointFile,
  readCheckpoint,
  writeCheckpoint,
} from "./launch-checkpoint.js";

async function main(): Promise<void> {
  const launchId = process.env["LAUNCH_ID"];
  if (!launchId || launchId.trim().length === 0) {
    console.error(
      "LAUNCH_ID is required to resume a partial devnet launch, e.g. LAUNCH_ID=devnet-1791746931.",
    );
    process.exit(1);
  }
  const stateDir = process.env["LAUNCH_STATE_DIR"] ?? DEFAULT_STATE_DIR;

  // Read the checkpoint BEFORE requiring the private key: a missing key must not
  // hide the fact that this launch is a recoverable partial deployment.
  const checkpoint = readCheckpoint(stateDir, launchId);
  if (!checkpoint) {
    console.error(
      `No launch checkpoint found for ${launchId} at ${checkpointFile(stateDir, launchId)}. ` +
        "Nothing to resume.",
    );
    process.exit(1);
  }
  if (checkpoint.phase === "pool_created") {
    console.log(`Launch ${launchId} is already complete (phase pool_created). Nothing to resume.`);
    return;
  }

  const asset: AssetProfile = {
    name: process.env["ASSET_NAME"] ?? "Adaptive Real Estate",
    symbol: process.env["ASSET_SYMBOL"] ?? "ARE",
    assetType: "RWA",
    totalSupply: Number(process.env["ASSET_SUPPLY"] ?? 1_000_000_000),
    decimals: Number(process.env["ASSET_DECIMALS"] ?? 9),
    referencePrice: Number(process.env["ASSET_REFERENCE_PRICE"] ?? 0.001),
    targetLiquidity: Number(process.env["ASSET_TARGET_LIQUIDITY"] ?? 100_000),
  };
  const rpcUrl = process.env["SOLANA_RPC_URL"]?.trim() || undefined;

  // Report what will be resumed before requiring the key.
  console.log(`Resuming launch ${launchId}`);
  console.log(`Base mint: ${checkpoint.baseMint}`);
  console.log(`Phase: ${checkpoint.phase} -> ${checkpointFile(stateDir, launchId)}`);

  const strategy = recommendStrategy(asset);
  if (strategy.strategyId !== checkpoint.strategyId) {
    console.error(
      `\nStrategy mismatch: checkpoint is ${checkpoint.strategyId} but this asset resolves to ` +
        `${strategy.strategyId}. Set ASSET_* env vars to match the original launch, or resume with ` +
        "the recorded strategy.",
    );
    process.exit(1);
  }
  console.log(`Strategy: ${strategy.strategyId} (${strategy.strategyName})`);

  const payer = loadKeypairFromEnv();
  console.log(`Deployer: ${payer.publicKey.toBase58()}`);

  const plan = buildLaunchConfig(asset, strategy);
  console.log(`Config plan: migrationTarget=${plan.migrationTarget}`);

  console.log("\nResuming partial devnet deployment (no new base mint)...");
  const deployment = await resumeLaunch(
    {
      launchId,
      strategyId: strategy.strategyId,
      asset,
      name: asset.name,
      symbol: asset.symbol,
      rpcUrl,
      configParameters: plan.configParameters,
      checkpoint,
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
  deployment.transactionSignatures.forEach((sig, i) => console.log(`tx[${i}]: ${sig}`));
  log("info", "Devnet launch resumed", {
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
      "No transaction was submitted. Inspect the checkpoint file and verify on-chain state " +
        "(mint, config, pool) before retrying; do not create another base mint.",
    );
    process.exit(1);
  }
  if (err instanceof ResumeError) {
    console.error("\n*** REFUSING TO RESUME — checkpoint and chain are not safe to continue ***");
    console.error(err.message);
    console.error("No base mint was created. Resolve the discrepancy above, then re-run resume.");
    process.exit(1);
  }
  if (err instanceof PartialDeploymentError) {
    console.error("\n*** PARTIAL DEPLOYMENT — the resume did NOT finish ***");
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
