import type { Connection, Keypair, Transaction } from "@solana/web3.js";
import { RpcError, TransactionError } from "@adaptive/shared";

/** Send a signed transaction and wait for confirmation. Normalizes errors. */
export async function sendAndConfirm(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  label: string,
): Promise<string> {
  let signature: string;
  try {
    signature = await connection.sendTransaction(transaction, signers, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (err) {
    throw new TransactionError(`Failed to submit ${label} transaction: ${messageOf(err)}`);
  }
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
    return signature;
  } catch (err) {
    if (err instanceof TransactionError) throw err;
    throw new RpcError(`Failed to confirm ${label} transaction: ${messageOf(err)}`, {
      signature,
    });
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
