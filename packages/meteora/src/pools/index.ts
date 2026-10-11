import type { PoolState } from "@adaptive/shared";
import { MeteoraError } from "@adaptive/shared";
import { createMeteoraClient } from "../client.js";

/**
 * Read real DBC pool state. Returns null when the pool does not exist.
 * Never fabricates volume, liquidity, or graduation progress.
 */
export async function getDbcPool(
  rpcUrl: string,
  poolAddress: string,
): Promise<PoolState | null> {
  const { client } = createMeteoraClient(rpcUrl);
  let pool: unknown;
  try {
    pool = await client.state.getPool(poolAddress);
  } catch (err) {
    throw new MeteoraError(
      `Failed to fetch DBC pool ${poolAddress}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!pool) return null;

  const record = pool as Record<string, unknown>;
  const dataSource = rpcUrl.includes("devnet") ? "devnet" : "mainnet";

  let progress: number | null = null;
  try {
    progress = await client.state.getPoolQuoteTokenCurveProgress(poolAddress);
  } catch {
    progress = null;
  }

  const graduated = progress !== null && progress >= 1;

  return {
    poolAddress,
    configAddress: stringOf(record["config"]),
    baseMint: stringOf(record["baseMint"]),
    quoteMint: stringOf(record["quoteMint"]),
    dataSource,
    price: null,
    baseReserve: intOf(record["quoteReserve"] ?? record["baseReserve"]),
    quoteReserve: intOf(record["quoteReserve"]),
    volume24h: null,
    liquidity: null,
    graduationProgress: progress,
    graduated,
    migratedToDammV2: false,
    dammV2PoolAddress: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getPoolState(rpcUrl: string, poolAddress: string) {
  return getDbcPool(rpcUrl, poolAddress);
}

function stringOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toBase58" in value) {
    return (value as { toBase58(): string }).toBase58();
  }
  return "";
}

function intOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && "toString" in value)
    return (value as { toString(): string }).toString();
  return null;
}
