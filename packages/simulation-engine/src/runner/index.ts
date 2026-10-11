import type { AssetProfile, SimulationResult, StrategyRecommendation } from "@adaptive/shared";
import { SimulationError, validateAssetProfile } from "@adaptive/shared";
import { modelPricePath } from "../models/index.js";
import { getScenario } from "../scenarios/index.js";

/**
 * Deterministic strategy simulation. Compares candidate strategies before
 * deployment. Output is labeled `simulation` and must never be presented
 * as actual market behavior.
 */
export function runSimulation(input: {
  launchId: string;
  asset: AssetProfile;
  strategy: StrategyRecommendation;
}): SimulationResult {
  const { launchId, asset, strategy } = input;
  validateAssetProfile(asset);
  if (!strategy || typeof strategy.strategyId !== "string")
    throw new SimulationError("A strategy recommendation is required to run a simulation.");

  const scenario = getScenario(strategy.strategyId);
  const { initialMarketCap, migrationMarketCap } = strategy.parameters;
  if (!Number.isFinite(initialMarketCap) || initialMarketCap <= 0)
    throw new SimulationError("Strategy initialMarketCap must be positive.");
  if (!Number.isFinite(migrationMarketCap) || migrationMarketCap <= initialMarketCap)
    throw new SimulationError("Strategy migrationMarketCap must exceed initialMarketCap.");

  const multiple = migrationMarketCap / initialMarketCap;
  const estimatedGraduationDays =
    Math.round(scenario.baseGraduationDays * (1 + (multiple - 1) * 0.35) * 100) / 100;

  const path = modelPricePath({
    initialMarketCap,
    migrationMarketCap,
    totalSupply: asset.totalSupply,
    days: estimatedGraduationDays,
  });

  const graduationThresholdQuote =
    strategy.parameters.migrationQuoteThreshold ?? migrationMarketCap * 0.735;

  // Deterministic score: curve multiple reward minus fee drag, clamped 0..1.
  const raw = 0.55 + Math.min(0.35, (multiple - 1) * 0.12) - scenario.feeDragBps / 10_000;
  const strategyScore = Math.round(Math.min(0.98, Math.max(0.05, raw)) * 100) / 100;

  return {
    launchId,
    strategyId: strategy.strategyId,
    dataSource: "simulation",
    initialMarketCap,
    migrationMarketCap,
    graduationThresholdQuote: Math.round(graduationThresholdQuote * 100) / 100,
    estimatedGraduationDays,
    pricePath: path,
    liquidityPath: path,
    feeImpactBps: scenario.feeDragBps,
    strategyScore,
    notes: [
      "Simulation only: deterministic model, not actual market behavior.",
      `Scenario ${scenario.strategyId} assumes ${(scenario.dailyVolumeFraction * 100).toFixed(1)}% daily volume vs initial market cap.`,
    ],
  };
}
