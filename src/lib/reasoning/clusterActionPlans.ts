import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BreakdownItem } from "./cellAttribution";

/**
 * Reads the static JSON produced by ml/src/serve/export_clusters_for_app.py:
 * Tier 2's per-cell predictions aggregated into fixed ~450m geographic
 * tiles, ranked by average temperature anomaly, classified by whether a
 * real actionable lever exists ("priority") or the heat is driven by fixed
 * geography ("geographic") or the tile just isn't notably hot ("typical").
 *
 * Server-side only (uses Node's `fs`), same convention as mlExplain.ts /
 * cellAttribution.ts.
 */

const CLUSTER_ACTION_PLANS_PATH = join(process.cwd(), "src", "lib", "mock-data", "cluster-action-plans.json");

export type PriorityTier = "priority" | "geographic" | "typical";

/** One of five practical site types the Action Feasibility Guard classifies
 * a priority tile into, from OSM road/building/parking/canopy geometry --
 * see ml/src/serve/site_type.py. Determines which interventions are even
 * physically plausible before the tile ever suggests one. */
export type SiteType =
  | "highway_dominated"
  | "surface_parking"
  | "building_dominated"
  | "green_space"
  | "residential_mixed"
  | "mixed_unclassified";

export type ExcludedAction = { action: string; reason: string };

export type ActionPlanTile = {
  tileId: string;
  centroidLat: number;
  centroidLng: number;
  primaryAoi: string;
  nCells: number;
  nRows: number;
  avgCellAnomaly: number;
  topDriverCategory: BreakdownItem["category"];
  priorityTier: PriorityTier;
  breakdown: BreakdownItem[];
  recommendation: string | null;
  // Feasibility Guard fields -- present only for priority tiles that have
  // been screened (ml/src/serve/export_site_types.py); undefined for
  // geographic/typical tiles, or a priority tile screened before this
  // feature existed / whose OSM fetch failed.
  siteType?: SiteType;
  siteTypeLabel?: string;
  suitableActions?: string[];
  excludedActions?: ExcludedAction[];
  requiresFieldVerification?: string[];
};

type ClusterActionPlansData = {
  generatedAt: string;
  modelVersion: string;
  tileSizeM: number;
  minCellsPerTile: number;
  nTiles: number;
  nPriorityTiles: number;
  nGeographicTiles: number;
  nTypicalTiles: number;
  tiles: ActionPlanTile[];
  // Set by ml/src/serve/export_site_types.py once it has run at least once
  // against this file. Absent (undefined) on a fresh Tier-3 export that
  // hasn't been screened yet.
  hasFeasibilityScreen?: boolean;
};

let cached: ClusterActionPlansData | null | undefined;

function load(): ClusterActionPlansData | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(readFileSync(CLUSTER_ACTION_PLANS_PATH, "utf-8")) as ClusterActionPlansData;
  } catch {
    cached = null;
  }
  return cached;
}

export function getClusterActionPlanMeta() {
  const data = load();
  if (!data) return null;
  const { tiles: _tiles, ...meta } = data;
  return meta;
}
export type ClusterActionPlanMeta = NonNullable<ReturnType<typeof getClusterActionPlanMeta>>;

/** All tiles, sorted hottest-first (already sorted this way in the export,
 * re-sorted here defensively in case that ever changes). */
export function getAllActionPlanTiles(): ActionPlanTile[] {
  const data = load();
  if (!data) return [];
  return [...data.tiles].sort((a, b) => b.avgCellAnomaly - a.avgCellAnomaly);
}

export function getActionPlanTilesByTier(tier: PriorityTier): ActionPlanTile[] {
  return getAllActionPlanTiles().filter((t) => t.priorityTier === tier);
}
