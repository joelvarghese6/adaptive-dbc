import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { validateAssetProfile } from "@adaptive/shared";

/**
 * AI_AGENT_V1: balanced discovery for AI-agent tokens with uncertain
 * fundamentals. Wider migration multiple, moderate fees.
 */
export const AI_AGENT_V1 = "AI_AGENT_V1" as const;

export function buildAiAgentRecommendation(asset: AssetProfile): StrategyRecommendation {
  validateAssetProfile(asset);
  const initialMarketCap =
    asset.referencePrice !== undefined ? asset.referencePrice * asset.totalSupply : 250_000;
  const migrationMarketCap = initialMarketCap * 3;

  return {
    strategyId: AI_AGENT_V1,
    strategyName: "AI Agent",
    confidence: 0.78,
    reasoning: [
      "Wider migration multiple accommodates narrative-driven volatility",
      "Moderate starting fee balances speculation and liquidity depth",
      "Dynamic fee enabled to absorb volume spikes",
    ],
    parameters: {
      initialMarketCap,
      migrationMarketCap,
      migrationQuoteThreshold: asset.targetLiquidity ?? 150_000,
      baseFeeBps: 150,
      dynamicFeeEnabled: true,
      percentageSupplyOnMigration: 60,
    },
  };
}
