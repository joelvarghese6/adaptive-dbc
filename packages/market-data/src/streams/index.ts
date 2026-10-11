import type { GraduationProgress, HolderConcentration, LiquidityStats, PricePoint, VolumeStats } from "../metrics/index.js";

/** Polling stream descriptor for a pool. The indexer owns the polling loop. */
export interface PoolStream {
  poolAddress: string;
  intervalMs: number;
  dataSource: "devnet" | "mainnet";
}

export function describePoolStream(poolAddress: string, dataSource: PoolStream["dataSource"]): PoolStream {
  return { poolAddress, intervalMs: 30_000, dataSource };
}

export type MarketSnapshot = {
  volume: VolumeStats | null;
  liquidity: LiquidityStats | null;
  latestPrice: PricePoint | null;
  holders: HolderConcentration | null;
  graduation: GraduationProgress | null;
};
