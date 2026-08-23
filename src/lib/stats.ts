export function percentileValue(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export function iqr(values: number[]): { q1: number; q3: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return { q1: percentileValue(sorted, 25), q3: percentileValue(sorted, 75) };
}
