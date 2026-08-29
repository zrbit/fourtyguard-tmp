import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Evidence, ThermalAnalysis } from "@/types/thermal";

/**
 * Reads the static JSON produced by ml/src/serve/export_for_app.py (Phase 8,
 * precomputed pass): XGBoost + SHAP explanations for the 14 demo blocks and
 * the collected live LA grid. No network calls, no Python at runtime here —
 * that's the point of the precomputed-first approach. Uses Node's `fs`
 * directly (not the `server-only` npm package, which this project doesn't
 * depend on) — callers must be server-side (API routes / server components),
 * same convention as lib/fortyguard/*.
 *
 * Additive only: withMlEvidence() appends modelled evidence after the
 * existing deterministic analyzeBlock() output, never replacing or
 * reordering it, so no UI component needs to change for this pass.
 */

const EXPLANATIONS_PATH = join(process.cwd(), "src", "lib", "mock-data", "ml-explanations.json");

type MlEvidenceItem = {
  id: string;
  category: Evidence["category"];
  metric: string;
  targetValue: number | string;
  warmingEffect: "warmer" | "cooler" | "neutral";
  source: string;
  provenance: "modelled";
  strength: Evidence["strength"];
  shapValue: number;
  explanation: string;
};

type MlBlockEntry = {
  predictedAnomaly: number;
  features: Record<string, number>;
  evidence: MlEvidenceItem[];
};

type MlLiveGridCell = {
  aoi: string;
  category: string;
  lat: number;
  lng: number;
  dateTime: string;
  actualAnomaly: number;
  predictedAnomaly: number;
  evidence: MlEvidenceItem[];
};

type MlExplanations = {
  generatedAt: string;
  modelVersion: string;
  cvMae: number | null;
  cvR2: number | null;
  featureColumns: string[];
  demoBlocks: Record<string, MlBlockEntry>;
  liveGrid: MlLiveGridCell[];
};

// undefined = not yet attempted; null = file absent or unreadable (expected
// until export_for_app.py has been run against real collected data).
let cache: MlExplanations | null | undefined;

function load(): MlExplanations | null {
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(readFileSync(EXPLANATIONS_PATH, "utf8")) as MlExplanations;
  } catch {
    cache = null;
  }
  return cache;
}

function toEvidence(item: MlEvidenceItem): Evidence {
  return {
    id: item.id,
    category: item.category,
    metric: item.metric,
    targetValue: item.targetValue,
    warmingEffect: item.warmingEffect,
    source: item.source,
    provenance: "modelled",
    strength: item.strength,
    explanation: item.explanation,
  };
}

export function getMlModelInfo() {
  const data = load();
  if (!data) return null;
  return {
    modelVersion: data.modelVersion,
    generatedAt: data.generatedAt,
    cvMae: data.cvMae,
    cvR2: data.cvR2,
  };
}

export function getMlEvidenceForDemoBlock(blockId: string): Evidence[] | null {
  const entry = load()?.demoBlocks[blockId];
  return entry ? entry.evidence.map(toEvidence) : null;
}

export function getMlLiveGrid(): MlLiveGridCell[] {
  return load()?.liveGrid ?? [];
}

// ~0.25 deg is roughly 25-28km at LA's latitude -- generous enough to catch
// live cells within/near a collected AOI, tight enough to correctly return
// nothing for Chicago/NYC cells (this model only covers LA).
const NEAREST_AOI_MAX_DEGREES = 0.25;

/**
 * The live homepage (src/app/page.tsx) works off individual ~100m FortyGuard
 * heatmap cells (id `live-N`), not the 14 hand-authored demo block ids --
 * there's no shared key between the two. This bridges them spatially:
 * nearest-neighbor by lat/lng to one of the 17 AOIs actually collected
 * (ml/README.md), so a live cell shows "the nearest analyzed neighborhood's"
 * attribution rather than nothing. Returns null beyond the distance cutoff.
 */
export function getMlEvidenceNearestTo(
  lat: number,
  lng: number,
): { aoi: string; distanceDegrees: number; evidence: Evidence[] } | null {
  const grid = getMlLiveGrid();
  if (!grid.length) return null;
  let nearest: MlLiveGridCell | null = null;
  let nearestDistance = Infinity;
  for (const cell of grid) {
    const distance = Math.hypot(cell.lat - lat, cell.lng - lng);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = cell;
    }
  }
  if (!nearest || nearestDistance > NEAREST_AOI_MAX_DEGREES) return null;
  return { aoi: nearest.aoi, distanceDegrees: nearestDistance, evidence: nearest.evidence.map(toEvidence) };
}

/** Appends modelled evidence for `blockId` to `analysis.evidence`, if any is
 * available. Returns `analysis` unchanged (same reference) when the model
 * hasn't been trained yet or has nothing for this block, so callers can
 * always run this unconditionally. */
export function withMlEvidence(analysis: ThermalAnalysis, blockId: string): ThermalAnalysis {
  const mlEvidence = getMlEvidenceForDemoBlock(blockId);
  if (!mlEvidence || mlEvidence.length === 0) return analysis;
  return { ...analysis, evidence: [...analysis.evidence, ...mlEvidence] };
}
