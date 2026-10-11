import type { PoolState } from "@adaptive/shared";
import type { MarketSnapshot } from "../streams/index.js";

/**
 * Indexer interface: populate normalized market types from real
 * Solana/Meteora data. Implementations must not invent state.
 */
export interface PoolIndexer {
  getPoolState(poolAddress: string): Promise<PoolState | null>;
  getSnapshot(poolAddress: string): Promise<MarketSnapshot>;
}

export function emptySnapshot(): MarketSnapshot {
  return { volume: null, liquidity: null, latestPrice: null, holders: null, graduation: null };
}
