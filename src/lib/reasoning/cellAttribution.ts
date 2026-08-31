import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getMlLiveGrid } from "./mlExplain";

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

// Matches mlExplain.ts's NEAREST_AOI_MAX_DEGREES exactly (~0.25deg, ~25-28km
// at LA's latitude) -- same live-homepage-click problem, same honesty
// tradeoff: a clicked point resolves to its nearest COLLECTED AOI's Tier 2
// data, not a live per-cell computation for the exact clicked point (that
// needs a real spatial index over ~103K cells -- separate, larger, not
// built yet). Duplicated rather than imported from mlExplain.ts since it's
// a private module constant there and this is one small literal, not
// worth the extra coupling.
const NEAREST_AOI_MAX_DEGREES = 0.25;

/**
 * The live homepage works off individual ~100m FortyGuard heatmap cells,
 * not AOI names -- this bridges them spatially, same pattern as
 * mlExplain.ts's getMlEvidenceNearestTo(): nearest-neighbor by lat/lng to
 * one of the 80 AOIs that have Tier 2 data, honestly labeled by the caller
 * as "the nearest analyzed neighborhood," not this exact cell.
 */
export function getCellAttributionNearestTo(
  lat: number,
  lng: number,
): { aoi: string; distanceDegrees: number; summary: AoiCellSummary; examples: CellExample[] } | null {
  const data = load();
  if (!data) return null;

  // AOI centroids, deduped from Tier 1's liveGrid (one row per AOI x
  // date_time, same lat/lng repeated per date_time -- fine for a min-
  // distance search, avoids storing centroids twice across both exports).
  const centroids = new Map<string, { lat: number; lng: number }>();
  for (const cell of getMlLiveGrid()) {
    if (data.perAoi[cell.aoi] && !centroids.has(cell.aoi)) {
      centroids.set(cell.aoi, { lat: cell.lat, lng: cell.lng });
    }
  }

  let nearestAoi: string | null = null;
  let nearestDistance = Infinity;
  for (const [aoi, centroid] of centroids) {
    const distance = Math.hypot(centroid.lat - lat, centroid.lng - lng);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestAoi = aoi;
    }
  }
  if (!nearestAoi || nearestDistance > NEAREST_AOI_MAX_DEGREES) return null;

  const summary = data.perAoi[nearestAoi];
  const examples = data.examples[nearestAoi];
  if (!summary || !examples) return null;
  return { aoi: nearestAoi, distanceDegrees: nearestDistance, summary, examples };
}
