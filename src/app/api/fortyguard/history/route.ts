import { submitJob, FortyGuardError } from "@/lib/fortyguard/client";
import { STUDY_AREAS } from "@/app/api/fortyguard/heatmap/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { city } = await request.json().catch(() => ({}));
  if (typeof city !== "string" || !(city in STUDY_AREAS)) return Response.json({ error: "Unsupported US study area." }, { status: 400 });
  const [west, south, east, north] = STUDY_AREAS[city as keyof typeof STUDY_AREAS];
  const today = new Date();
  const years = [today.getUTCFullYear() - 1, today.getUTCFullYear() - 2, today.getUTCFullYear() - 3];
  const monthDay = today.toISOString().slice(5, 10);
  const time = today.toISOString().slice(11, 16);
  const polygon_aoi = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } }] };
  try {
    const jobs = await Promise.all(years.map(async year => ({ year, activityId: await submitJob("/heatmap", { polygon_aoi, date_time: { start_date: `${year}-${monthDay}`, start_time: time, filter_type: 1 }, granularity: 100, analytic_type: "tcm" }) })));
    return Response.json({ jobs, comparison: `Same local date and UTC hour: ${monthDay} ${time}` });
  } catch (error) {
    const known = error instanceof FortyGuardError ? error : null;
    return Response.json({ error: known?.message ?? "Unable to submit historical heatmaps." }, { status: known?.status ?? 502 });
  }
}
