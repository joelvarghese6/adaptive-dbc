import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, Transaction } from "@solana/web3.js";
import { ResumeError } from "@adaptive/shared";
import { DEFAULT_QUOTE_MINT } from "./create-pool.js";
import {
  resumeLaunchImpl,
  type ResumeConnection,
  type ResumeMeteoraClient,
} from "./resume.js";
import type { DeploymentCheckpoint, ResumeLaunchInput } from "./types.js";

const BASE_MINT = Keypair.generate().publicKey;

type FakeStatus = {
  err: object | null;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
} | null;

function fakeConnection(
  opts: {
    mint?: { decimals: number; mintAuthority: string | null } | "missing";
    mintOwner?: typeof TOKEN_PROGRAM_ID;
    confirmErr?: unknown;
    signatureStatus?: FakeStatus;
  } = {},
): ResumeConnection & { sent: string[] } {
  const sent: string[] = [];
  const missing = opts.mint === "missing";
  const mint = opts.mint === "missing" || opts.mint === undefined
    ? { decimals: 9, mintAuthority: null }
    : opts.mint;
  return {
    sent,
    getParsedAccountInfo: async () => {
      if (missing) return { context: { slot: 1 }, value: null };
      return {
        context: { slot: 1 },
        value: {
          owner: opts.mintOwner ?? TOKEN_PROGRAM_ID,
          data: {
            parsed: {
              type: "mint",
              info: { decimals: mint.decimals, mintAuthority: mint.mintAuthority },
            },
          },
        },
      };
    },
    getAccountInfo: async () => null,
    getLatestBlockhash: async () => ({ blockhash: "BLK", lastValidBlockHeight: 1_000 }),
    sendTransaction: async () => {
      const sig = `SIG_${sent.length + 1}`;
      sent.push(sig);
      return sig;
    },
    confirmTransaction: async () => {
      if (opts.confirmErr) throw opts.confirmErr;
      return { context: { slot: 1 }, value: { err: null } };
    },
    getBlockHeight: async () => 500,
    getSignatureStatuses: async () => ({
      context: { slot: 1 },
      value: [opts.signatureStatus ?? null],
    }),
  } as unknown as ResumeConnection & { sent: string[] };
}

function fakeClient(
  opts: {
    poolConfig?: unknown | null;
    pool?: unknown | null;
    poolByBaseMint?: unknown | null;
  } = {},
): { client: ResumeMeteoraClient; calls: { createConfig: number; createPool: number } } {
  const calls = { createConfig: 0, createPool: 0 };
  const client = {
    state: {
      getPoolConfig: async () => opts.poolConfig ?? null,
      getPool: async () => opts.pool ?? null,
      getPoolByBaseMint: async () => opts.poolByBaseMint ?? null,
    },
    partner: {
      createConfig: async () => {
        calls.createConfig += 1;
        return new Transaction();
      },
    },
    creator: {
      createPool: async () => {
        calls.createPool += 1;
        return new Transaction();
      },
    },
  };
  return { client: client as unknown as ResumeMeteoraClient, calls };
}

