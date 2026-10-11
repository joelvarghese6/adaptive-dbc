import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import type { AssetProfile, StrategyRecommendation } from "@adaptive/shared";
import { ConfigurationError, validateAssetProfile } from "@adaptive/shared";
import type { LaunchConfigPlan } from "./types.js";
import {
  assertDammV2Migration,
  assertDeployableConfig,
  validateLaunchInputs,
  validateMigrationFee,
  type MigrationFeePercentage,
} from "./validation.js";

/**
 * DBC migration fees are whole percentages on-chain (u8): `feePercentage` must
 * be 0..99 and `creatorFeePercentage` 0..100. A fractional value is rejected by
 * the SDK at runtime inside `createConfig` — after a devnet deploy has already
 * created its base mint. 0.25 is not representable, so the closest whole
 * percentage (0) is used. The intended 0.25% fee on the *graduated* pool is
 * preserved separately by `MigrationFeeOption.FixedBps25`.
 */
const MIGRATION_FEE: MigrationFeePercentage = { feePercentage: 0, creatorFeePercentage: 0 };

function toTokenDecimal(decimals: number): TokenDecimal {
  switch (decimals) {
    case 6:
      return TokenDecimal.SIX;
    case 7:
      return TokenDecimal.SEVEN;
    case 8:
      return TokenDecimal.EIGHT;
    case 9:
      return TokenDecimal.NINE;
    default:
      throw new Error(`Unsupported decimals for DBC config: ${decimals}`);
  }
}

/**
 * Translate strategy-engine intent into an on-chain DBC configuration.
 * The strategy engine describes WHAT (market caps); this adapter determines
 * HOW (the Meteora `buildCurveWithMarketCap` config). The SDK derives
 * percentageSupplyOnMigration and migrationQuoteThreshold internally.
 */
export function buildLaunchConfig(
  asset: AssetProfile,
  strategy: StrategyRecommendation,
): LaunchConfigPlan {
  validateAssetProfile(asset);
  validateLaunchInputs(asset, strategy);
  assertDammV2Migration(MigrationOption.MET_DAMM_V2);
  // Validate the fixed migration fee before any curve math or chain work.
  validateMigrationFee(MIGRATION_FEE);

  const { parameters } = strategy;

  // The SDK derives percentageSupplyOnMigration and migrationQuoteThreshold
  // internally and rejects infeasible (supply, market-cap) combinations with
  // fixed-point errors (e.g. "Not enough liquidity"). Map those to an
  // actionable ConfigurationError instead of leaking SDK internals.
  let configParameters;
  try {
    configParameters = buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: toTokenDecimal(asset.decimals),
      // Quote side is 9-decimal (WSOL default). The SDK types this as number.
      tokenQuoteDecimal: 9,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: asset.totalSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: parameters.baseFeeBps,
          endingFeeBps: parameters.baseFeeBps,
          // Flat fee: the SDK requires both to be zero when start == end.
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: parameters.dynamicFeeEnabled,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      // FixedBps25 pins the graduated DAMM v2 pool base fee to 25 bps. A custom
      // `migratedPoolFee` is only honored for MigrationFeeOption.Customizable,
      // so it is intentionally omitted here (the SDK ignores it otherwise).
      migrationFeeOption: MigrationFeeOption.FixedBps25,
      migrationFee: MIGRATION_FEE,
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 0,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: parameters.initialMarketCap,
    migrationMarketCap: parameters.migrationMarketCap,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ConfigurationError(
      `Infeasible DBC curve for supply ${asset.totalSupply} with market caps ` +
        `${parameters.initialMarketCap} -> ${parameters.migrationMarketCap} (${detail}). ` +
        `Use a larger totalSupply (e.g. 1B tokens is the tested demo scale) or adjust the market caps.`,
      {
        totalSupply: asset.totalSupply,
        initialMarketCap: parameters.initialMarketCap,
        migrationMarketCap: parameters.migrationMarketCap,
      },
    );
  }

  // Re-assert on the built config so a fractional migration fee can never reach
  // the chain, regardless of what the SDK does with the inputs.
  assertDeployableConfig(configParameters);

  return {
    strategyId: strategy.strategyId,
    configParameters,
    initialMarketCap: parameters.initialMarketCap,
    migrationMarketCap: parameters.migrationMarketCap,
    migrationTarget: "DAMM_V2",
  };
}

/** Backward-compatible RWA builder used by earlier scripts. */
export function buildRwaLongConfig(asset: AssetProfile, strategy: StrategyRecommendation) {
  return buildLaunchConfig(asset, strategy).configParameters;
}
