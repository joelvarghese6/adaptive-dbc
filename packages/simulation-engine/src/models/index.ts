import type { AssetProfile, SimulationResult, StrategyRecommendation } from "@adaptive/shared";
import { SimulationError } from "@adaptive/shared";

/**
 * Deterministic price-path model: logistic-style discovery from the initial
 * price toward the migration price over the estimated graduation horizon.
 * Same input always yields the same output. Labeled simulation, never market data.
 */
export function modelPricePath(input: {
  initialMarketCap: number;
  migrationMarketCap: number;
  totalSupply: number;
  days: number;
  steps?: number;
}): { tDays: number; price: number; liquidity: number; volume: number }[] {
  const { initialMarketCap, migrationMarketCap, totalSupply, days } = input;
  const steps = input.steps ?? 25;
  if (!Number.isFinite(totalSupply) || totalSupply <= 0)
    throw new SimulationError("totalSupply must be positive for simulation.");
  if (!Number.isFinite(days) || days <= 0)
    throw new SimulationError("Simulation horizon must be positive.");

  const p0 = initialMarketCap / totalSupply;
  const p1 = migrationMarketCap / totalSupply;
  const points: { tDays: number; price: number; liquidity: number; volume: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * days;
    // Logistic growth toward migration price (k fixed for determinism).
    const k = 0.9;
    const midpoint = days / 2;
    const growth = 1 / (1 + Math.exp(-k * (t - midpoint)));
    const base = 1 / (1 + Math.exp(k * midpoint));
    const top = 1 / (1 + Math.exp(-k * (days - midpoint)));
    const normalized = (growth - base) / (top - base);
    const price = p0 + (p1 - p0) * normalized;
    const progress = t / days;
    const liquidity = initialMarketCap * 0.2 + (migrationMarketCap * 0.735 - initialMarketCap * 0.2) * progress;
    const volume = initialMarketCap * 0.05 * (1 + progress * 2);
    points.push({
      tDays: Math.round(t * 100) / 100,
      price: Math.round(price * 1_000_000) / 1_000_000,
      liquidity: Math.round(liquidity * 100) / 100,
      volume: Math.round(volume * 100) / 100,
    });
  }
  return points;
}
