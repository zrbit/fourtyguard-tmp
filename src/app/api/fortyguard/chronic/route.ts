import { FortyGuardError, localAoi, submitJob } from "@/lib/fortyguard/client";
import { activeJob, saveJob } from "@/lib/fortyguard/jobStore";

export const runtime = "nodejs";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const { latitude, longitude, thresholdC = 32 } = await request.json().catch(() => ({}));
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) ||
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    typeof thresholdC !== "number" || !Number.isFinite(thresholdC) || thresholdC < 20 || thresholdC > 45
  ) {
    return Response.json({ error: "Send valid latitude, longitude, and a threshold between 20°C and 45°C." }, { status: 400 });
  }

  // A completed UTC day avoids treating a partially-arrived hourly raster as
  // a short heat event. This is deliberately a small local AOI: it provides
  // comparable controls without turning a single-cell check into a city job.
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const key = `chronic:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${thresholdC}:${day}`;
  const existing = activeJob(key);
  if (existing && Date.now() - existing.createdAt < MAX_AGE_MS) {
    return Response.json({ activityId: existing.activityId, reused: true, date: day, thresholdC });
  }

  try {
    const activityId = await submitJob("/heatmap", {
      polygon_aoi: localAoi(latitude, longitude),
      date_time: { start_date: day, filter_type: 3 },
      granularity: 100,
      analytic_type: "persistence",
      threshold: thresholdC,
      direction: "above",
    });
    saveJob(key, activityId);
    return Response.json({ activityId, reused: false, date: day, thresholdC });
  } catch (error) {
    const known = error instanceof FortyGuardError ? error : null;
    return Response.json({ error: known?.message ?? "Unable to start the persistence analysis." }, { status: known?.status ?? 502 });
  }
}
