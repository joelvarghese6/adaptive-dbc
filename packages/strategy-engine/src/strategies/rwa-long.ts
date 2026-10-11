import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { validateAssetProfile } from "@adaptive/shared";

/**
 * RWA_LONG_V1: gradual price discovery for real-world assets.
 * Moderate initial fee, dynamic fee enabled, controlled migration threshold.
 */
export const RWA_LONG_V1 = "RWA_LONG_V1" as const;

export function buildRwaLongRecommendation(asset: AssetProfile): StrategyRecommendation {
  validateAssetProfile(asset);
  const initialMarketCap =
    asset.referencePrice !== undefined ? asset.referencePrice * asset.totalSupply : 1_000_000;
  const migrationMarketCap = initialMarketCap * 1.25;

  return {
    strategyId: RWA_LONG_V1,
    strategyName: "RWA Long",
    confidence: 0.91,
    reasoning: [
      "Designed for assets requiring gradual price discovery",
      "Uses a controlled fee structure for early liquidity",
      "Targets migration after meaningful liquidity formation",
    ],
    parameters: {
      initialMarketCap,
      migrationMarketCap,
      migrationQuoteThreshold: asset.targetLiquidity ?? 100_000,
      baseFeeBps: 100,
      dynamicFeeEnabled: true,
      percentageSupplyOnMigration: 80,
    },
  };
}
