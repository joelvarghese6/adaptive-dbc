import type { AssetProfile, DeploymentResult, StrategyId } from "@adaptive/shared";

/** Input for building a DBC config from a strategy recommendation. */
export interface BuildLaunchConfigInput {
  asset: AssetProfile;
  initialMarketCap: number;
  migrationMarketCap: number;
  baseFeeBps: number;
  dynamicFeeEnabled: boolean;
}

/** A built config plus the normalized economic intent behind it. */
export interface LaunchConfigPlan {
  strategyId: StrategyId;
  /** Raw SDK `ConfigParameters` from `buildCurveWithMarketCap`. */
  configParameters: unknown;
  initialMarketCap: number;
  migrationMarketCap: number;
  /** DAMM v2 migration is the only supported target. */
  migrationTarget: "DAMM_V2";
}

export interface DeployLaunchInput {
  launchId: string;
  strategyId: StrategyId;
  asset: AssetProfile;
  name: string;
  symbol: string;
  uri?: string;
  rpcUrl?: string;
  quoteMint?: string;
  configParameters: unknown;
}

export type DeployedLaunch = DeploymentResult;
