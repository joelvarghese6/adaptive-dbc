import type { StrategyId } from "@adaptive/shared";

/** Deterministic per-strategy scenario assumptions. */
export interface ScenarioAssumptions {
  strategyId: StrategyId;
  /** Daily volume as a fraction of initial market cap. */
  dailyVolumeFraction: number;
  /** Fee drag applied to the strategy score, in bps. */
  feeDragBps: number;
  /** Base graduation horizon in days before curve adjustment. */
  baseGraduationDays: number;
}

export const SCENARIOS: Record<StrategyId, ScenarioAssumptions> = {
  RWA_LONG_V1: { strategyId: "RWA_LONG_V1", dailyVolumeFraction: 0.06, feeDragBps: 100, baseGraduationDays: 4.75 },
  STOCK_DISCOVERY_V1: { strategyId: "STOCK_DISCOVERY_V1", dailyVolumeFraction: 0.1, feeDragBps: 50, baseGraduationDays: 3.5 },
  AI_AGENT_V1: { strategyId: "AI_AGENT_V1", dailyVolumeFraction: 0.16, feeDragBps: 150, baseGraduationDays: 2.75 },
  MEME_FAST_V1: { strategyId: "MEME_FAST_V1", dailyVolumeFraction: 0.3, feeDragBps: 200, baseGraduationDays: 1.5 },
};

export function getScenario(strategyId: StrategyId): ScenarioAssumptions {
  const scenario = SCENARIOS[strategyId];
  if (!scenario) throw new Error(`Unknown strategy: ${String(strategyId)}`);
  return scenario;
}
