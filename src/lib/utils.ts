import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSigned(n: number, digits = 1): string {
  const rounded = Number(n.toFixed(digits));
  const value = rounded.toFixed(digits);
  return rounded > 0 ? `+${value}` : value;
}

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Thermal color is reserved for anomalies that actually differ from the
 * nearby baseline — a ±0.3°F wobble reads as neutral, not "hot." Keeping
 * this in one place is what keeps every anomaly readout (quick-read badge,
 * map chips, distribution marker) agreeing with each other.
 */
const ANOMALY_DEADBAND = 1.0;

export function thermalTone(diff: number): "hot" | "cold" | "neutral" {
  if (diff > ANOMALY_DEADBAND) return "hot";
  if (diff < -ANOMALY_DEADBAND) return "cold";
  return "neutral";
}

export function thermalColor(diff: number): string {
  const tone = thermalTone(diff);
  return tone === "hot"
    ? "var(--thermal-hot)"
    : tone === "cold"
      ? "var(--thermal-cold)"
      : "var(--thermal-neutral)";
}
