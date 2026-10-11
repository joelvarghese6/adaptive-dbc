// Backward-compatible wrapper around the canonical RWA_LONG_V1 builder.
// New code should use `recommendStrategy` / `analyzeAsset` instead.
import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { buildRwaLongRecommendation } from "./strategies/rwa-long.js";

export function createRwaLongStrategy(asset: AssetProfile): StrategyRecommendation {
  return buildRwaLongRecommendation(asset);
}
