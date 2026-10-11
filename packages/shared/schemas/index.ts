// Lightweight runtime validation for API boundaries.
// Zod is not a dependency of this repo; these guards keep the
// validation_next to the types without adding a framework.
import { validateAssetProfile } from "../constants/index.js";
import type { AssetProfile } from "../types/index.js";
import { ValidationError } from "../utils/index.js";

export function parseAssetProfile(input: unknown): AssetProfile {
  if (!input || typeof input !== "object") throw new ValidationError("Request body must be a JSON object.");
  const body = input as Record<string, unknown>;
  const asset: AssetProfile = {
    name: String(body.name ?? ""),
    symbol: String(body.symbol ?? ""),
    assetType: body.assetType as AssetProfile["assetType"],
    totalSupply: Number(body.totalSupply),
    decimals: Number(body.decimals),
    referencePrice: body.referencePrice === undefined ? undefined : Number(body.referencePrice),
    targetLiquidity: body.targetLiquidity === undefined ? undefined : Number(body.targetLiquidity),
  };
  validateAssetProfile(asset);
  return asset;
}

export function parseLaunchId(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0)
    throw new ValidationError("Launch id must be a non-empty string.");
  return input;
}
