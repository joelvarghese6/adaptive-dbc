// Typed client for @adaptive/api. Uses the stable @adaptive/shared contracts;
// no backend implementation details leak into the frontend.
import type {
  AssetProfile,
  DeploymentResult,
  Launch,
  SimulationResult,
  StrategyRecommendation,
  TransactionState,
} from "@adaptive/shared";

export type { AssetProfile, DeploymentResult, Launch, SimulationResult, StrategyRecommendation, TransactionState };

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error ?? `API request failed (${res.status}).`);
  return body as T;
}

export function dataSourceLabel(source: string): string {
  switch (source) {
    case "simulation":
      return "Simulation only";
    case "devnet":
      return "Devnet • real";
    case "mainnet":
      return "Mainnet • real";
    default:
      return "Demo data";
  }
}

export const api = {
  health(): Promise<{ status: string }> {
    return request("/api/health");
  },
  createLaunch(asset: AssetProfile): Promise<{ launch: Launch }> {
    return request("/api/launches", { method: "POST", body: JSON.stringify({ asset }) });
  },
  analyze(id: string): Promise<{ launch: Launch }> {
    return request(`/api/launches/${id}/analyze`, { method: "POST" });
  },
  simulate(id: string): Promise<{ launch: Launch }> {
    return request(`/api/launches/${id}/simulate`, { method: "POST" });
  },
  deploy(id: string): Promise<{ launch: Launch }> {
    return request(`/api/launches/${id}/deploy`, { method: "POST", body: "{}" });
  },
  status(id: string): Promise<{ launch: Launch }> {
    return request(`/api/launches/${id}/status`);
  },
};

export const DEMO_RWA_ASSET: AssetProfile = {
  name: "Adaptive Real Estate",
  symbol: "ARE",
  assetType: "RWA",
  // 1B-token scale: the smallest supply verified to produce a feasible
  // on-chain curve at these market caps with SDK 1.5.13.
  totalSupply: 1_000_000_000,
  decimals: 9,
  referencePrice: 0.001,
  targetLiquidity: 100_000,
};
