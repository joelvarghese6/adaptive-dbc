import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyzeLaunch,
  createLaunch,
  deployLaunchById,
  getLaunchStatus,
  simulateLaunch,
} from "./services/index.js";
import {
  clearLaunchRecords,
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
};

describe("api orchestration", () => {
  it("creates, analyzes, and simulates a launch", () => {
    clearLaunchRecords();
    const created = createLaunch(asset);
    assert.equal(created.status, "draft");

    const analyzed = analyzeLaunch(created.id);
    assert.equal(analyzed.status, "analyzed");
    assert.equal(analyzed.strategy?.strategyId, "RWA_LONG_V1");

    const simulated = simulateLaunch(created.id);
    assert.equal(simulated.status, "simulated");
    assert.equal(simulated.simulation?.dataSource, "simulation");
  });

  it("validates asset input", () => {
    clearLaunchRecords();
    assert.throws(() => createLaunch({ ...asset, name: "" }), /name/);
    assert.throws(() => createLaunch({ ...asset, decimals: 5 }), /decimals/);
  });

  it("returns status for unknown pools without chain access", async () => {
    clearLaunchRecords();
    const created = createLaunch(asset);
    const status = await getLaunchStatus(created.id);
    assert.equal(status.id, created.id);
  });

  it("fails deploy cleanly without a wallet key", async () => {
    clearLaunchRecords();
    const saved = process.env["SOLANA_PRIVATE_KEY"];
    delete process.env["SOLANA_PRIVATE_KEY"];
    try {
      const created = createLaunch(asset);
      await assert.rejects(() => deployLaunchById(created.id), /SOLANA_PRIVATE_KEY/);
    } finally {
      if (saved !== undefined) process.env["SOLANA_PRIVATE_KEY"] = saved;
    }
  });

  it("refuses to re-deploy a launch that already has a base mint", async () => {
    clearLaunchRecords();
    const created = createLaunch(asset);
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
    await assert.rejects(
      () => deployLaunchById(created.id),
      /already has a base mint/,
    );
  });

  it("refuses to re-deploy after a simulated restart restores the mint record", async () => {
    clearLaunchRecords();
    const dir = mkdtempSync(join(tmpdir(), "adaptive-api-store-"));
    const file = join(dir, "launches.json");
    try {
      const created = createLaunch(asset);
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
      resetHydrationForTests();
      hydrateLaunchRecords(file);

      await assert.rejects(
        () => deployLaunchById(created.id),
        /already has a base mint/,
      );
    } finally {
      clearLaunchRecords();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
