import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { deriveDbcPoolAddress, type ConfigParameters } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Keypair, PublicKey, type Connection, type Transaction } from "@solana/web3.js";
import {
  CheckpointError,
  PartialDeploymentError,
  ResumeError,
  TransactionError,
  log,
  type DeploymentResult,
} from "@adaptive/shared";
import { createMeteoraClient } from "../client.js";
import { submitTransaction } from "../transactions/index.js";
import { assertDeployableConfig } from "./validation.js";
import { reconcileMintSubmission } from "./reconcile.js";
import { DEFAULT_QUOTE_MINT } from "./create-pool.js";
import type { DeploymentCheckpoint, DeploymentPhase, ResumeLaunchInput } from "./types.js";

/** The minimal RPC surface resume needs; keeps the function easy to fake in tests. */
export type ResumeConnection = Pick<
  Connection,
  | "getParsedAccountInfo"
  | "getAccountInfo"
  | "getLatestBlockhash"
  | "sendTransaction"
  | "confirmTransaction"
  | "getBlockHeight"
  | "getSignatureStatuses"
>;

/** Structural view of the SDK client resume needs (satisfied by the real client). */
export interface ResumeMeteoraClient {
  state: {
    getPoolConfig(config: PublicKey | string): Promise<unknown | null>;
    getPool(pool: PublicKey | string): Promise<unknown | null>;
    getPoolByBaseMint(baseMint: PublicKey | string): Promise<unknown | null>;
  };
  partner: {
    createConfig(params: Record<string, unknown>): Promise<Transaction>;
  };
  creator: {
    createPool(params: Record<string, unknown>): Promise<Transaction>;
  };
}

/**
 * Resume a partial launch: reuse the base mint recorded in the checkpoint and
 * finish the DBC config and pool. This NEVER creates a base mint.
 *
 * Safe by construction:
 * - The checkpoint is validated against the chain before any transaction.
 * - A missing/inconsistent mint, config, or pool refuses (throws `ResumeError`)
 *   rather than guessing.
 * - The mint account is the source of truth: it must exist, be an SPL mint, and
 *   have the expected decimals.
 * - Config and pool creation are idempotent: an already-existing config or pool
 *   is adopted, never recreated.
 * - Before each submit, an intermediate checkpoint (`config_submitting` /
 *   `pool_submitting`) is persisted so a crash mid-submit is recoverable.
 * - An ambiguous confirmation is never treated as failure.
 */
export function resumeLaunch(input: ResumeLaunchInput, payer: Keypair): Promise<DeploymentResult> {
  const rpcUrl = input.rpcUrl ?? input.checkpoint.rpcUrl ?? "https://api.devnet.solana.com";
  const { connection, client } = createMeteoraClient(rpcUrl);
  return resumeLaunchImpl(
    connection as unknown as ResumeConnection,
    client as unknown as ResumeMeteoraClient,
    input,
    payer,
  );
}

