import type { AssetProfile, AssetType, StrategyId } from "../types/index.js";
import { ValidationError } from "../utils/index.js";

export const SUPPORTED_DECIMALS = [6, 7, 8, 9] as const;
export type SupportedDecimals = (typeof SUPPORTED_DECIMALS)[number];

export const STRATEGY_IDS = [
  "RWA_LONG_V1",
  "STOCK_DISCOVERY_V1",
  "AI_AGENT_V1",
  "MEME_FAST_V1",
] as const satisfies readonly StrategyId[];

export const ASSET_TYPE_TO_STRATEGY: Record<AssetType, StrategyId> = {
  RWA: "RWA_LONG_V1",
  STOCK: "STOCK_DISCOVERY_V1",
  AI_AGENT: "AI_AGENT_V1",
  MEME: "MEME_FAST_V1",
};

export const DEVNET_RPC_URL = "https://api.devnet.solana.com";

export function isSupportedDecimals(decimals: number): decimals is SupportedDecimals {
  return (SUPPORTED_DECIMALS as readonly number[]).includes(decimals);
}

export function validateAssetProfile(asset: AssetProfile): void {
  if (!asset || typeof asset !== "object") throw new ValidationError("Asset profile must be an object.");
  if (typeof asset.name !== "string" || asset.name.trim().length === 0)
    throw new ValidationError("Asset name must be a non-empty string.");
  if (typeof asset.symbol !== "string" || asset.symbol.trim().length === 0)
    throw new ValidationError("Asset symbol must be a non-empty string.");
  if (!["RWA", "STOCK", "AI_AGENT", "MEME"].includes(asset.assetType))
    throw new ValidationError(`Unsupported assetType: ${String(asset.assetType)}.`);
  if (!Number.isFinite(asset.totalSupply) || asset.totalSupply <= 0)
    throw new ValidationError("totalSupply must be a positive finite number.", { totalSupply: asset.totalSupply });
  if (!isSupportedDecimals(asset.decimals))
    throw new ValidationError(
      `decimals must be one of ${SUPPORTED_DECIMALS.join(", ")} for DBC launches.`,
      { decimals: asset.decimals },
    );
  if (asset.referencePrice !== undefined && (!Number.isFinite(asset.referencePrice) || asset.referencePrice <= 0))
    throw new ValidationError("referencePrice must be a positive finite number when provided.");
  if (asset.targetLiquidity !== undefined && (!Number.isFinite(asset.targetLiquidity) || asset.targetLiquidity <= 0))
    throw new ValidationError("targetLiquidity must be a positive finite number when provided.");
}
