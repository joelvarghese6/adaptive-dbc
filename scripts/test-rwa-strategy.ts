import {
    createRwaLongStrategy,
    type AssetProfile,
  } from "@adaptive/strategy-engine";
  
  import { buildRwaLongConfig } from "@adaptive/meteora";
  
  const asset: AssetProfile = {
    name: "Adaptive Real Estate",
    symbol: "ARE",
    assetType: "RWA",
  
    totalSupply: 1_000_000_000,
    decimals: 9,
  
    referencePrice: 0.001,
    targetLiquidity: 100_000,
  };
  
  const strategy = createRwaLongStrategy(asset);
  
  console.log("\n=== ASSET ===");
  console.dir(asset, { depth: null });
  
  console.log("\n=== STRATEGY ===");
  console.dir(strategy, { depth: null });
  
  const config = buildRwaLongConfig(
    asset,
    strategy,
  );
  
  console.log("\n=== METEORA CONFIG ===");
  console.dir(config, { depth: null });