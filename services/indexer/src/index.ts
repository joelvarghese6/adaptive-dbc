import type { PoolIndexer } from "@adaptive/market-data";
import { emptySnapshot } from "@adaptive/market-data";
import type { MarketSnapshot } from "@adaptive/market-data";
import type { PoolState } from "@adaptive/shared";
import { getDbcPool } from "@adaptive/meteora";

/**
 * Indexer: populates normalized market-data types from real Solana/Meteora
 * reads. Fields that cannot be read stay null; nothing is invented.
 */
export class DbcIndexer implements PoolIndexer {
  constructor(private readonly rpcUrl: string) {}

  async getPoolState(poolAddress: string): Promise<PoolState | null> {
    return getDbcPool(this.rpcUrl, poolAddress);
  }

  async getSnapshot(poolAddress: string): Promise<MarketSnapshot> {
    const state = await this.getPoolState(poolAddress);
    if (!state) return emptySnapshot();
    const dataSource = this.rpcUrl.includes("devnet") ? "devnet" : "mainnet";
    return {
      volume: null,
      liquidity:
        state.liquidity === null
          ? null
          : {
              poolAddress,
              liquidity: state.liquidity,
              baseReserve: state.baseReserve ?? "0",
              quoteReserve: state.quoteReserve ?? "0",
              dataSource,
              updatedAt: state.updatedAt,
            },
      latestPrice: null,
      holders: null,
      graduation: {
        poolAddress,
        progress: state.graduationProgress,
        graduated: state.graduated,
        migratedToDammV2: state.migratedToDammV2,
        dammV2PoolAddress: state.dammV2PoolAddress,
        dataSource,
        updatedAt: state.updatedAt,
      },
    };
  }
}

export function createIndexer(rpcUrl: string): DbcIndexer {
  return new DbcIndexer(rpcUrl);
}