function makeCheckpoint(overrides: Partial<DeploymentCheckpoint> = {}): DeploymentCheckpoint {
  return {
    launchId: "devnet-1791746931",
    strategyId: "RWA_LONG_V1",
    network: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    baseMint: BASE_MINT.toBase58(),
    configAddress: null,
    poolAddress: null,
    transactionSignatures: ["mint-sig"],
    phase: "mint_created",
    lastValidBlockHeight: 1_000,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeInput(
  checkpoint: Partial<DeploymentCheckpoint> = {},
  overrides: Partial<ResumeLaunchInput> = {},
): ResumeLaunchInput {
  return {
    launchId: "devnet-1791746931",
    strategyId: "RWA_LONG_V1",
    asset: {
      name: "Adaptive Real Estate",
      symbol: "ARE",
      assetType: "RWA",
      totalSupply: 1_000_000_000,
      decimals: 9,
    },
    name: "Adaptive Real Estate",
    symbol: "ARE",
    rpcUrl: "https://api.devnet.solana.com",
    configParameters: {
      migrationOption: 1,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    checkpoint: makeCheckpoint(checkpoint),
    ...overrides,
  };
}

describe("resumeLaunchImpl", () => {
  it("finishes config and pool from a mint_created checkpoint, preserving signatures", async () => {
    const payer = Keypair.generate();
    const { client, calls } = fakeClient();
    const connection = fakeConnection({
      mint: { decimals: 9, mintAuthority: payer.publicKey.toBase58() },
    });
    const phases: string[] = [];
    const input = makeInput({}, { onCheckpoint: (cp) => void phases.push(cp.phase) });

    const result = await resumeLaunchImpl(connection, client, input, payer);

    assert.equal(result.baseMint, BASE_MINT.toBase58());
    assert.equal(result.configAddress.length > 0, true);
    assert.equal(result.poolAddress.length > 0, true);
    assert.deepEqual(result.transactionSignatures, ["mint-sig", "SIG_1", "SIG_2"]);
    assert.equal(calls.createConfig, 1);
    assert.equal(calls.createPool, 1);
    assert.deepEqual(phases, [
      "config_submitting",
      "config_created",
      "pool_submitting",
      "pool_created",
    ]);
  });

  it("adopts an existing config and only creates the pool", async () => {
    const payer = Keypair.generate();
    const config = Keypair.generate().publicKey;
    const { client, calls } = fakeClient({ poolConfig: { quoteMint: DEFAULT_QUOTE_MINT } });
    const connection = fakeConnection({
      mint: { decimals: 9, mintAuthority: payer.publicKey.toBase58() },
    });
    const input = makeInput({ configAddress: config.toBase58() });

    const result = await resumeLaunchImpl(connection, client, input, payer);

    assert.equal(result.configAddress, config.toBase58());
    assert.equal(calls.createConfig, 0);
    assert.equal(calls.createPool, 1);
    assert.deepEqual(result.transactionSignatures, ["mint-sig", "SIG_1"]);
  });

  it("submits no transaction when the pool already exists", async () => {
    const payer = Keypair.generate();
    const config = Keypair.generate().publicKey;
    const pool = Keypair.generate().publicKey;
    const { client, calls } = fakeClient({
      poolConfig: { quoteMint: DEFAULT_QUOTE_MINT },
      pool: { config },
    });
    const connection = fakeConnection({
      mint: { decimals: 9, mintAuthority: payer.publicKey.toBase58() },
    });
    const phases: string[] = [];
    const input = makeInput(
      { configAddress: config.toBase58(), poolAddress: pool.toBase58() },
      { onCheckpoint: (cp) => void phases.push(cp.phase) },
    );

    const result = await resumeLaunchImpl(connection, client, input, payer);

    assert.equal(result.poolAddress, pool.toBase58());
    assert.equal(calls.createConfig, 0);
    assert.equal(calls.createPool, 0);
    assert.deepEqual(result.transactionSignatures, ["mint-sig"]);
    assert.deepEqual(phases, ["pool_created"]);
  });

  it("refuses when the recorded base mint does not exist on-chain", async () => {
    const payer = Keypair.generate();
    const { client } = fakeClient();
    const connection = fakeConnection({ mint: "missing" });
    await assert.rejects(
      () => resumeLaunchImpl(connection, client, makeInput(), payer),
      ResumeError,
    );
  });

  it("refuses when the mint authority is not the deployer", async () => {
    const payer = Keypair.generate();
    const other = Keypair.generate();
    const { client, calls } = fakeClient();
    const connection = fakeConnection({
      mint: { decimals: 9, mintAuthority: other.publicKey.toBase58() },
    });
    await assert.rejects(
      () => resumeLaunchImpl(connection, client, makeInput(), payer),
      (err: unknown) => err instanceof ResumeError && /authority/.test(err.message),
    );
    assert.equal(calls.createConfig, 0);
  });

  it("refuses to resume on a network mismatch", async () => {
    const payer = Keypair.generate();
    const { client } = fakeClient();
    const connection = fakeConnection({
      mint: { decimals: 9, mintAuthority: payer.publicKey.toBase58() },
    });
    const input = makeInput({}, { rpcUrl: "https://api.mainnet-beta.solana.com" });
    await assert.rejects(
      () => resumeLaunchImpl(connection, client, input, payer),
      (err: unknown) => err instanceof ResumeError && /devnet/.test(err.message),
    );
  });

  it("refuses when the checkpoint records a config that is not on-chain", async () => {
    const payer = Keypair.generate();
    const config = Keypair.generate().publicKey;
    const { client } = fakeClient({ poolConfig: null });
    const connection = fakeConnection({
      mint: { decimals: 9, mintAuthority: payer.publicKey.toBase58() },
    });
    await assert.rejects(
      () => resumeLaunchImpl(connection, client, makeInput({ configAddress: config.toBase58() }), payer),
      ResumeError,
    );
  });

  it("refuses when the phase says pool_created but no pool exists", async () => {
    const payer = Keypair.generate();
    const config = Keypair.generate().publicKey;
    const pool = Keypair.generate().publicKey;
    const { client } = fakeClient({ poolConfig: { quoteMint: DEFAULT_QUOTE_MINT }, pool: null });
    const connection = fakeConnection({
      mint: { decimals: 9, mintAuthority: payer.publicKey.toBase58() },
    });
    await assert.rejects(
      () =>
        resumeLaunchImpl(
          connection,
          client,
          makeInput({
            configAddress: config.toBase58(),
            poolAddress: pool.toBase58(),
            phase: "pool_created",
          }),
          payer,
        ),
      ResumeError,
    );
  });

  it("treats an inconclusive confirmation as a refusal, not a failure", async () => {
    const payer = Keypair.generate();
    const { client, calls } = fakeClient();
    const connection = fakeConnection({
      mint: { decimals: 9, mintAuthority: payer.publicKey.toBase58() },
      confirmErr: new Error("blockhash expired / rpc timeout"),
      signatureStatus: null,
    });
    await assert.rejects(
      () => resumeLaunchImpl(connection, client, makeInput(), payer),
      (err: unknown) => err instanceof ResumeError && /inconclusive/.test(err.message),
    );
    assert.equal(calls.createPool, 0);
  });

  it("refuses to resume a mint_submitting checkpoint whose mint never landed", async () => {
    const payer = Keypair.generate();
    const { client } = fakeClient();
    // No mint account; blockhash expired (height 500 > lastValidBlockHeight 100).
    const connection = fakeConnection({ mint: "missing" });
    await assert.rejects(
      () =>
        resumeLaunchImpl(
          connection,
          client,
          makeInput({ phase: "mint_submitting", lastValidBlockHeight: 100 }),
          payer,
        ),
      (err: unknown) => err instanceof ResumeError && /never created/.test(err.message),
    );
  });
});
