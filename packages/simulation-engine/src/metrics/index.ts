/** Deterministic aggregate metrics derived from a simulated path. */
export function summarizePath(
  points: { price: number; liquidity: number; volume: number }[],
): { avgPrice: number; peakLiquidity: number; totalVolume: number; maxDrawdown: number } {
  if (points.length === 0) return { avgPrice: 0, peakLiquidity: 0, totalVolume: 0, maxDrawdown: 0 };
  const avgPrice = points.reduce((sum, p) => sum + p.price, 0) / points.length;
  const peakLiquidity = Math.max(...points.map((p) => p.liquidity));
  const totalVolume = points.reduce((sum, p) => sum + p.volume, 0);
  let peak = points[0].price;
  let maxDrawdown = 0;
  for (const p of points) {
    if (p.price > peak) peak = p.price;
    const dd = peak === 0 ? 0 : (peak - p.price) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  return {
    avgPrice: Math.round(avgPrice * 1_000_000) / 1_000_000,
    peakLiquidity: Math.round(peakLiquidity * 100) / 100,
    totalVolume: Math.round(totalVolume * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10_000) / 10_000,
  };
}
