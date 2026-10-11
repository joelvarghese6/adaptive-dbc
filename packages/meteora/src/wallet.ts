import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { WalletError } from "@adaptive/shared";

/**
 * Load a Solana keypair from `SOLANA_PRIVATE_KEY`.
 * Accepts a JSON array of numbers (e.g. `[1,2,...]`) or a base58 string.
 * Never logs the key material.
 */
export function loadKeypairFromEnv(env: NodeJS.ProcessEnv = process.env): Keypair {
  const raw = env["SOLANA_PRIVATE_KEY"];
  if (!raw || raw.trim().length === 0)
    throw new WalletError(
      "SOLANA_PRIVATE_KEY is not set. Export your devnet wallet private key to deploy.",
    );
  return parsePrivateKey(raw.trim());
}

export function parsePrivateKey(raw: string): Keypair {
  try {
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) throw new Error("not an array");
      return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
    }
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    throw new WalletError(
      "SOLANA_PRIVATE_KEY is invalid. Provide a base58 string or JSON array of bytes.",
    );
  }
}

export function getRpcUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env["SOLANA_RPC_URL"];
  if (url && url.trim().length > 0) return url.trim();
  return "https://api.devnet.solana.com";
}
