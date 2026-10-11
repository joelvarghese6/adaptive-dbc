import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import type { AssetProfile } from "@adaptive/shared";
import {
  DEFAULT_QUOTE_MINT,
  derivePoolAddress,
  deployLaunch,
  toMeteoraError,
} from "./create-pool.js";
import type { DeployLaunchInput } from "./types.js";

const asset: AssetProfile = {
  name: "Adaptive Real Estate",
  symbol: "ARE",
  assetType: "RWA",
  totalSupply: 1_000_000_000,
  decimals: 9,
};

function baseInput(overrides: Partial<DeployLaunchInput> = {}): DeployLaunchInput {
  return {
    launchId: "test-launch",
    strategyId: "RWA_LONG_V1",
    asset,
    name: asset.name,
    symbol: asset.symbol,
    configParameters: {
      migrationOption: 1,
      migrationFee: { feePercentage: 0.25, creatorFeePercentage: 0 },
    },
    ...overrides,
  };
}

describe("meteora create-pool", () => {
  it("derives a deterministic pool address", () => {
    const baseMint = Keypair.generate().publicKey.toBase58();
    const config = Keypair.generate().publicKey.toBase58();
    const first = derivePoolAddress(DEFAULT_QUOTE_MINT, baseMint, config);
    const second = derivePoolAddress(DEFAULT_QUOTE_MINT, baseMint, config);
    assert.equal(first, second);
    assert.match(first, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  it("rejects a fractional migration fee before creating a mint", async () => {
    await assert.rejects(
      () => deployLaunch(baseInput(), Keypair.generate()),
      /whole percentage/,
    );
  });

  it("rejects a config missing migration fee settings", async () => {
    await assert.rejects(
      () => deployLaunch(baseInput({ configParameters: { migrationOption: 1 } }), Keypair.generate()),
      /migration fee settings/,
    );
  });

  it("normalizes unknown errors to MeteoraError", () => {
    assert.equal(toMeteoraError(new Error("boom")).code, "METEORA_ERROR");
    assert.equal(toMeteoraError("boom").code, "METEORA_ERROR");
  });
});
