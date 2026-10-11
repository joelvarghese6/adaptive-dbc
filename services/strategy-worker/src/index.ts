import type { AdaptiveRecommendation, AssetProfile, PoolState } from "@adaptive/shared";

/**
 * Adaptive monitoring layer: evaluates real pool/market signals and produces
 * transparent, user-controlled recommendations. Never moves funds.
 */
export function evaluateAdaptiveSignals(input: {
  pool: PoolState;
  volume24h?: number | null;
  holderConcentrationBps?: number | null;
}): AdaptiveRecommendation {
  const { pool } = input;
  const reasons: AdaptiveRecommendation["reasons"] = [];

  if (pool.graduationProgress !== null)
    reasons.push(`Graduation progress is ${Math.round(pool.graduationProgress * 100)}% (on-chain).`);
  if (input.volume24h !== undefined && input.volume24h !== null)
    reasons.push(`24h volume is ${input.volume24h}.`);
  if (input.holderConcentrationBps !== undefined && input.holderConcentrationBps !== null)
    reasons.push(`Top holder concentration is ${input.holderConcentrationBps} bps.`);

  let action: AdaptiveRecommendation["action"] = "maintain_strategy";
  let confidence = 0.6;
  const progress = pool.graduationProgress ?? 0;
  if (pool.graduated || progress >= 1) {
    action = "prepare_for_graduation";
    confidence = 0.9;
    reasons.push("Pool has reached the migration threshold.");
  } else if (progress >= 0.75) {
    action = "prepare_for_graduation";
    confidence = 0.8;
    reasons.push("Pool is approaching the migration threshold; review liquidity positioning.");
  } else if (
    (input.holderConcentrationBps ?? 0) > 3000 ||
    (input.volume24h ?? 0) <= 0
  ) {
    action = "increase_caution";
    confidence = 0.7;
    reasons.push("Weak demand or concentrated holders suggest caution.");
  }

  if (reasons.length === 0) reasons.push("No adverse signals in the observed pool state.");

  return {
    poolAddress: pool.poolAddress,
    action,
    reasons,
    confidence,
    createdAt: new Date().toISOString(),
  };
}

export function recommendForAsset(_asset: AssetProfile): AdaptiveRecommendation | null {
  // Asset-level recommendations require a live pool; without one there is
  // nothing to monitor, so return null instead of inventing advice.
  return null;
}
