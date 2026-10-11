import type { Trade } from "@adaptive/shared";

/** Parse raw on-chain trade rows into normalized trades. No mock data. */
export function normalizeTrade(raw: {
  signature: string;
  poolAddress: string;
  side: "buy" | "sell";
  baseAmount: number;
  quoteAmount: number;
  timestamp: string;
  dataSource: Trade["dataSource"];
}): Trade {
  const price = raw.baseAmount === 0 ? 0 : raw.quoteAmount / raw.baseAmount;
  return {
    signature: raw.signature,
    poolAddress: raw.poolAddress,
    side: raw.side,
    baseAmount: raw.baseAmount,
    quoteAmount: raw.quoteAmount,
    price,
    timestamp: raw.timestamp,
    dataSource: raw.dataSource,
  };
}
