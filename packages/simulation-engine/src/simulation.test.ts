import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { runSimulation } from "./runner/index.js";

const asset: AssetProfile = {
  name: "T",
  symbol: "T",
  assetType: "RWA",
  totalSupply: 1_000_000_000,
  decimals: 9,
  referencePrice: 0.001,
};

const strategy: StrategyRecommendation = {
  strategyId: "RWA_LONG_V1",
  strategyName: "RWA Long",
  confidence: 0.91,
  reasoning: [],
  parameters: {
    initialMarketCap: 1_000_000,
    migrationMarketCap: 1_250_000,
    baseFeeBps: 100,
    dynamicFeeEnabled: true,
  },
};

describe("simulation-engine", () => {
  it("is deterministic for the same input", () => {
    const a = runSimulation({ launchId: "l1", asset, strategy });
    const b = runSimulation({ launchId: "l1", asset: { ...asset }, strategy });
    assert.deepEqual(a, b);
  });

  it("labels output as simulation with a price path", () => {
    const result = runSimulation({ launchId: "l1", asset, strategy });
    assert.equal(result.dataSource, "simulation");
    assert.ok(result.pricePath.length > 5);
    assert.ok(result.estimatedGraduationDays > 0);
    assert.ok(result.migrationMarketCap > result.initialMarketCap);
    const first = result.pricePath[0]?.price ?? 0;
    const last = result.pricePath[result.pricePath.length - 1]?.price ?? 0;
    assert.ok(last > first, "expected an upward discovery path");
  });

  it("rejects invalid strategy parameters", () => {
    assert.throws(
      () =>
        runSimulation({
          launchId: "l1",
          asset,
          strategy: {
            ...strategy,
            parameters: { ...strategy.parameters, migrationMarketCap: 10 },
          },
        }),
      /migrationMarketCap/,
    );
  });
});
