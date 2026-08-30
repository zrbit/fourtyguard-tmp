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
