import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointError } from "@adaptive/shared";
import {
  clearLaunchRecords,
  createLaunchRecord,
  getLaunchRecord,
  hydrateLaunchRecords,
  persistLaunchRecords,
  resetHydrationForTests,
  updateLaunchRecord,
} from "./store.js";

const asset = {
  name: "Adaptive Real Estate",
  symbol: "ARE",
  assetType: "RWA",
  totalSupply: 1_000_000_000,
  decimals: 9,
  referencePrice: 0.001,
} as const;

describe("launch store durability", () => {
  it("restores an existing base mint after a simulated restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "adaptive-store-"));
    const file = join(dir, "launches.json");
    try {
      clearLaunchRecords();
      const created = createLaunchRecord(asset);
      updateLaunchRecord(created.id, {
        status: "partially_deployed",
        deployment: {
          launchId: created.id,
          strategyId: "RWA_LONG_V1",
          dataSource: "devnet",
          network: "devnet",
          rpcUrl: "https://api.devnet.solana.com",
          configAddress: "",
          poolAddress: "",
          baseMint: "So11111111111111111111111111111111111111112",
          transactionSignatures: [],
          transactionState: "failed",
          deployedAt: new Date().toISOString(),
        },
      });
      persistLaunchRecords(file);

      clearLaunchRecords();
      assert.equal(getLaunchRecord(created.id), null);

      resetHydrationForTests();
      const loaded = hydrateLaunchRecords(file);
      assert.equal(loaded, 1);
      assert.equal(
        getLaunchRecord(created.id)?.deployment?.baseMint,
        "So11111111111111111111111111111111111111112",
      );
    } finally {
      clearLaunchRecords();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes the store atomically, leaving no temp files", () => {
    const dir = mkdtempSync(join(tmpdir(), "adaptive-store-atomic-"));
    try {
      clearLaunchRecords();
      createLaunchRecord(asset);
      const file = join(dir, "launches.json");
      persistLaunchRecords(file);
      assert.deepEqual(
        readdirSync(dir).filter((f) => f.includes(".tmp")),
        [],
      );
    } finally {
      clearLaunchRecords();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails safe on a corrupt store instead of starting empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "adaptive-store-corrupt-"));
    try {
      const file = join(dir, "launches.json");
      writeFileSync(file, "{ not json");
      assert.throws(() => hydrateLaunchRecords(file), CheckpointError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats a missing store file as an empty store", () => {
    const dir = mkdtempSync(join(tmpdir(), "adaptive-store-empty-"));
    try {
      assert.equal(hydrateLaunchRecords(join(dir, "launches.json")), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});