import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { validateAssetProfile } from "@adaptive/shared";

/**
 * MEME_FAST_V1: steep, fast-graduating curve for meme assets with no
 * reference valuation. Higher starting fee, wide migration multiple.
 */
export const MEME_FAST_V1 = "MEME_FAST_V1" as const;

export function buildMemeFastRecommendation(asset: AssetProfile): StrategyRecommendation {
  validateAssetProfile(asset);
  const initialMarketCap =
    asset.referencePrice !== undefined ? asset.referencePrice * asset.totalSupply : 100_000;
  const migrationMarketCap = initialMarketCap * 5;

  return {
    strategyId: MEME_FAST_V1,
    strategyName: "Meme Fast",
    confidence: 0.7,
    reasoning: [
      "No external reference valuation, so discovery starts low and moves fast",
      "Higher starting fee compensates liquidity risk in volatile trading",
      "Wide migration multiple lets community momentum graduate the pool",
    ],
    parameters: {
      initialMarketCap,
      migrationMarketCap,
      migrationQuoteThreshold: asset.targetLiquidity ?? 69_000,
      baseFeeBps: 200,
      dynamicFeeEnabled: true,
      percentageSupplyOnMigration: 50,
    },
  };
}
