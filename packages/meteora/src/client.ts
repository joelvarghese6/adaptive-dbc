import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Connection } from "@solana/web3.js";

export const DEVNET_RPC_URL = "https://api.devnet.solana.com";

export function createMeteoraClient(rpcUrl: string = DEVNET_RPC_URL) {
  const connection = new Connection(rpcUrl, "confirmed");
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  return { connection, client };
}
