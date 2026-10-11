import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { ConfigurationError, ValidationError, isSupportedDecimals } from "@adaptive/shared";

/** Validate everything the Meteora adapter needs before touching the chain. */
export function validateLaunchInputs(asset: AssetProfile, strategy: StrategyRecommendation): void {
  if (!isSupportedDecimals(asset.decimals))
    throw new ValidationError(
      `Token decimals ${asset.decimals} are not supported for DBC launches. Use 6, 7, 8, or 9.`,
      { decimals: asset.decimals },
    );
  if (!Number.isFinite(asset.totalSupply) || asset.totalSupply <= 0)
    throw new ValidationError("Asset totalSupply must be a positive finite number.");
  const { initialMarketCap, migrationMarketCap, baseFeeBps } = strategy.parameters;
  if (!Number.isFinite(initialMarketCap) || initialMarketCap <= 0)
    throw new ConfigurationError("Strategy initialMarketCap must be a positive finite number.");
  if (!Number.isFinite(migrationMarketCap) || migrationMarketCap <= initialMarketCap)
    throw new ConfigurationError("Strategy migrationMarketCap must exceed initialMarketCap.", {
      initialMarketCap,
      migrationMarketCap,
    });
  if (!Number.isFinite(baseFeeBps) || baseFeeBps < 25 || baseFeeBps > 9900)
    throw new ConfigurationError("Strategy baseFeeBps must be within the SDK range 25..9900.", {
      baseFeeBps,
    });
}

const DAMM_V2_ONLY = "Migration must target DAMM v2 (MigrationOption.MET_DAMM_V2).";

/** Guard against regressions to the deprecated DAMM v1 migration path. */
export function assertDammV2Migration(migrationOption: number): void {
  // MigrationOption.MET_DAMM_V2 === 1; MET_DAMM (0) is deprecated for new configs.
  if (migrationOption !== 1) throw new ConfigurationError(`${DAMM_V2_ONLY} Got ${migrationOption}.`);
}
