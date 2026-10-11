import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { validateAssetProfile } from "@adaptive/shared";

/**
 * STOCK_DISCOVERY_V1: price discovery for tokenized stocks around a known
 * reference price. Tighter curve than RWA long, lower starting fee.
 */
export const STOCK_DISCOVERY_V1 = "STOCK_DISCOVERY_V1" as const;

export function buildStockDiscoveryRecommendation(asset: AssetProfile): StrategyRecommendation {
  validateAssetProfile(asset);
  const initialMarketCap =
    asset.referencePrice !== undefined ? asset.referencePrice * asset.totalSupply : 500_000;
  const migrationMarketCap = initialMarketCap * 2;

  return {
    strategyId: STOCK_DISCOVERY_V1,
    strategyName: "Stock Discovery",
    confidence: 0.84,
    reasoning: [
      "Anchors discovery around the external reference valuation",
      "Lower starting fee suits continuous equity-like trading",
      "Migration at 2x initial market cap captures discovery upside",
    ],
    parameters: {
      initialMarketCap,
      migrationMarketCap,
      migrationQuoteThreshold: asset.targetLiquidity ?? 250_000,
      baseFeeBps: 50,
      dynamicFeeEnabled: true,
      percentageSupplyOnMigration: 70,
    },
  };
}
