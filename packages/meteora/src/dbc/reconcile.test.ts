import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  reconcileMintSubmission,
  type ReconcileConnection,
} from "./reconcile.js";

const MINT = "So11111111111111111111111111111111111111112";

type FakeStatus = {
  err: object | null;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
} | null;

function fakeConnection(opts: {
  statuses?: FakeStatus;
  account?: { owner: PublicKey } | null;
  blockHeight?: number;
  throwStatuses?: boolean;
  throwAccount?: boolean;
  statusesResult?: (FakeStatus | null)[] | null;
}): ReconcileConnection {
  return {
    getSignatureStatuses: async () => {
      if (opts.throwStatuses) throw new Error("rpc down");
      return { context: { slot: 1 }, value: opts.statusesResult ?? [opts.statuses ?? null] };
    },
    getAccountInfo: async () => {
      if (opts.throwAccount) throw new Error("rpc down");
      return opts.account ?? null;
    },
    getBlockHeight: async () => opts.blockHeight ?? 0,
  } as unknown as ReconcileConnection;
}

const mintAccount = { owner: TOKEN_PROGRAM_ID };

describe("reconcileMintSubmission", () => {
  it("never mints new when the mint account already exists", async () => {
    const r = await reconcileMintSubmission(
      fakeConnection({ account: mintAccount, statuses: { err: null, confirmationStatus: "confirmed" } }),
      { baseMint: MINT, signature: "sig1" },
    );
    assert.equal(r.mintExists, true);
    assert.equal(r.safeToMintNew, false);
  });

  it("allows a new mint when the submission failed and no account exists", async () => {
    const r = await reconcileMintSubmission(
      fakeConnection({ statuses: { err: { InstructionError: [] }, confirmationStatus: "confirmed" } }),
      { baseMint: MINT, signature: "sig1" },
    );
    assert.equal(r.submission, "failed");
    assert.equal(r.mintExists, false);
    assert.equal(r.safeToMintNew, true);
  });

  it("allows a new mint once the blockhash expired with the account still absent", async () => {
    const r = await reconcileMintSubmission(
      fakeConnection({ blockHeight: 1_000_001 }),
      { baseMint: MINT, lastValidBlockHeight: 1_000_000 },
    );
    assert.equal(r.submission, null);
    assert.equal(r.mintExists, false);
    assert.equal(r.safeToMintNew, true);
  });

  it("refuses while the blockhash is still valid and no account is found", async () => {
    const r = await reconcileMintSubmission(
      fakeConnection({
        blockHeight: 1_000_000,
        statusesResult: [{ err: null, confirmationStatus: "processed" }],
      }),
      {
        baseMint: MINT,
        signature: "sig1",
        lastValidBlockHeight: 1_000_000,
      },
    );
    assert.equal(r.submission, "pending");
    assert.equal(r.safeToMintNew, false);
    assert.match(r.reason, /inconclusive/);
  });

  it("treats a submission with no signature/expiry anchor as inconclusive", async () => {
    const r = await reconcileMintSubmission(fakeConnection({}), { baseMint: MINT });
    assert.equal(r.mintExists, false);
    assert.equal(r.safeToMintNew, false);
  });

  it("treats an RPC error on the account lookup as unknowable", async () => {
    const r = await reconcileMintSubmission(
      fakeConnection({ throwAccount: true }),
      { baseMint: MINT, signature: "sig1" },
    );
    assert.equal(r.mintExists, null);
    assert.equal(r.safeToMintNew, false);
    assert.match(r.reason, /Refusing/);
  });

  it("treats only confirmed/finalized as confirmed", async () => {
    const finalized = await reconcileMintSubmission(
      fakeConnection({ statuses: { err: null, confirmationStatus: "finalized" } }),
      { baseMint: MINT, signature: "sig1" },
    );
    assert.equal(finalized.submission, "confirmed");
  });
});