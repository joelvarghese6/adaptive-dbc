import type { AssetProfile, Launch } from "@adaptive/shared";
import { log, parseAssetProfile } from "@adaptive/shared";
import { recommendStrategy } from "@adaptive/strategy-engine";
import { runSimulation } from "@adaptive/simulation-engine";
import { buildLaunchConfig, deployLaunch, getDbcPool } from "@adaptive/meteora";
import { getRpcUrl, loadKeypairFromEnv } from "@adaptive/meteora";
import {
  createLaunchRecord,
  getLaunchRecord,
  updateLaunchRecord,
} from "../store.js";

/**
 * Launch orchestration: Asset -> Strategy Engine -> Simulation -> Meteora.
 * Route handlers stay thin; all business logic lives here.
 */
export function createLaunch(input: unknown): Launch {
  const asset: AssetProfile = parseAssetProfile(input);
  const launch = createLaunchRecord(asset);
  log("info", "Launch created", { launchId: launch.id });
  return launch;
}

export function analyzeLaunch(id: string): Launch {
  const launch = requireLaunch(id);
  const strategy = recommendStrategy(launch.asset);
  const updated = updateLaunchRecord(id, {
    strategy,
    status: "analyzed",
    dataSource: "mock",
  });
  if (!updated) throw new Error(`Launch ${id} disappeared during analysis.`);
  log("info", "Launch analyzed", { launchId: id, strategyId: strategy.strategyId });
  return updated;
}

export function simulateLaunch(id: string): Launch {
  const launch = requireLaunch(id);
  const analyzed = launch.strategy ?? recommendStrategy(launch.asset);
  const simulation = runSimulation({ launchId: id, asset: launch.asset, strategy: analyzed });
  const updated = updateLaunchRecord(id, {
    strategy: analyzed,
    simulation,
    status: "simulated",
    dataSource: "mock",
  });
  if (!updated) throw new Error(`Launch ${id} disappeared during simulation.`);
  log("info", "Launch simulated", { launchId: id, strategyId: analyzed.strategyId });
  return updated;
}

export interface DeployOptions {
  rpcUrl?: string;
  quoteMint?: string;
}

export async function deployLaunchById(id: string, options: DeployOptions = {}): Promise<Launch> {
  const launch = requireLaunch(id);
  const strategy = launch.strategy ?? recommendStrategy(launch.asset);
  updateLaunchRecord(id, { strategy, status: "deploying", dataSource: "mock" });

  try {
    const rpcUrl = options.rpcUrl ?? getRpcUrl();
    const payer = loadKeypairFromEnv();
    const plan = buildLaunchConfig(launch.asset, strategy);
    const deployment = await deployLaunch(
      {
        launchId: id,
        strategyId: strategy.strategyId,
        asset: launch.asset,
        name: launch.asset.name,
        symbol: launch.asset.symbol,
        rpcUrl,
        quoteMint: options.quoteMint,
        configParameters: plan.configParameters,
      },
      payer,
    );
    const updated = updateLaunchRecord(id, {
      strategy,
      deployment,
      status: "live",
      dataSource: "devnet",
    });
    if (!updated) throw new Error(`Launch ${id} disappeared during deployment.`);
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateLaunchRecord(id, { status: "failed", error: message });
    throw err;
  }
}

export async function getLaunchStatus(id: string, rpcUrl?: string): Promise<Launch> {
  const launch = requireLaunch(id);
  if (!launch.deployment) return launch;
  // Refresh graduation-relevant state from the real pool when possible.
  try {
    const pool = await getDbcPool(rpcUrl ?? launch.deployment.rpcUrl, launch.deployment.poolAddress);
    if (pool?.graduated) return updateLaunchRecord(id, { status: "graduated" }) ?? launch;
  } catch {
    // Status reads must never fail the request; deployment record stays.
  }
  return launch;
}

function requireLaunch(id: string): Launch {
  const launch = getLaunchRecord(id);
  if (!launch) {
    const err = new Error(`Launch ${id} not found.`);
    (err as NodeJS.ErrnoException).code = "NOT_FOUND";
    throw err;
  }
  return launch;
}
