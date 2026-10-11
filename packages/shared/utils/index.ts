// Typed errors. Route handlers normalize unknown throws into these;
// blockchain errors are never swallowed and never leak secrets.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "WALLET_ERROR"
  | "RPC_ERROR"
  | "TRANSACTION_ERROR"
  | "METEORA_ERROR"
  | "PARTIAL_DEPLOYMENT"
  | "CHECKPOINT_ERROR"
  | "RESUME_ERROR"
  | "SIMULATION_ERROR";

export class AdaptiveError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, string | number | boolean | null>;
  constructor(code: ErrorCode, message: string, details?: Record<string, string | number | boolean | null>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("VALIDATION_ERROR", message, details);
  }
}

export class ConfigurationError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("CONFIGURATION_ERROR", message, details);
  }
}

export class WalletError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("WALLET_ERROR", message, details);
  }
}

export class RpcError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("RPC_ERROR", message, details);
  }
}

export class TransactionError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("TRANSACTION_ERROR", message, details);
  }
}

export class MeteoraError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("METEORA_ERROR", message, details);
  }
}

export interface PartialDeploymentErrorParams {
  launchId: string;
  /** Base mint that already exists on-chain. Never create another one. */
  baseMint: string;
  message: string;
  configAddress?: string | null;
  poolAddress?: string | null;
  transactionSignatures?: string[];
  recovery?: string;
}

/**
 * A devnet/mainnet deployment failed *after* creating on-chain state (at least
 * the base mint). Distinguishes a partial launch from a launch that never
 * started, and carries everything needed to recover the existing mint.
 */
export class PartialDeploymentError extends AdaptiveError {
  readonly launchId: string;
  readonly baseMint: string;
  readonly configAddress: string | null;
  readonly poolAddress: string | null;
  readonly transactionSignatures: string[];
  readonly recovery: string;

  constructor(params: PartialDeploymentErrorParams) {
    super("PARTIAL_DEPLOYMENT", params.message, {
      launchId: params.launchId,
      baseMint: params.baseMint,
      configAddress: params.configAddress ?? null,
      poolAddress: params.poolAddress ?? null,
      transactionSignatures: (params.transactionSignatures ?? []).join(","),
    });
    this.launchId = params.launchId;
    this.baseMint = params.baseMint;
    this.configAddress = params.configAddress ?? null;
    this.poolAddress = params.poolAddress ?? null;
    this.transactionSignatures = params.transactionSignatures ?? [];
    this.recovery =
      params.recovery ??
      `A base mint (${params.baseMint}) already exists for launch ${params.launchId}. ` +
        "Do not create another mint: reuse this launch id and inspect the existing on-chain state before retrying.";
  }
}

export class SimulationError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("SIMULATION_ERROR", message, details);
  }
}

/**
 * A durable deployment checkpoint (or launch store) could not be read or
 * written, or was found corrupt. Callers must fail safe: a corrupt checkpoint
 * is never treated as "no checkpoint", because that would allow a second mint.
 */
export class CheckpointError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("CHECKPOINT_ERROR", message, details);
  }
}

/**
 * A partial launch could not be safely resumed: the checkpoint and the chain
 * disagree, the recorded mint/authority is not what a resume expects, or an
 * on-chain read was inconclusive. Refusing is always safer than guessing —
 * resolving this wrong could create a second base mint or a duplicate pool.
 */
export class ResumeError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("RESUME_ERROR", message, details);
  }
}

/** Never include keys, mnemonics, or RPC credentials in error payloads. */
const SECRET_KEYS = ["privatekey", "mnemonic", "secret", "password", "apikey", "api_key"];

export function sanitizeErrorDetails(
  details: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!details) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SECRET_KEYS.some((s) => key.toLowerCase().includes(s))) continue;
    if (value === null) out[key] = null;
    else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else out[key] = "[redacted]";
  }
  return out;
}

export function toErrorPayload(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof AdaptiveError) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: "CONFIGURATION_ERROR", message: err.message };
  return { code: "CONFIGURATION_ERROR", message: "Unknown error" };
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  launchId?: string;
  strategyId?: string;
  configAddress?: string;
  poolAddress?: string;
  transactionSignature?: string;
  [key: string]: string | number | boolean | null | undefined;
}

/** Minimal structured logger. Never pass secrets in fields. */
export function log(level: LogLevel, message: string, fields: LogFields = {}): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const line = JSON.stringify(record);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}