export async function resumeLaunchImpl(
  connection: ResumeConnection,
  client: ResumeMeteoraClient,
  input: ResumeLaunchInput,
  payer: Keypair,
): Promise<DeploymentResult> {
  const checkpoint = input.checkpoint;

  if (checkpoint.launchId !== input.launchId)
    throw new ResumeError(
      `Checkpoint launch id ${checkpoint.launchId} does not match requested ${input.launchId}.`,
    );

  const rpcUrl = input.rpcUrl ?? checkpoint.rpcUrl;
  const network: "devnet" | "mainnet" = rpcUrl.includes("devnet") ? "devnet" : "mainnet";
  if (network !== checkpoint.network)
    throw new ResumeError(
      `Refusing to resume: checkpoint is for ${checkpoint.network} but the RPC url points at ` +
        `${network} (${rpcUrl}).`,
    );
  if (input.strategyId !== checkpoint.strategyId)
    throw new ResumeError(
      `Refusing to resume: checkpoint strategy ${checkpoint.strategyId} does not match ` +
        `${input.strategyId}.`,
    );

  // Never submit an invalid config; createConfig happens after a mint already
  // exists, so a bad config would leave an orphaned config behind.
  assertDeployableConfig(input.configParameters);

  const quoteMint = new PublicKey(input.quoteMint ?? DEFAULT_QUOTE_MINT);
  const baseMint = new PublicKey(checkpoint.baseMint);

  // The base mint is the anchor: it must exist on-chain. Resume never mints.
  const mint = await readMint(connection, baseMint, checkpoint);
  if (!mint.exists) {
    if (checkpoint.phase === "mint_submitting") {
      const rec = await reconcileMintSubmission(connection, {
        baseMint: checkpoint.baseMint,
        signature: checkpoint.transactionSignatures.at(-1) ?? null,
        lastValidBlockHeight: checkpoint.lastValidBlockHeight ?? null,
      });
      if (rec.safeToMintNew)
        throw new ResumeError(
          `The base mint ${checkpoint.baseMint} was never created on-chain (${rec.reason}). ` +
            "A resume cannot create a mint; start a fresh launch with a new LAUNCH_ID.",
        );
      throw new ResumeError(
        `The base mint ${checkpoint.baseMint} outcome is still inconclusive (${rec.reason}). ` +
          "Refusing to resume until it can be determined.",
      );
    }
    throw new ResumeError(
      `Checkpoint records base mint ${checkpoint.baseMint} but no mint account exists on-chain. ` +
        "Refusing to resume: the checkpoint and the chain disagree.",
    );
  }
  if (mint.decimals !== input.asset.decimals)
    throw new ResumeError(
      `Base mint ${checkpoint.baseMint} has ${mint.decimals} decimals but the launch expects ` +
        `${input.asset.decimals}. Refusing to resume.`,
    );

  const signatures = [...checkpoint.transactionSignatures];
  let configAddress = checkpoint.configAddress ? new PublicKey(checkpoint.configAddress) : undefined;
  let poolAddress = checkpoint.poolAddress ? new PublicKey(checkpoint.poolAddress) : undefined;
  const poolFromCheckpoint = Boolean(poolAddress);

  const checkpointHook = (fields: {
    phase: DeploymentPhase;
    configAddress?: PublicKey | undefined;
    poolAddress?: PublicKey | undefined;
  }) =>
    input.onCheckpoint?.({
      launchId: input.launchId,
      strategyId: input.strategyId,
      network,
      rpcUrl,
      baseMint: baseMint.toBase58(),
      configAddress: (fields.configAddress ?? configAddress)?.toBase58() ?? null,
      poolAddress: (fields.poolAddress ?? poolAddress)?.toBase58() ?? null,
      transactionSignatures: [...signatures],
      phase: fields.phase,
      lastValidBlockHeight: checkpoint.lastValidBlockHeight ?? null,
      updatedAt: new Date().toISOString(),
    });

  // If neither a config nor a pool was ever recorded, the pool cannot exist on
  // chain, so the deployer must still own the mint to create one.
  if (!configAddress && !poolAddress && mint.mintAuthority !== payer.publicKey.toBase58())
    throw new ResumeError(
      `Base mint ${baseMint.toBase58()} authority is ${mint.mintAuthority ?? "none"}, not the ` +
        `deployer ${payer.publicKey.toBase58()}. Refusing to resume.`,
    );

  try {
    // --- DBC config (idempotent) ---
    if (configAddress) {
      const existing = await readPoolConfig(client, configAddress);
      if (!existing)
        throw new ResumeError(
          `Checkpoint records DBC config ${configAddress.toBase58()} but it does not exist ` +
            "on-chain. Refusing to resume.",
        );
      const existingQuote = stringOf(asRecord(existing)["quoteMint"]);
      if (existingQuote && existingQuote !== quoteMint.toBase58())
        throw new ResumeError(
          `Existing DBC config ${configAddress.toBase58()} uses quote mint ${existingQuote}, not ` +
            `${quoteMint.toBase58()}. Refusing to resume.`,
        );
    } else {
      const configKeypair = Keypair.generate();
      const createConfigTx = await client.partner.createConfig({
        config: configKeypair.publicKey,
        feeClaimer: payer.publicKey,
        leftoverReceiver: payer.publicKey,
        quoteMint,
        payer: payer.publicKey,
        ...(input.configParameters as ConfigParameters),
      });
      configAddress = configKeypair.publicKey;
      // Persist the config address BEFORE submitting: once submitted, a retry
      // must adopt this config instead of creating another.
      await checkpointHook({ phase: "config_submitting", configAddress });
      const configSignature = await submitTransaction(
        connection as unknown as Connection,
        createConfigTx,
        [payer, configKeypair],
        "createConfig",
      );
      signatures.push(configSignature);
      log("info", "DBC config submitted (resume)", {
        launchId: input.launchId,
        configAddress: configAddress.toBase58(),
      });
      await checkpointHook({ phase: "config_created", configAddress });
      await confirmConservative(connection, configSignature, "createConfig");
    }

    // --- DBC pool (idempotent; address is deterministic) ---
    if (!poolAddress) poolAddress = deriveDbcPoolAddress(quoteMint, baseMint, configAddress!);
    let poolExists = await readPoolExists(client, poolAddress);
    if (!poolExists && !poolFromCheckpoint) {
      const byBaseMint = await readPoolByBaseMint(client, baseMint);
      if (byBaseMint) {
        poolAddress = byBaseMint;
        poolExists = true;
      }
    }

    if (poolExists) {
      await checkpointHook({ phase: "pool_created", configAddress, poolAddress });
    } else if (poolFromCheckpoint) {
      // A createPool was already submitted but the pool is not visible yet.
      throw new ResumeError(
        `A pool creation for ${poolAddress.toBase58()} was already submitted but no pool account ` +
          "exists on-chain yet. Refusing to submit another: the prior transaction may still land. " +
          "Re-run resume once it confirms (or its blockhash expires).",
      );
    } else {
      if (mint.mintAuthority !== payer.publicKey.toBase58())
        throw new ResumeError(
          `Base mint ${baseMint.toBase58()} authority is ${mint.mintAuthority ?? "none"}, not the ` +
            `deployer ${payer.publicKey.toBase58()}. Refusing to create the DBC pool.`,
        );
      const createPoolTx = await client.creator.createPool({
        name: input.name,
        symbol: input.symbol,
        uri: input.uri ?? "",
        payer: payer.publicKey,
        poolCreator: payer.publicKey,
        config: configAddress!,
        baseMint,
      });
      await checkpointHook({ phase: "pool_submitting", configAddress, poolAddress });
      const poolSignature = await submitTransaction(
        connection as unknown as Connection,
        createPoolTx,
        [payer],
        "createPool",
      );
      signatures.push(poolSignature);
      log("info", "DBC pool submitted (resume)", {
        launchId: input.launchId,
        poolAddress: poolAddress.toBase58(),
      });
      await confirmConservative(connection, poolSignature, "createPool");
      await checkpointHook({ phase: "pool_created", configAddress, poolAddress });
    }
  } catch (err) {
    // A checkpoint failure or a deliberate refusal must surface unchanged.
    if (err instanceof CheckpointError || err instanceof ResumeError) throw err;
    throw new PartialDeploymentError({
      launchId: input.launchId,
      baseMint: baseMint.toBase58(),
      configAddress: configAddress?.toBase58() ?? null,
      poolAddress: poolAddress?.toBase58() ?? null,
      transactionSignatures: signatures,
      message:
        `Resume of ${input.launchId} did not finish (${messageOf(err)}). The base mint ` +
        `${baseMint.toBase58()} still exists; do not create another.`,
      recovery:
        `Re-run the resume command with the same LAUNCH_ID (${input.launchId}). Resume re-checks ` +
        "on-chain state, adopts any existing config/pool, and never creates a second base mint.",
    });
  }

  const result: DeploymentResult = {
    launchId: input.launchId,
    strategyId: input.strategyId,
    dataSource: network,
    network,
    rpcUrl,
    configAddress: configAddress!.toBase58(),
    poolAddress: poolAddress!.toBase58(),
    baseMint: baseMint.toBase58(),
    transactionSignatures: signatures,
    transactionState: "confirmed",
    deployedAt: new Date().toISOString(),
  };
  log("info", "Launch resumed", {
    launchId: result.launchId,
    strategyId: result.strategyId,
    configAddress: result.configAddress,
    poolAddress: result.poolAddress,
  });
  return result;
}

