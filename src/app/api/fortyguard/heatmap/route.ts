import { FortyGuardError, submitJob } from "@/lib/fortyguard/client";
import { activeJob, saveJob } from "@/lib/fortyguard/jobStore";

export const runtime = "nodejs";

export const STUDY_AREAS = {
  // Compact neighbourhood windows keep the tile count small. At the
  // documented 100 m (fastest) resolution these produce a focused local
  // comparison rather than a slow city-scale batch job.
  // Van Nuys, San Fernando Valley. Chosen over other Valley AOIs in
  // ml/src/collect/aoi_sampling.py because "valley_dense_mixed" already has
  // real training coverage (dense multifamily, surface parking, and some
  // canopy in one small area). Widened west (~4.7 km x 2 km overall, up
  // from the original ~1.85 km x 2 km Van Nuys-only box) to pull in part of
  // the Sepulveda Basin / Lake Balboa recreation area — golf courses, the
  // lake, and tree cover — so the demo shows a real hot/cool contrast
  // between dense Van Nuys blocks and clearly vegetated ones, not just a
  // uniformly dense sample.
  "Los Angeles": [-118.492, 34.1777, -118.4387, 34.1957],
  Chicago: [-87.64, 41.875, -87.62, 41.892],
  "New York City": [-73.995, 40.705, -73.975, 40.722],
} as const;

const CITY_TIME_ZONES = {
  "Los Angeles": "America/Los_Angeles",
  Chicago: "America/Chicago",
  "New York City": "America/New_York",
} as const;

// Custom (user-searched) areas don't carry their own time zone -- the address
// search that feeds this is LA-biased (see /api/geocode), and the whole
// product is an LA demo, so Pacific time is the reasonable default rather
// than plumbing a geocoded time zone lookup for a hackathon-scope feature.
const CUSTOM_AREA_TIME_ZONE = "America/Los_Angeles";

// Noon and midnight are intentionally interpreted in each selected city's
// local time zone before being converted to the UTC timestamp FortyGuard needs.
const PERIOD_HOURS_LOCAL = { day: 12, night: 0 } as const;

// Sanity bounds for a user-searched custom bbox -- this endpoint spends real
// FortyGuard credits, so unlike the three fixed STUDY_AREAS boxes (trusted,
// hardcoded), client-supplied coordinates need validation against abuse
// (someone hand-crafting a request outside the UI) as well as against
// accidental degenerate boxes. ~150m floor keeps a handful of 100m cells;
// ~3km ceiling keeps a single search well under the fixed cities' own box
// sizes (the LA study area is ~4.7km x 2km already).
const MIN_BOX_DEG = 0.0015;
const MAX_BOX_DEG = 0.03;

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)])) as Record<"year" | "month" | "day" | "hour", number>;
}

function localTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour);
  const local = localParts(new Date(guess), timeZone);
  const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour) - guess;
  return new Date(guess - offset);
}

function latestCompletedLocalScan(timeZone: string, period: keyof typeof PERIOD_HOURS_LOCAL) {
  const now = new Date();
  const localNow = localParts(now, timeZone);
  let localDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  let scanTime = localTimeToUtc(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate(), PERIOD_HOURS_LOCAL[period], timeZone);
  if (scanTime.getTime() > now.getTime() - 2 * 60 * 60 * 1000) {
    localDate = new Date(localDate.getTime() - 24 * 60 * 60 * 1000);
    scanTime = localTimeToUtc(localDate.getUTCFullYear(), localDate.getUTCMonth() + 1, localDate.getUTCDate(), PERIOD_HOURS_LOCAL[period], timeZone);
  }
  return scanTime;
}

// A finite-number bbox [west, south, east, north] with sane, non-degenerate
// extent. Returns an error string on failure, or null when valid.
function bboxError(bbox: unknown): string | null {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return "A custom area needs a valid [west, south, east, north] bounding box.";
  }
  const [west, south, east, north] = bbox as number[];
  if (east <= west || north <= south) return "Invalid bounding box.";
  const width = east - west;
  const height = north - south;
  if (width < MIN_BOX_DEG || height < MIN_BOX_DEG) return "That search area is too small to scan.";
  if (width > MAX_BOX_DEG || height > MAX_BOX_DEG) return "That search area is too large -- try a smaller size.";
  if (west < -125 || east > -65 || south < 24 || north > 50) return "Custom areas are limited to the continental US for now.";
  return null;
}

function boxKey(bbox: readonly number[]) {
  return bbox.map((n) => n.toFixed(4)).join(",");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { city, period, bbox: customBbox } = body;
  if (period !== "day" && period !== "night") return Response.json({ error: "Choose either the day or night thermal scan." }, { status: 400 });
  const scanPeriod = period as keyof typeof PERIOD_HOURS_LOCAL;

  let west: number, south: number, east: number, north: number, jobKey: string, timeZone: string;
  if (customBbox !== undefined) {
    const invalid = bboxError(customBbox);
    if (invalid) return Response.json({ error: invalid }, { status: 400 });
    [west, south, east, north] = customBbox as number[];
    jobKey = `custom:${boxKey([west, south, east, north])}:${scanPeriod}`;
    timeZone = CUSTOM_AREA_TIME_ZONE;
  } else {
    if (typeof city !== "string" || !(city in STUDY_AREAS)) return Response.json({ error: "Unsupported US study area." }, { status: 400 });
    [west, south, east, north] = STUDY_AREAS[city as keyof typeof STUDY_AREAS];
    jobKey = `${city}:${scanPeriod}`;
    timeZone = CITY_TIME_ZONES[city as keyof typeof CITY_TIME_ZONES];
  }

  const existing = activeJob(jobKey);
  if (existing) return Response.json({ activityId: existing.activityId, reused: true, result: existing.result ?? null });
  // Request the latest completed local-afternoon or local-night scan, then
  // convert it to UTC for the provider. The two periods stay deliberately
  // distinct so their jobs and cached results can never be confused.
  const scanTime = latestCompletedLocalScan(timeZone, scanPeriod);
  try {
    const activityId = await submitJob("/heatmap", {
      polygon_aoi: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } }] },
      date_time: { start_date: scanTime.toISOString().slice(0, 10), start_time: scanTime.toISOString().slice(11, 16), filter_type: 1 },
      granularity: 100,
      analytic_type: "tcm",
    });
    saveJob(jobKey, activityId);
    return Response.json({ activityId, reused: false });
  } catch (error) {
    const known = error instanceof FortyGuardError ? error : null;
    return Response.json({ error: known?.message ?? "Unable to submit live heatmap." }, { status: known?.status ?? 502 });
  }
}
