// Canonical data contracts for Adaptive DBC.
// Frontend and backend consume these; backend implementation details
// must never leak into these types.
export type AssetType = "RWA" | "STOCK" | "AI_AGENT" | "MEME";

export type DataSource = "simulation" | "devnet" | "mainnet" | "mock";

export interface AssetProfile {
  name: string;
  symbol: string;
  assetType: AssetType;
  /** Total token supply in whole tokens (before decimals). Must be a positive finite number. */
  totalSupply: number;
  /** Token decimals. Only 6, 7, 8, 9 are supported for DBC launches. */
  decimals: number;
  /** External reference price in quote currency (e.g. USDC), if known. */
  referencePrice?: number;
  /** Target quote-side liquidity at migration, in quote currency units. */
  targetLiquidity?: number;
}

export type StrategyId =
  | "RWA_LONG_V1"
  | "STOCK_DISCOVERY_V1"
  | "AI_AGENT_V1"
  | "MEME_FAST_V1";

export interface StrategyParameters {
  initialMarketCap: number;
  migrationMarketCap: number;
  /** Informational hint only. The SDK derives the real threshold from market caps. */
  migrationQuoteThreshold?: number;
  baseFeeBps: number;
  dynamicFeeEnabled: boolean;
  /** Informational hint only. The SDK derives the real percentage from market caps. */
  percentageSupplyOnMigration?: number;
}

export interface StrategyRecommendation {
  strategyId: StrategyId;
  strategyName: string;
  /** 0..1 */
  confidence: number;
  reasoning: string[];
  parameters: StrategyParameters;
}

export interface StrategyCandidate {
  strategyId: StrategyId;
  score: number;
  reasons: string[];
}

export interface AssetAnalysis {
  asset: AssetProfile;
  candidates: StrategyCandidate[];
  recommended: StrategyRecommendation;
}

export type LaunchStatus =
  | "draft"
  | "analyzed"
  | "simulated"
  | "deploying"
  | "live"
  | "graduated"
  | "failed"
  /** On-chain state was created, but deployment did not finish. */
  | "partially_deployed";

export type TransactionState =
  | "preparing"
  | "awaiting_wallet"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "failed";

export interface Launch {
  id: string;
  asset: AssetProfile;
  strategy: StrategyRecommendation | null;
  simulation: SimulationResult | null;
  deployment: DeploymentResult | null;
  status: LaunchStatus;
  dataSource: DataSource;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface SimulationPoint {
  /** Days since launch, deterministic grid. */
  tDays: number;
  price: number;
  liquidity: number;
  volume: number;
}

export interface SimulationResult {
  launchId: string;
  strategyId: StrategyId;
  dataSource: Extract<DataSource, "simulation">;
  initialMarketCap: number;
  migrationMarketCap: number;
  graduationThresholdQuote: number;
  estimatedGraduationDays: number;
  pricePath: SimulationPoint[];
  liquidityPath: SimulationPoint[];
  feeImpactBps: number;
  strategyScore: number;
  notes: string[];
}

export interface DeploymentResult {
  launchId: string;
  strategyId: StrategyId;
  dataSource: Extract<DataSource, "devnet" | "mainnet">;
  network: "devnet" | "mainnet";
  rpcUrl: string;
  configAddress: string;
  poolAddress: string;
  baseMint: string;
  transactionSignatures: string[];
  transactionState: TransactionState;
  deployedAt: string;
}

export interface PoolState {
  poolAddress: string;
  configAddress: string;
  baseMint: string;
  quoteMint: string;
  dataSource: DataSource;
  price: number | null;
  baseReserve: string | null;
  quoteReserve: string | null;
  volume24h: number | null;
  liquidity: number | null;
  graduationProgress: number | null;
  graduated: boolean;
  migratedToDammV2: boolean;
  dammV2PoolAddress: string | null;
  updatedAt: string;
}

export interface Trade {
  signature: string;
  poolAddress: string;
  side: "buy" | "sell";
  baseAmount: number;
  quoteAmount: number;
  price: number;
  timestamp: string;
  dataSource: DataSource;
}

export type AdaptiveAction =
  | "maintain_strategy"
  | "increase_caution"
  | "prepare_for_graduation"
  | "review_liquidity_positioning";

export interface AdaptiveRecommendation {
  poolAddress: string;
  action: AdaptiveAction;
  reasons: string[];
  /** 0..1 */
  confidence: number;
  createdAt: string;
}

export interface GraduationEvent {
  poolAddress: string;
  configAddress: string;
  kind: "graduated" | "migrated_to_damm_v2";
  dammV2PoolAddress?: string;
  detectedAt: string;
  dataSource: DataSource;
}