interface MintState {
  exists: boolean;
  decimals: number;
  mintAuthority: string | null;
}

async function readMint(
  connection: ResumeConnection,
  baseMint: PublicKey,
  checkpoint: DeploymentCheckpoint,
): Promise<MintState> {
  let info;
  try {
    info = await connection.getParsedAccountInfo(baseMint, "confirmed");
  } catch (err) {
    throw new ResumeError(
      `Failed to read base mint ${checkpoint.baseMint}: ${messageOf(err)}. Refusing to resume.`,
    );
  }
  const value = info.value;
  if (!value) return { exists: false, decimals: Number.NaN, mintAuthority: null };
  if (!value.owner.equals(TOKEN_PROGRAM_ID))
    throw new ResumeError(
      `Account ${checkpoint.baseMint} exists but is not an SPL mint ` +
        `(owner ${value.owner.toBase58()}). Refusing to resume.`,
    );
  const parsed = parseMintAccount(value.data);
  if (!parsed)
    throw new ResumeError(
      `Could not parse base mint ${checkpoint.baseMint} as an SPL mint. Refusing to resume.`,
    );
  return { exists: true, decimals: parsed.decimals, mintAuthority: parsed.mintAuthority };
}

function parseMintAccount(data: unknown): { decimals: number; mintAuthority: string | null } | null {
  const rec = asRecord(data);
  const parsed = asRecord(rec["parsed"]);
  const info = asRecord(parsed["info"]);
  const decimals = info["decimals"];
  if (typeof decimals !== "number") return null;
  const authority = stringOf(info["mintAuthority"]);
  return { decimals, mintAuthority: authority.length > 0 ? authority : null };
}

