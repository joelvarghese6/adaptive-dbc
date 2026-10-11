// Typed errors. Route handlers normalize unknown throws into these;
// blockchain errors are never swallowed and never leak secrets.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "WALLET_ERROR"
  | "RPC_ERROR"
  | "TRANSACTION_ERROR"
  | "METEORA_ERROR"
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

export class SimulationError extends AdaptiveError {
  constructor(message: string, details?: Record<string, string | number | boolean | null>) {
    super("SIMULATION_ERROR", message, details);
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
