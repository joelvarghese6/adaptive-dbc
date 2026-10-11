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

/** On-chain migration fees are stored as whole percentages (u8). */
export const MAX_MIGRATION_FEE_PERCENTAGE = 99;
export const MAX_CREATOR_MIGRATION_FEE_PERCENTAGE = 100;

export interface MigrationFeePercentage {
  feePercentage: number;
  creatorFeePercentage: number;
}

/**
 * Fail fast on an invalid DBC migration fee.
 *
 * The SDK enforces this at runtime inside `createConfig`, which for a devnet
 * launch is *after* the base mint has already been created — leaving an
 * orphaned mint behind. Validate up front instead, with a message that names the
 * field and the accepted format.
 */
export function validateMigrationFee(fee: MigrationFeePercentage): void {
  assertWholePercentage(
    "migrationFee.feePercentage",
    fee.feePercentage,
    0,
    MAX_MIGRATION_FEE_PERCENTAGE,
  );
  assertWholePercentage(
    "migrationFee.creatorFeePercentage",
    fee.creatorFeePercentage,
    0,
    MAX_CREATOR_MIGRATION_FEE_PERCENTAGE,
  );
  if (fee.feePercentage === 0 && fee.creatorFeePercentage !== 0)
    throw new ConfigurationError(
      "migrationFee.creatorFeePercentage must be 0 when migrationFee.feePercentage is 0: " +
        "there is no migration fee for the creator to share.",
      { feePercentage: fee.feePercentage, creatorFeePercentage: fee.creatorFeePercentage },
    );
}

function assertWholePercentage(field: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value))
    throw new ConfigurationError(
      `${field} must be a whole percentage with no decimals (an integer ${min}..${max}); got ${value}. ` +
        "Meteora DBC stores migration fees as whole percent, so round to the nearest integer.",
      { [field]: value },
    );
  if (value < min || value > max)
    throw new ConfigurationError(`${field} must be within ${min}..${max}; got ${value}.`, {
      [field]: value,
    });
}

/**
 * Validate the exact config that will be submitted to the chain, before any
 * transaction (or base mint) is created. `deployLaunch` calls this first so an
 * invalid config can never reach `createConfig` after a mint exists.
 */
export function assertDeployableConfig(configParameters: unknown): void {
  const config = configParameters as
    | { migrationOption?: unknown; migrationFee?: MigrationFeePercentage }
    | null
    | undefined;
  if (!config || typeof config !== "object" || !config.migrationFee)
    throw new ConfigurationError(
      "DBC configParameters is missing migration fee settings; refusing to deploy.",
    );
  assertDammV2Migration(Number(config.migrationOption));
  validateMigrationFee(config.migrationFee);
}
