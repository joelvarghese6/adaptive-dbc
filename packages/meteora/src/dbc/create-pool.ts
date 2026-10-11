import { createMint } from "@solana/spl-token";
import {
  deriveDbcPoolAddress,
  type ConfigParameters,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  MeteoraError,
  RpcError,
  log,
  type DeploymentResult,
} from "@adaptive/shared";
import { createMeteoraClient } from "../client.js";
import { sendAndConfirm } from "../transactions/index.js";
import type { DeployLaunchInput } from "./types.js";

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
 */
export async function deployLaunch(input: DeployLaunchInput, payer: Keypair): Promise<DeploymentResult> {
  const rpcUrl = input.rpcUrl ?? "https://api.devnet.solana.com";
  const quoteMint = new PublicKey(input.quoteMint ?? DEFAULT_QUOTE_MINT);
  const { connection, client } = createMeteoraClient(rpcUrl);

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

  // 1. Create the base SPL mint owned by the payer.
  const baseMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    input.asset.decimals,
    Keypair.generate(),
    { commitment: "confirmed" },
  );
  log("info", "Base mint created", {
    launchId: input.launchId,
    strategyId: input.strategyId,
  });

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

  // 3. Create the DBC pool from the config. The pool address is deterministic.
  const poolAddress = deriveDbcPoolAddress(quoteMint, baseMint, configKeypair.publicKey);
  const createPoolTx = await client.creator.createPool({
    name: input.name,
    symbol: input.symbol,
    uri: input.uri ?? "",
    payer: payer.publicKey,
    poolCreator: payer.publicKey,
    config: configKeypair.publicKey,
    baseMint,
  });
  const poolSignature = await sendAndConfirm(connection, createPoolTx, [payer], "createPool");

  const result: DeploymentResult = {
    launchId: input.launchId,
    strategyId: input.strategyId,
    dataSource: "devnet",
    network: rpcUrl.includes("devnet") ? "devnet" : "mainnet",
    rpcUrl,
    configAddress: configKeypair.publicKey.toBase58(),
    poolAddress: poolAddress.toBase58(),
    baseMint: baseMint.toBase58(),
    transactionSignatures: [configSignature, poolSignature],
    transactionState: "confirmed",
    deployedAt: new Date().toISOString(),
  };
  log("info", "Launch deployed", {
    launchId: result.launchId,
    strategyId: result.strategyId,
    configAddress: result.configAddress,
    poolAddress: result.poolAddress,
    transactionSignature: poolSignature,
  });
  return result;
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
