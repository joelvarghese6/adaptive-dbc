import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AssetProfile } from "@adaptive/shared";
import {
  analyzeAsset,
  recommendStrategy,
  scoreStrategies,
} from "./index.js";

function asset(overrides: Partial<AssetProfile> = {}): AssetProfile {
  return {
    name: "Test Asset",
    symbol: "TST",
    assetType: "RWA",
    totalSupply: 1_000_000_000,
    decimals: 9,
    referencePrice: 0.001,
    ...overrides,
  };
}

describe("strategy-engine", () => {
  it("maps RWA to RWA_LONG_V1", () => {
    const rec = recommendStrategy(asset({ assetType: "RWA" }));
    assert.equal(rec.strategyId, "RWA_LONG_V1");
    assert.equal(rec.parameters.dynamicFeeEnabled, true);
  });

  it("maps STOCK to STOCK_DISCOVERY_V1", () => {
    const rec = recommendStrategy(asset({ assetType: "STOCK", referencePrice: 140 }));
    assert.equal(rec.strategyId, "STOCK_DISCOVERY_V1");
    assert.equal(rec.parameters.initialMarketCap, 140 * 1_000_000_000);
  });

  it("maps AI_AGENT to AI_AGENT_V1", () => {
    const rec = recommendStrategy(asset({ assetType: "AI_AGENT" }));
    assert.equal(rec.strategyId, "AI_AGENT_V1");
  });

  it("maps MEME to MEME_FAST_V1", () => {
    const rec = recommendStrategy(asset({ assetType: "MEME" }));
    assert.equal(rec.strategyId, "MEME_FAST_V1");
  });

  it("is deterministic for the same input", () => {
    const a = asset();
    assert.deepEqual(recommendStrategy(a), recommendStrategy({ ...a }));
    assert.deepEqual(scoreStrategies(a), scoreStrategies({ ...a }));
  });

  it("ranks the matching strategy first", () => {
    const analysis = analyzeAsset(asset({ assetType: "RWA" }));
    assert.equal(analysis.candidates[0]?.strategyId, "RWA_LONG_V1");
    assert.equal(analysis.recommended.strategyId, "RWA_LONG_V1");
    assert.equal(analysis.candidates.length, 4);
  });

  it("rejects invalid inputs", () => {
    assert.throws(() => recommendStrategy(asset({ totalSupply: 0 })), /totalSupply/);
    assert.throws(() => recommendStrategy(asset({ decimals: 5 })), /decimals/);
    assert.throws(
      () => recommendStrategy(asset({ assetType: "BOND" as never })),
      /assetType/,
    );
    assert.throws(() => recommendStrategy(asset({ name: "" })), /name/);
  });
});
