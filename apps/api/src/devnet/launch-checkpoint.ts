import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DeploymentCheckpoint, DeploymentPhase } from "@adaptive/meteora";
import { CheckpointError } from "@adaptive/shared";
import { writeFileAtomicSync } from "../atomic-file.js";

/** Default directory for durable launch checkpoints (git-ignored under the cwd). */
export const DEFAULT_STATE_DIR = ".devnet-launches";

const PHASES: readonly DeploymentPhase[] = [
  "mint_submitting",
  "mint_created",
  "config_submitting",
  "config_created",
  "pool_submitting",
  "pool_created",
];

/** Filesystem path of the checkpoint for a launch id (sanitized for the fs). */
export function checkpointFile(stateDir: string, launchId: string): string {
  return join(stateDir, `${launchId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
}

/**
 * Read a checkpoint. Returns null only when there is genuinely no checkpoint.
 * A corrupt or malformed file throws `CheckpointError` instead of returning
 * null: treating it as absent would allow a second base mint to be created.
 */
export function readCheckpoint(stateDir: string, launchId: string): DeploymentCheckpoint | null {
  const file = checkpointFile(stateDir, launchId);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new CheckpointError(
      `Unable to read launch checkpoint ${file}: ${messageOf(err)}. Refusing to continue.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw corrupt(launchId, file);
  }
  return validateCheckpoint(parsed, launchId, file);
}

/** Atomically persist a checkpoint, replacing any previous file. */
export function writeCheckpoint(stateDir: string, checkpoint: DeploymentCheckpoint): string {
  const file = checkpointFile(stateDir, checkpoint.launchId);
  writeFileAtomicSync(file, `${JSON.stringify(checkpoint, null, 2)}\n`, "launch checkpoint");
  return file;
}

function validateCheckpoint(
  value: unknown,
  launchId: string,
  file: string,
): DeploymentCheckpoint {
  if (!value || typeof value !== "object") throw corrupt(launchId, file);
  const cp = value as Partial<DeploymentCheckpoint>;
  if (typeof cp.launchId !== "string" || cp.launchId.length === 0) throw corrupt(launchId, file);
  if (typeof cp.baseMint !== "string" || cp.baseMint.length === 0) throw corrupt(launchId, file);
  if (typeof cp.phase !== "string" || !PHASES.includes(cp.phase as DeploymentPhase))
    throw corrupt(launchId, file);
  if (!Array.isArray(cp.transactionSignatures)) throw corrupt(launchId, file);
  return cp as DeploymentCheckpoint;
}

function corrupt(launchId: string, file: string): CheckpointError {
  return new CheckpointError(
    `Launch checkpoint ${file} for ${launchId} is corrupt or malformed. ` +
      "Refusing to treat it as absent (that would allow creating a second base mint). " +
      "Inspect the file and verify on-chain state before deleting it.",
  );
}

/**
 * If a base mint is already recorded for this launch id, return an actionable
 * recovery message; otherwise null. Retrying must never silently mint again.
 */
export function existingMintRecovery(checkpoint: DeploymentCheckpoint | null): string | null {
  if (!checkpoint?.baseMint) return null;

  if (checkpoint.phase === "mint_submitting") {
    return (
      `Launch ${checkpoint.launchId} has a base-mint submission in progress for ${checkpoint.baseMint} ` +
      "whose on-chain outcome is unconfirmed. Refusing to create another mint. Reconcile the " +
      'submission (signature status / mint account) before retrying; treat a timeout or "not found" ' +
      "as inconclusive until the blockhash expires. To start over with no mint, delete the checkpoint " +
      "file only after verifying no mint account exists on-chain."
    );
  }

  const completed = checkpoint.phase === "pool_created";
  return (
    `Launch ${checkpoint.launchId} already created base mint ${checkpoint.baseMint}` +
    (completed ? " and completed the DBC pool." : ` (deployment phase: ${checkpoint.phase}).`) +
    " Refusing to create another mint. " +
    (completed
      ? "It is already complete; no further action is needed. "
      : `Resume it with: LAUNCH_ID=${checkpoint.launchId} pnpm --filter @adaptive/api devnet:resume. `) +
    "To start over instead, delete the checkpoint file or rerun with a new LAUNCH_ID."
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
