import type { GraduationEvent } from "@adaptive/shared";
import { getDbcPool } from "../pools/index.js";

/**
 * Graduation evaluation over real pool state.
 * A pool counts as graduated only when on-chain curve progress reaches 1.
 * DAMM v2 migration is reported only when an explicit migrated pool address
 * is observed; it is never inferred from timers or mock values.
 */
export async function evaluateGraduation(input: {
  rpcUrl: string;
  poolAddress: string;
  configAddress: string;
  knownDammV2PoolAddress?: string;
}): Promise<{ graduated: boolean; progress: number | null; event: GraduationEvent | null }> {
  const state = await getDbcPool(input.rpcUrl, input.poolAddress);
  if (!state) return { graduated: false, progress: null, event: null };
  const dataSource = input.rpcUrl.includes("devnet") ? "devnet" : "mainnet";

  if (input.knownDammV2PoolAddress) {
    return {
      graduated: true,
      progress: state.graduationProgress,
      event: {
        poolAddress: input.poolAddress,
        configAddress: input.configAddress,
        kind: "migrated_to_damm_v2",
        dammV2PoolAddress: input.knownDammV2PoolAddress,
        detectedAt: new Date().toISOString(),
        dataSource,
      },
    };
  }

  if (state.graduated) {
    return {
      graduated: true,
      progress: state.graduationProgress,
      event: {
        poolAddress: input.poolAddress,
        configAddress: input.configAddress,
        kind: "graduated",
        detectedAt: new Date().toISOString(),
        dataSource,
      },
    };
  }
  return { graduated: false, progress: state.graduationProgress, event: null };
}
