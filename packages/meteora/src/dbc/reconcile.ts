import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, type Connection } from "@solana/web3.js";

/** The minimal RPC surface reconciliation needs; keeps the function easy to fake in tests. */
export type ReconcileConnection = Pick<
  Connection,
  "getSignatureStatuses" | "getAccountInfo" | "getBlockHeight"
>;

export type SubmissionStatus = "confirmed" | "failed" | "pending" | "unknown";

export interface MintReconciliationInput {
  /** The base mint address whose existence we are deciding. */
  baseMint: string;
  /** The mint transaction signature, if the submission ever returned one. */
  signature?: string | null;
  /** `lastValidBlockHeight` of the submission blockhash, if known. */
  lastValidBlockHeight?: number | null;
}

export interface MintReconciliation {
  /** Status of the known submission signature, or null when there is none. */
  submission: SubmissionStatus | null;
  /** Whether an SPL mint account exists at `baseMint`; null = could not determine. */
  mintExists: boolean | null;
  /** True only with positive evidence that no mint was (or can still be) created. */
  safeToMintNew: boolean;
  reason: string;
}

/**
 * Decide whether a previously-attempted base-mint creation left an on-chain mint.
 *
 * Safety rule: this is deliberately conservative. `safeToMintNew` is true only
 * with positive evidence (a failed submission, or no account after the blockhash
 * expired). A timeout, a "not found" status, or an RPC error is *inconclusive*:
 * it never proves the transaction failed, so it must not authorise a new mint.
 */
export async function reconcileMintSubmission(
  connection: ReconcileConnection,
  input: MintReconciliationInput,
): Promise<MintReconciliation> {
  const submission = input.signature
    ? await submissionStatus(connection, input.signature)
    : null;
  const mintExists = await mintAccountExists(connection, input.baseMint);

  if (mintExists === true) {
    return {
      submission,
      mintExists,
      safeToMintNew: false,
      reason: "A mint account already exists on-chain at this address.",
    };
  }
  if (submission === "confirmed") {
    return {
      submission,
      mintExists,
      safeToMintNew: false,
      reason: "The mint submission is confirmed on-chain.",
    };
  }
  if (submission === "failed") {
    return {
      submission,
      mintExists,
      safeToMintNew: true,
      reason: "The known submission failed on-chain and no mint account exists.",
    };
  }
  if (mintExists === false) {
    const expired = await blockhashExpired(connection, input.lastValidBlockHeight);
    if (expired)
      return {
        submission,
        mintExists,
        safeToMintNew: true,
        reason:
          "No mint account exists and any prior submission blockhash has expired, so no mint can land.",
      };
    return {
      submission,
      mintExists,
      safeToMintNew: false,
      reason:
        "No mint account yet, but the outcome is inconclusive: a prior submission may still land. " +
        "Wait for its blockhash to expire (compare getBlockHeight to lastValidBlockHeight) and re-check; " +
        "a timeout is not proof of failure.",
    };
  }
  return {
    submission,
    mintExists,
    safeToMintNew: false,
    reason:
      "Could not confirm on-chain state (RPC error or unknown account). Refusing to authorise a new mint.",
  };
}

async function submissionStatus(
  connection: ReconcileConnection,
  signature: string,
): Promise<SubmissionStatus> {
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

async function mintAccountExists(
  connection: ReconcileConnection,
  baseMint: string,
): Promise<boolean | null> {
  try {
    const info = await connection.getAccountInfo(new PublicKey(baseMint), "confirmed");
    if (!info) return false;
    return info.owner.equals(TOKEN_PROGRAM_ID);
  } catch {
    return null;
  }
}

async function blockhashExpired(
  connection: ReconcileConnection,
  lastValidBlockHeight: number | null | undefined,
): Promise<boolean> {
  if (lastValidBlockHeight === null || lastValidBlockHeight === undefined) return false;
  try {
    const height = await connection.getBlockHeight("confirmed");
    return height > lastValidBlockHeight;
  } catch {
    return false;
  }
}
