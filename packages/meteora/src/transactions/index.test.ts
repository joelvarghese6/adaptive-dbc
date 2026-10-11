import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Connection, Keypair, Transaction } from "@solana/web3.js";
import { TransactionError } from "@adaptive/shared";
import { confirmTransaction, sendAndConfirm, submitTransaction } from "./index.js";

const transaction = {} as Transaction;
const signers = [] as Keypair[];

describe("meteora transactions", () => {
  it("returns the signature from submitTransaction without confirming", async () => {
    let confirmed = false;
    const connection = {
      sendTransaction: async () => "MINT_SIG",
      getLatestBlockhash: async () => {
        confirmed = true;
        return {};
      },
      confirmTransaction: async () => {
        confirmed = true;
        return { value: { err: null } };
      },
    } as unknown as Connection;

    const signature = await submitTransaction(connection, transaction, signers, "createMint");

    assert.equal(signature, "MINT_SIG");
    assert.equal(confirmed, false, "signature must be available before confirmation");
  });

  it("submits before confirming in sendAndConfirm", async () => {
    const calls: string[] = [];
    const connection = {
      sendTransaction: async () => {
        calls.push("send");
        return "SIG";
      },
      getLatestBlockhash: async () => {
        calls.push("blockhash");
        return {};
      },
      confirmTransaction: async () => {
        calls.push("confirm");
        return { value: { err: null } };
      },
    } as unknown as Connection;

    const signature = await sendAndConfirm(connection, transaction, signers, "createConfig");

    assert.equal(signature, "SIG");
    assert.deepEqual(calls, ["send", "blockhash", "confirm"]);
  });

  it("surfaces a confirmed on-chain error", async () => {
    const connection = {
      getLatestBlockhash: async () => ({}),
      confirmTransaction: async () => ({
        value: { err: { InstructionError: [0, "Custom"] } },
      }),
    } as unknown as Connection;

    await assert.rejects(
      () => confirmTransaction(connection, "SIG", "createMint"),
      TransactionError,
    );
  });
});
