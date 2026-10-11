import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
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
import { assertDammV2Migration, validateLaunchInputs } from "./validation.js";

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
      migrationFeeOption: MigrationFeeOption.FixedBps25,
      migrationFee: {
        feePercentage: 0.25,
        creatorFeePercentage: 0,
      },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: 30,
      },
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
