import { FortyGuardError, submitJob } from "@/lib/fortyguard/client";
import { activeJob, saveJob } from "@/lib/fortyguard/jobStore";

export const runtime = "nodejs";

export const STUDY_AREAS = {
  // Compact neighbourhood windows keep the tile count small. At the
  // documented 100 m (fastest) resolution these produce a focused local
  // comparison rather than a slow city-scale batch job.
  "Los Angeles": [-118.255, 34.045, -118.235, 34.063],
  Chicago: [-87.64, 41.875, -87.62, 41.892],
  "New York City": [-73.995, 40.705, -73.975, 40.722],
} as const;

const CITY_TIME_ZONES = {
  "Los Angeles": "America/Los_Angeles",
  Chicago: "America/Chicago",
  "New York City": "America/New_York",
} as const;

// Noon and midnight are intentionally interpreted in each selected city's
// local time zone before being converted to the UTC timestamp FortyGuard needs.
const PERIOD_HOURS_LOCAL = { day: 12, night: 0 } as const;

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

function latestCompletedLocalScan(city: keyof typeof STUDY_AREAS, period: keyof typeof PERIOD_HOURS_LOCAL) {
  const timeZone = CITY_TIME_ZONES[city];
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

export async function POST(request: Request) {
  const { city, period } = await request.json().catch(() => ({}));
  if (typeof city !== "string" || !(city in STUDY_AREAS)) return Response.json({ error: "Unsupported US study area." }, { status: 400 });
  if (period !== "day" && period !== "night") return Response.json({ error: "Choose either the day or night thermal scan." }, { status: 400 });
  const scanPeriod = period as keyof typeof PERIOD_HOURS_LOCAL;
  const jobKey = `${city}:${scanPeriod}`;
  const existing = activeJob(jobKey);
  if (existing) return Response.json({ activityId: existing.activityId, reused: true, result: existing.result ?? null });
  const [west, south, east, north] = STUDY_AREAS[city as keyof typeof STUDY_AREAS];
  // Request each city's latest completed local-afternoon or local-night scan,
  // then convert it to UTC for the provider. The two periods stay deliberately
  // distinct so their jobs and cached results can never be confused.
  const scanTime = latestCompletedLocalScan(city as keyof typeof STUDY_AREAS, scanPeriod);
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
