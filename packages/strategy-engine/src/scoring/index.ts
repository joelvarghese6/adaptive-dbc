import type { AssetProfile, AssetType, StrategyCandidate, StrategyId } from "@adaptive/shared";
import { validateAssetProfile } from "@adaptive/shared";

/**
 * Deterministic scoring of strategy candidates for an asset.
 * Pure function: same input always yields the same scores.
 */
const BASE_SCORES: Record<AssetType, Record<StrategyId, number>> = {
  RWA: { RWA_LONG_V1: 0.91, STOCK_DISCOVERY_V1: 0.45, AI_AGENT_V1: 0.3, MEME_FAST_V1: 0.15 },
  STOCK: { STOCK_DISCOVERY_V1: 0.84, RWA_LONG_V1: 0.55, AI_AGENT_V1: 0.35, MEME_FAST_V1: 0.2 },
  AI_AGENT: { AI_AGENT_V1: 0.78, MEME_FAST_V1: 0.5, STOCK_DISCOVERY_V1: 0.35, RWA_LONG_V1: 0.25 },
  MEME: { MEME_FAST_V1: 0.7, AI_AGENT_V1: 0.45, STOCK_DISCOVERY_V1: 0.25, RWA_LONG_V1: 0.15 },
};

const REASONS: Record<StrategyId, string> = {
  RWA_LONG_V1: "Gradual discovery curve suits assets with external reference valuations",
  STOCK_DISCOVERY_V1: "Anchored discovery suits tokenized equities",
  AI_AGENT_V1: "Balanced curve absorbs narrative-driven volatility",
  MEME_FAST_V1: "Steep fast curve suits assets with no reference valuation",
};

export function scoreStrategies(asset: AssetProfile): StrategyCandidate[] {
  validateAssetProfile(asset);
  const base = BASE_SCORES[asset.assetType];
  // Deterministic tie-break: fixed candidate order, small deterministic
  // adjustment when a reference price exists (favors anchored strategies).
  const anchoredBonus: Record<StrategyId, number> =
    asset.referencePrice !== undefined
      ? { RWA_LONG_V1: 0.02, STOCK_DISCOVERY_V1: 0.02, AI_AGENT_V1: 0, MEME_FAST_V1: 0 }
      : { RWA_LONG_V1: 0, STOCK_DISCOVERY_V1: 0, AI_AGENT_V1: 0, MEME_FAST_V1: 0 };

  const order: StrategyId[] = ["RWA_LONG_V1", "STOCK_DISCOVERY_V1", "AI_AGENT_V1", "MEME_FAST_V1"];
  return order.map((strategyId) => ({
    strategyId,
    score: Math.min(1, Math.round((base[strategyId] + anchoredBonus[strategyId]) * 100) / 100),
    reasons: [REASONS[strategyId]],
  }));
}
