// Post-graduation DAMM v2 / DLMM intelligence lives here once a pool has
// migrated. Intentionally unimplemented until the first Devnet graduation
// exists; callers must handle `null` rather than receiving mock data.
export interface DammV2Position {
  poolAddress: string;
  dataSource: "devnet" | "mainnet";
}

export async function getDammV2Position(_poolAddress: string): Promise<DammV2Position | null> {
  return null;
}
