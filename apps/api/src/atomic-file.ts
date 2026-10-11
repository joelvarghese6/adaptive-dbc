import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { CheckpointError } from "@adaptive/shared";

/**
 * Atomically write `data` to `file`: write to a sibling temp file, fsync it,
 * then rename over the destination. A crash can never leave a half-written
 * destination file — it is either the old contents or the complete new ones.
 */
export function writeFileAtomicSync(file: string, data: string, label: string): void {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(tmp, "w");
    writeSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, file);
  } catch (err) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore cleanup failure */
      }
    }
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* ignore cleanup failure */
    }
    throw new CheckpointError(`Failed to write ${label} (${file}): ${messageOf(err)}`);
  }
  // Best-effort directory fsync so the rename itself survives power loss.
  try {
    const dirFd = openSync(dir, "r");
    fsyncSync(dirFd);
    closeSync(dirFd);
  } catch {
    /* directory fsync is not supported on every platform/filesystem */
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
