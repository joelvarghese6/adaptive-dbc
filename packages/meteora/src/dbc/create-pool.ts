import {
  createInitializeMint2Instruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  deriveDbcPoolAddress,
  type ConfigParameters,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  CheckpointError,
  MeteoraError,
  PartialDeploymentError,
  RpcError,
  log,
  type DeploymentResult,
} from "@adaptive/shared";
import { createMeteoraClient } from "../client.js";
import { confirmTransaction, sendAndConfirm, submitTransaction } from "../transactions/index.js";
import { assertDeployableConfig } from "./validation.js";
import type { DeploymentCheckpoint, DeployLaunchInput } from "./types.js";

/** Wrapped SOL, the default devnet quote mint. */
export const DEFAULT_QUOTE_MINT = "So11111111111111111111111111111111111111112";

export function derivePoolAddress(quoteMint: string, baseMint: string, config: string): string {
  return deriveDbcPoolAddress(
    new PublicKey(quoteMint),
    new PublicKey(baseMint),
    new PublicKey(config),
  ).toBase58();
}

/** Build the on-chain `createConfig` transaction for a launch plan. */
export async function buildCreateConfigTransaction(input: {
  rpcUrl: string;
  config: PublicKey;
  feeClaimer: PublicKey;
  leftoverReceiver: PublicKey;
  quoteMint: PublicKey;
  payer: PublicKey;
  configParameters: ConfigParameters;
}) {
  const { client } = createMeteoraClient(input.rpcUrl);
  return client.partner.createConfig({
    config: input.config,
    feeClaimer: input.feeClaimer,
    leftoverReceiver: input.leftoverReceiver,
    quoteMint: input.quoteMint,
    payer: input.payer,
    ...input.configParameters,
  });
}

/**
 * Full devnet deployment: create base mint, create DBC config, create DBC pool.
 * Submits real transactions; nothing is fabricated.
 *
 * The config is validated before any transaction, so an invalid config can never
 * leave an orphaned mint behind. The base mint's address and submission
 * signature are captured before confirmation. If a later step fails, the
 * existing base mint (and any captured signatures) are reported through a
 * PartialDeploymentError and the `onCheckpoint` hook, and are never silently
 * recreated.
 */