async function readPoolConfig(
  client: ResumeMeteoraClient,
  address: PublicKey,
): Promise<unknown | null> {
  try {
    return await client.state.getPoolConfig(address);
  } catch (err) {
    throw new ResumeError(
      `Failed to read DBC config ${address.toBase58()}: ${messageOf(err)}. Refusing to resume.`,
    );
  }
}

async function readPoolExists(
  client: ResumeMeteoraClient,
  address: PublicKey,
): Promise<boolean> {
  try {
    return (await client.state.getPool(address)) !== null;
  } catch (err) {
    throw new ResumeError(
      `Failed to read DBC pool ${address.toBase58()}: ${messageOf(err)}. Refusing to resume.`,
    );
  }
}

async function readPoolByBaseMint(
  client: ResumeMeteoraClient,
  baseMint: PublicKey,
): Promise<PublicKey | null> {
  let account: unknown | null;
  try {
    account = await client.state.getPoolByBaseMint(baseMint);
  } catch (err) {
    throw new ResumeError(
      `Failed to look up a DBC pool by base mint ${baseMint.toBase58()}: ${messageOf(err)}. ` +
        "Refusing to resume.",
    );
  }
  if (!account) return null;
  const publicKey = asRecord(account)["publicKey"];
  if (publicKey instanceof PublicKey) return publicKey;
  const asString = stringOf(publicKey);
  return asString.length > 0 ? new PublicKey(asString) : null;
}

/**
 * Confirm a submitted transaction, but never treat an ambiguous outcome as
 * failure. Only a positive on-chain error fails the transaction; a timeout is
 * re-checked against the signature status and, if still unknown, refuses.
 */
async function confirmConservative(
  connection: ResumeConnection,
  signature: string,
  label: string,
): Promise<void> {
  try {
    const latest = await connection.getLatestBlockhash("confirmed");
    const confirmation = await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    if (confirmation.value.err)
      throw new TransactionError(
        `${label} transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
        { signature },
      );
    return;
  } catch (err) {
    if (err instanceof TransactionError) throw err;
    const status = await signatureStatus(connection, signature);
    if (status === "confirmed") return;
    if (status === "failed")
      throw new TransactionError(`${label} transaction failed on-chain.`, { signature });
    throw new ResumeError(
      `Could not confirm the ${label} transaction (${signature}); its outcome is inconclusive. ` +
        "Refusing to submit more transactions. Re-run resume later: it re-checks on-chain state.",
    );
  }
}

async function signatureStatus(
  connection: ResumeConnection,
  signature: string,
): Promise<"confirmed" | "failed" | "pending" | "unknown"> {
  try {
    const res = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = res.value[0];
    if (!status) return "pending";
    if (status.err) return "failed";
    if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")
      return "confirmed";
    return "pending";
  } catch {
    return "unknown";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toBase58" in value)
    return (value as { toBase58(): string }).toBase58();
  return "";
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
