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

/** How far a deployment got, used to persist partial progress and recover it. */
export type DeploymentPhase =
  | "mint_submitting"
  | "mint_created"
  | "config_submitting"
  | "config_created"
  | "pool_submitting"
  | "pool_created";

/**
 * Durable snapshot of an in-progress deployment. Persist it as soon as the base
 * mint address is known — before the mint transaction is submitted — so a retry
 * can find the mint instead of silently creating another.
 */
export interface DeploymentCheckpoint {
  launchId: string;
  strategyId: StrategyId;
  network: "devnet" | "mainnet";
  rpcUrl: string;
  baseMint: string;
  configAddress: string | null;
  poolAddress: string | null;
  transactionSignatures: string[];
  phase: DeploymentPhase;
  /**
   * `lastValidBlockHeight` of the mint submission's blockhash, when known.
   * Reconciliation uses it to decide whether a still-unconfirmed submission can
   * no longer land; until then, "not found" is inconclusive, not a failure.
   */
  lastValidBlockHeight?: number | null;
  updatedAt: string;
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
  /**
   * Called after the base mint is created and after each confirmed transaction.
   * Persist the checkpoint so a retry never creates a second base mint.
   */
  onCheckpoint?: (checkpoint: DeploymentCheckpoint) => void | Promise<void>;
}

/**
 * Input for resuming a partial launch. Mirrors `DeployLaunchInput` but starts
 * from an existing checkpoint and never creates a base mint.
 */
export interface ResumeLaunchInput {
  launchId: string;
  strategyId: StrategyId;
  asset: AssetProfile;
  name: string;
  symbol: string;
  uri?: string;
  rpcUrl?: string;
  quoteMint?: string;
  configParameters: unknown;
  /** The durable checkpoint of the partially deployed launch being resumed. */
  checkpoint: DeploymentCheckpoint;
  /** Called before each submit and after each confirmed transaction. */
  onCheckpoint?: (checkpoint: DeploymentCheckpoint) => void | Promise<void>;
}

export type DeployedLaunch = DeploymentResult;
