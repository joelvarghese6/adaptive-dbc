import type { Connection, Keypair, Transaction } from "@solana/web3.js";
import { RpcError, TransactionError } from "@adaptive/shared";

/**
 * Submit a signed transaction and return its signature without waiting for
 * confirmation. Use this when the signature must be captured before the
 * transaction is confirmed (e.g. to checkpoint an in-progress deployment).
 */
export async function submitTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  label: string,
): Promise<string> {
  try {
    return await connection.sendTransaction(transaction, signers, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (err) {
    throw new TransactionError(`Failed to submit ${label} transaction: ${messageOf(err)}`);
  }
}

/** Wait for a previously submitted transaction to confirm. Normalizes errors. */
export async function confirmTransaction(
  connection: Connection,
  signature: string,
  label: string,
): Promise<void> {
  try {
    const latest = await connection.getLatestBlockhash("confirmed");
    const confirmation = await connection.confirmTransaction(
      { signature, ...latest },
      "confirmed",
    );
    if (confirmation.value.err)
      throw new TransactionError(
        `${label} transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
        { signature },
      );
  } catch (err) {
    if (err instanceof TransactionError) throw err;
    throw new RpcError(`Failed to confirm ${label} transaction: ${messageOf(err)}`, {
      signature,
    });
  }
}

/** Send a signed transaction and wait for confirmation. Normalizes errors. */
export async function sendAndConfirm(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  label: string,
): Promise<string> {
  const signature = await submitTransaction(connection, transaction, signers, label);
  await confirmTransaction(connection, signature, label);
  return signature;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
