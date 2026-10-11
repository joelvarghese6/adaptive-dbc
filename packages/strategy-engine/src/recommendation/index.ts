import type { AssetAnalysis, AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { validateAssetProfile } from "@adaptive/shared";
import { buildAiAgentRecommendation } from "../strategies/ai-agent.js";
import { buildMemeFastRecommendation } from "../strategies/meme-fast.js";
import { buildRwaLongRecommendation } from "../strategies/rwa-long.js";
import { buildStockDiscoveryRecommendation } from "../strategies/stock-discovery.js";
import { scoreStrategies } from "../scoring/index.js";

/**
 * Asset -> classification -> candidates -> scoring -> recommended strategy.
 * Deterministic and rule-based; no LLM involved.
 */
export function recommendStrategy(asset: AssetProfile): StrategyRecommendation {
  validateAssetProfile(asset);
  switch (asset.assetType) {
    case "RWA":
      return buildRwaLongRecommendation(asset);
    case "STOCK":
      return buildStockDiscoveryRecommendation(asset);
    case "AI_AGENT":
      return buildAiAgentRecommendation(asset);
    case "MEME":
      return buildMemeFastRecommendation(asset);
  }
}

export function analyzeAsset(asset: AssetProfile): AssetAnalysis {
  validateAssetProfile(asset);
  const candidates = scoreStrategies(asset);
  const recommended = recommendStrategy(asset);
  return { asset, candidates, recommended };
}
