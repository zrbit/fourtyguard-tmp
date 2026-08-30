import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reads the static JSON produced by ml/src/serve/export_percell_for_app.py
 * (Tier 2): per-AOI "why is this block hot" summaries plus two real
 * representative cells (hottest, coolest anomaly) per AOI, each broken down
 * by SHAP contribution into three categories -- actionable (a city could
 * change it), geographic_context (fixed, not actionable), weather_context
 * (today's conditions, not actionable either, but for a different reason).
 *
 * Deliberately NOT all ~103K cells -- see the Python export's docstring for
 * why. A true "click any point, get its real cell" experience needs a live
 * nearest-cell spatial lookup, not built yet; this covers the 80 collected
 * AOIs only, same scope as Tier 1's ml-explain / training-coverage data.
 *
 * Server-side only (uses Node's `fs`), same convention as mlExplain.ts.
 */

const CELL_ATTRIBUTION_PATH = join(process.cwd(), "src", "lib", "mock-data", "cell-attribution.json");

export type BreakdownCategory = "actionable" | "geographic_context" | "weather_context" | "other";

export type BreakdownItem = {
  feature: string;
  label: string;
  pct: number;
  direction: "warmer" | "cooler" | "neutral";
  category: BreakdownCategory;
};

export type CellExample = {
  label: "hottest" | "coolest";
  lat: number;
  lng: number;
  dateTime: string;
  cellAnomaly: number;
  breakdown: BreakdownItem[];
};

export type AoiCellSummary = {
  category: string;
  nCells: number;
  topDriverPct: { actionable: number; geographic_context: number; weather_context: number };
};

type CellAttributionData = {
  generatedAt: string;
  modelVersion: string;
  cvMae: number | null;
  cvR2: number | null;
  nCellsTotal: number;
  overallTopDriverPct: { actionable: number; geographic_context: number; weather_context: number };
  perAoi: Record<string, AoiCellSummary>;
  examples: Record<string, CellExample[]>;
};

let cached: CellAttributionData | null | undefined;

function load(): CellAttributionData | null {
  if (cached !== undefined) return cached;
  try {
    const raw = readFileSync(CELL_ATTRIBUTION_PATH, "utf-8");
    cached = JSON.parse(raw) as CellAttributionData;
  } catch {
    cached = null; // export not run yet -- callers handle null gracefully
  }
  return cached;
}

export function getCellAttributionModelInfo() {
  const data = load();
  if (!data) return null;
  return {
    modelVersion: data.modelVersion,
    cvMae: data.cvMae,
    cvR2: data.cvR2,
    nCellsTotal: data.nCellsTotal,
    overallTopDriverPct: data.overallTopDriverPct,
  };
}

export function getCellAttributionForAoi(aoiName: string): { summary: AoiCellSummary; examples: CellExample[] } | null {
  const data = load();
  if (!data) return null;
  const summary = data.perAoi[aoiName];
  const examples = data.examples[aoiName];
  if (!summary || !examples) return null;
  return { summary, examples };
}

/** All AOI names that have Tier 2 cell-attribution data, for callers that
 * need to check availability before rendering (e.g. dim/disable a map
 * tile that has no Tier 2 data yet even though it has Tier 1 data). */
export function getCellAttributionAoiNames(): string[] {
  const data = load();
  return data ? Object.keys(data.perAoi) : [];
}
