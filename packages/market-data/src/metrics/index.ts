// Normalized market-data contracts. The indexer populates these from
// Solana/Meteora data; nothing here fabricates blockchain state.
export type { PoolState, Trade } from "@adaptive/shared";

export interface VolumeStats {
  poolAddress: string;
  volume24h: number;
  tradeCount24h: number;
  dataSource: "devnet" | "mainnet";
  updatedAt: string;
}

export interface LiquidityStats {
  poolAddress: string;
  liquidity: number;
  baseReserve: string;
  quoteReserve: string;
  dataSource: "devnet" | "mainnet";
  updatedAt: string;
}

export interface PricePoint {
  poolAddress: string;
  price: number;
  timestamp: string;
  dataSource: "devnet" | "mainnet";
}

export interface HolderConcentration {
  poolAddress: string;
  topHolderBps: number | null;
  holderCount: number | null;
  dataSource: "devnet" | "mainnet";
  updatedAt: string;
}

export interface GraduationProgress {
  poolAddress: string;
  /** 0..1 quote-token curve progress. Null when the pool cannot be read. */
  progress: number | null;
  graduated: boolean;
  migratedToDammV2: boolean;
  dammV2PoolAddress: string | null;
  dataSource: "devnet" | "mainnet";
  updatedAt: string;
}
