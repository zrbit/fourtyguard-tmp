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

const PERIOD_HOURS_UTC = { day: 20, night: 8 } as const;

export async function POST(request: Request) {
  const { city, period } = await request.json().catch(() => ({}));
  if (typeof city !== "string" || !(city in STUDY_AREAS)) return Response.json({ error: "Unsupported US study area." }, { status: 400 });
  if (period !== "day" && period !== "night") return Response.json({ error: "Choose either the day or night thermal scan." }, { status: 400 });
  const scanPeriod = period as keyof typeof PERIOD_HOURS_UTC;
  const jobKey = `${city}:${scanPeriod}`;
  const existing = activeJob(jobKey);
  if (existing) return Response.json({ activityId: existing.activityId, reused: true, result: existing.result ?? null });
  const [west, south, east, north] = STUDY_AREAS[city as keyof typeof STUDY_AREAS];
  // Request the latest completed scan for the selected thermal period. The
  // two periods stay deliberately distinct so their jobs and cached results
  // can never be confused.
  const now = new Date();
  const scanTime = new Date(now);
  scanTime.setUTCHours(PERIOD_HOURS_UTC[scanPeriod], 0, 0, 0);
  if (scanTime.getTime() > now.getTime() - 2 * 60 * 60 * 1000) scanTime.setUTCDate(scanTime.getUTCDate() - 1);
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
