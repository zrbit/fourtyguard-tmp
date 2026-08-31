import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type StreetViewData = {
  imageDate: string | null;
  segments: Record<string, unknown> | null;
  originalImage: string | null;
  segmentedImage: string | null;
};

export type ActionPlanImageryState = {
  tileId: string;
  latitude: number;
  longitude: number;
  activityId: string;
  submittedAt: string;
  status: "Processing" | "Completed" | "Failed";
  message?: string | null;
  front?: StreetViewData | null;
  back?: StreetViewData | null;
};

const CACHE_DIR = join(process.cwd(), "ml", "data", "live-cache", "action-plan-streetview");
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;

function safeTileId(tileId: string) {
  if (!/^-?\d+_-?\d+$/.test(tileId)) throw new Error("Invalid action-plan tile ID.");
  return tileId;
}

function statePath(tileId: string) {
  return join(CACHE_DIR, `${safeTileId(tileId)}.json`);
}

function lockPath(tileId: string) {
  return join(CACHE_DIR, `${safeTileId(tileId)}.lock`);
}

export function readActionPlanImagery(tileId: string): ActionPlanImageryState | null {
  try {
    return JSON.parse(readFileSync(statePath(tileId), "utf8")) as ActionPlanImageryState;
  } catch {
    return null;
  }
}

export function writeActionPlanImagery(state: ActionPlanImageryState) {
  const path = statePath(state.tileId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state), "utf8");
}

export function removeActionPlanImagery(tileId: string) {
  rmSync(statePath(tileId), { force: true });
}

/** Atomically prevents two browser clicks from purchasing the same tile. */
export function claimActionPlanImagery(tileId: string): (() => void) | null {
  const path = lockPath(tileId);
  mkdirSync(dirname(path), { recursive: true });
  try {
    if (Date.now() - statSync(path).mtimeMs > LOCK_MAX_AGE_MS) rmSync(path, { force: true });
  } catch {
    // No existing lock.
  }
  try {
    const descriptor = openSync(path, "wx");
    closeSync(descriptor);
    return () => rmSync(path, { force: true });
  } catch {
    return null;
  }
}

