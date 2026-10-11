import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointError } from "@adaptive/shared";
import type { DeploymentCheckpoint } from "@adaptive/meteora";
import {
  checkpointFile,
  existingMintRecovery,
  readCheckpoint,
  writeCheckpoint,
} from "./launch-checkpoint.js";

const dir = mkdtempSync(join(tmpdir(), "adaptive-checkpoints-"));
after(() => rmSync(dir, { recursive: true, force: true }));

function makeCheckpoint(overrides: Partial<DeploymentCheckpoint> = {}): DeploymentCheckpoint {
  return {
    launchId: "devnet-123",
    strategyId: "RWA_LONG_V1",
    network: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    baseMint: "So11111111111111111111111111111111111111112",
    configAddress: null,
    poolAddress: null,
    transactionSignatures: [],
    phase: "mint_created",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("devnet launch checkpoint", () => {
  it("round-trips a checkpoint through disk", () => {
    const cp = makeCheckpoint();
    const file = writeCheckpoint(dir, cp);
    assert.equal(file, checkpointFile(dir, cp.launchId));
    assert.deepEqual(readCheckpoint(dir, cp.launchId), cp);
  });

  it("returns null for an unknown launch id", () => {
    assert.equal(readCheckpoint(dir, "does-not-exist"), null);
  });

  it("sanitizes launch ids used as file names", () => {
    const file = checkpointFile(dir, "devnet/../weird id");
    assert.ok(!file.includes(" "));
    assert.ok(file.endsWith(".json"));
  });

  it("has no recovery message when there is no existing mint", () => {
    assert.equal(existingMintRecovery(null), null);
    assert.equal(existingMintRecovery(makeCheckpoint({ baseMint: "" })), null);
  });

  it("refuses to re-mint and explains how to recover an existing mint", () => {
    const recovery = existingMintRecovery(makeCheckpoint());
    assert.ok(recovery);
    assert.match(recovery, /already created base mint/);
    assert.match(recovery, /Refusing to create another mint/);
    assert.match(recovery, /new LAUNCH_ID/);
  });

  it("notes when the on-chain pool already completed", () => {
    const recovery = existingMintRecovery(makeCheckpoint({ phase: "pool_created" }));
    assert.match(recovery ?? "", /completed the DBC pool/);
  });

  it("refuses to re-mint while a submission outcome is unconfirmed", () => {
    const recovery = existingMintRecovery(makeCheckpoint({ phase: "mint_submitting" }));
    assert.ok(recovery);
    assert.match(recovery, /submission in progress/);
    assert.match(recovery, /Refusing to create another mint/);
    assert.match(recovery, /blockhash expires/);
  });

  it("writes atomically and leaves no temp files behind", () => {
    const tmp = mkdtempSync(join(tmpdir(), "adaptive-atomic-"));
    try {
      const cp = makeCheckpoint({ launchId: "atomic" });
      const file = writeCheckpoint(tmp, cp);
      assert.ok(existsSync(file));
      assert.deepEqual(readCheckpoint(tmp, "atomic"), cp);
      assert.deepEqual(
        readdirSync(tmp).filter((f) => f.includes(".tmp")),
        [],
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws instead of returning null for a corrupt checkpoint", () => {
    const tmp = mkdtempSync(join(tmpdir(), "adaptive-corrupt-"));
    try {
      writeFileSync(join(tmp, "bad.json"), "{ this is not json");
      assert.throws(() => readCheckpoint(tmp, "bad"), CheckpointError);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws for a malformed checkpoint shape", () => {
    const tmp = mkdtempSync(join(tmpdir(), "adaptive-shape-"));
    try {
      writeFileSync(
        join(tmp, "shape.json"),
        JSON.stringify({ launchId: "shape" }),
      );
      assert.throws(() => readCheckpoint(tmp, "shape"), CheckpointError);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
