import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { buildLaunchConfig } from "./config.js";
import { assertDammV2Migration } from "./validation.js";

const asset: AssetProfile = {
  name: "Adaptive Real Estate",
  symbol: "ARE",
  assetType: "RWA",
  totalSupply: 1_000_000_000,
  decimals: 9,
  referencePrice: 0.001,
  targetLiquidity: 100_000,
};

const strategy: StrategyRecommendation = {
  strategyId: "RWA_LONG_V1",
  strategyName: "RWA Long",
  confidence: 0.91,
  reasoning: ["gradual discovery"],
  parameters: {
    initialMarketCap: 1_000_000,
    migrationMarketCap: 1_250_000,
    baseFeeBps: 100,
    dynamicFeeEnabled: true,
  },
};

describe("meteora config", () => {
  it("builds an RWA config via buildCurveWithMarketCap", () => {
    const plan = buildLaunchConfig(asset, strategy);
    assert.equal(plan.migrationTarget, "DAMM_V2");
    assert.equal(plan.initialMarketCap, 1_000_000);
    assert.equal(plan.migrationMarketCap, 1_250_000);
    const params = plan.configParameters as { curve?: unknown[]; migrationOption?: unknown };
    assert.ok(Array.isArray(params.curve) && params.curve.length > 0, "expected a curve");
    assert.equal(params.migrationOption, 1, "expected MigrationOption.MET_DAMM_V2");
  });

  it("never uses the deprecated DAMM v1 path", () => {
    assert.throws(() => assertDammV2Migration(0), /DAMM v2/);
    assert.doesNotThrow(() => assertDammV2Migration(1));
  });

  it("rejects unsupported token decimals", () => {
    assert.throws(
      () => buildLaunchConfig({ ...asset, decimals: 5 }, strategy),
      /decimals/,
    );
  });

  it("rejects missing required parameters", () => {
    assert.throws(
      () =>
        buildLaunchConfig(asset, {
          ...strategy,
          parameters: { ...strategy.parameters, migrationMarketCap: 500_000 },
        }),
      /migrationMarketCap/,
    );
    assert.throws(
      () =>
        buildLaunchConfig(asset, {
          ...strategy,
          parameters: { ...strategy.parameters, baseFeeBps: 5 },
        }),
      /baseFeeBps/,
    );
  });

  it("reports infeasible curves as configuration errors", () => {
    assert.throws(
      () => buildLaunchConfig({ ...asset, totalSupply: 1_000 }, strategy),
      /Infeasible DBC curve/,
    );
  });
});