export async function deployLaunch(input: DeployLaunchInput, payer: Keypair): Promise<DeploymentResult> {
  // Deterministic validation first: never create a mint for a config the SDK
  // will reject inside `createConfig`.
  assertDeployableConfig(input.configParameters);

  const rpcUrl = input.rpcUrl ?? "https://api.devnet.solana.com";
  const network: DeploymentResult["network"] = rpcUrl.includes("devnet") ? "devnet" : "mainnet";
  const quoteMint = new PublicKey(input.quoteMint ?? DEFAULT_QUOTE_MINT);
  const { connection, client } = createMeteoraClient(rpcUrl);

  const signatures: string[] = [];
  const checkpoint = (fields: {
    baseMint: PublicKey;
    configAddress?: PublicKey;
    poolAddress?: PublicKey;
    phase: DeploymentCheckpoint["phase"];
    lastValidBlockHeight?: number;
  }) =>
    input.onCheckpoint?.({
      launchId: input.launchId,
      strategyId: input.strategyId,
      network,
      rpcUrl,
      baseMint: fields.baseMint.toBase58(),
      configAddress: fields.configAddress?.toBase58() ?? null,
      poolAddress: fields.poolAddress?.toBase58() ?? null,
      transactionSignatures: [...signatures],
      phase: fields.phase,
      lastValidBlockHeight: fields.lastValidBlockHeight ?? null,
      updatedAt: new Date().toISOString(),
    });

  const airdropNeeded = await needsAirdrop(connection, payer.publicKey);
  if (airdropNeeded) {
    log("info", "Requesting devnet airdrop for deployer", {
      launchId: input.launchId,
    });
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, 2_000_000_000);
      await connection.confirmTransaction(sig, "confirmed");
    } catch {
      // Airdrop may be rate-limited; continue and surface real tx errors instead.
    }
  }

  let baseMint: PublicKey | undefined;
  let configAddress: PublicKey | undefined;
  let poolAddress: PublicKey | undefined;
  let mintSubmissionAttempted = false;

  try {
    // 1. Create the base SPL mint owned by the payer. The mint keypair is
    //    generated and its transaction submitted manually (rather than via
    //    `createMint`) so the address is known up front and the signature is
    //    captured before confirmation. That lets a retry report and inspect
    //    this exact mint instead of silently creating another.
    const mintKeypair = Keypair.generate();
    baseMint = mintKeypair.publicKey;
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    const mintTransaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: baseMint,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        baseMint,
        input.asset.decimals,
        payer.publicKey,
        null,
        TOKEN_PROGRAM_ID,
      ),
    );
    // Pin the blockhash ourselves so reconciliation knows the submission's
    // lastValidBlockHeight (a "not found" is only conclusive after it expires).
    const mintBlockhash = await connection.getLatestBlockhash("confirmed");
    mintTransaction.recentBlockhash = mintBlockhash.blockhash;
    mintTransaction.feePayer = payer.publicKey;
    // Persist the intended mint address BEFORE submitting: once the transaction
    // is submitted its address is already durable, closing the crash window
    // between submission and checkpoint persistence.
    await checkpoint({
      baseMint,
      phase: "mint_submitting",
      lastValidBlockHeight: mintBlockhash.lastValidBlockHeight,
    });
    log("info", "Submitting base mint", {
      launchId: input.launchId,
      strategyId: input.strategyId,
      baseMint: baseMint.toBase58(),
    });
    mintSubmissionAttempted = true;
    const mintSignature = await submitTransaction(
      connection,
      mintTransaction,
      [payer, mintKeypair],
      "createMint",
    );
    signatures.push(mintSignature);
    log("info", "Base mint submitted", {
      launchId: input.launchId,
      strategyId: input.strategyId,
      baseMint: baseMint.toBase58(),
    });
    // Record the signature before confirming: from here on a retry must not mint
    // again, and the transaction can be inspected on-chain.
    await checkpoint({
      baseMint,
      phase: "mint_created",
      lastValidBlockHeight: mintBlockhash.lastValidBlockHeight,
    });
    await confirmTransaction(connection, mintSignature, "createMint");

    // 2. Create the DBC config (partner == payer for the first demo).
    const configKeypair = Keypair.generate();
    const createConfigTx = await client.partner.createConfig({
      config: configKeypair.publicKey,
      feeClaimer: payer.publicKey,
      leftoverReceiver: payer.publicKey,
      quoteMint,
      payer: payer.publicKey,
      ...(input.configParameters as ConfigParameters),
    });
    const configSignature = await sendAndConfirm(
      connection,
      createConfigTx,
      [payer, configKeypair],
      "createConfig",
    );
    signatures.push(configSignature);
    configAddress = configKeypair.publicKey;
    await checkpoint({ baseMint, configAddress, phase: "config_created" });

    // 3. Create the DBC pool from the config. The pool address is deterministic.
    poolAddress = deriveDbcPoolAddress(quoteMint, baseMint, configAddress);
    const createPoolTx = await client.creator.createPool({
      name: input.name,
      symbol: input.symbol,
      uri: input.uri ?? "",
      payer: payer.publicKey,
      poolCreator: payer.publicKey,
      config: configAddress,
      baseMint,
    });
    const poolSignature = await sendAndConfirm(connection, createPoolTx, [payer], "createPool");
    signatures.push(poolSignature);
    await checkpoint({ baseMint, configAddress, poolAddress, phase: "pool_created" });
  } catch (err) {
    // A checkpoint failure must surface as-is (fail safe) and never be mistaken
    // for a partial deployment with a mint that may not exist.
    if (err instanceof CheckpointError) throw err;
    if (baseMint) {
      const mintSubmitted = signatures.length > 0 || mintSubmissionAttempted;
      throw new PartialDeploymentError({
        launchId: input.launchId,
        baseMint: baseMint.toBase58(),
        configAddress: configAddress?.toBase58() ?? null,
        poolAddress: poolAddress?.toBase58() ?? null,
        transactionSignatures: signatures,
        message: mintSubmitted
          ? `Launch ${input.launchId} partially deployed: base mint ${baseMint.toBase58()} was ` +
            `submitted but deployment did not finish (${describe(err)}).`
          : `Launch ${input.launchId}: base mint submission outcome is unknown (${describe(err)}).`,
        recovery: mintSubmitted
          ? undefined
          : `The base mint ${baseMint.toBase58()} may or may not exist on-chain: its submission ` +
            `outcome is unconfirmed. Do NOT create another mint. Reconcile using the submission ` +
            `signature and the mint account; treat a timeout or "not found" as inconclusive until ` +
            `the transaction's blockhash expires.`,
      });
    }
    throw toMeteoraError(err);
  }

  if (!baseMint || !configAddress || !poolAddress || signatures.length < 3)
    throw new MeteoraError(
      "Deployment finished without a confirmed mint, config, and pool; on-chain state is inconsistent.",
    );

  const result: DeploymentResult = {
    launchId: input.launchId,
    strategyId: input.strategyId,
    dataSource: network,
    network,
    rpcUrl,
    configAddress: configAddress.toBase58(),
    poolAddress: poolAddress.toBase58(),
    baseMint: baseMint.toBase58(),
    transactionSignatures: signatures,
    transactionState: "confirmed",
    deployedAt: new Date().toISOString(),
  };
  log("info", "Launch deployed", {
    launchId: result.launchId,
    strategyId: result.strategyId,
    configAddress: result.configAddress,
    poolAddress: result.poolAddress,
    transactionSignature: signatures[signatures.length - 1],
  });
  return result;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function needsAirdrop(
  connection: ReturnType<typeof createMeteoraClient>["connection"],
  owner: PublicKey,
): Promise<boolean> {
  try {
    const balance = await connection.getBalance(owner, "confirmed");
    return balance < 500_000_000;
  } catch {
    throw new RpcError("Unable to read payer balance from RPC.");
  }
}

export function toMeteoraError(err: unknown): MeteoraError {
  if (err instanceof MeteoraError) return err;
  if (err instanceof Error) return new MeteoraError(err.message);
  return new MeteoraError("Unknown Meteora error");
}
