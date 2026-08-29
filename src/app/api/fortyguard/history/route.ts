import { localAoi, submitJob, FortyGuardError } from "@/lib/fortyguard/client";

export const runtime = "nodejs";

type RequestBody = { latitude?: number; longitude?: number };
type OpenMeteoResponse = { hourly?: { time?: string[]; temperature_2m?: number[] } };

async function historicalAirTemperature(latitude: number, longitude: number, date: string, time: string) {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("hourly", "temperature_2m");
  url.searchParams.set("timezone", "GMT");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}.`);
  const body = await response.json() as OpenMeteoResponse;
  const hourly = body.hourly;
  const index = hourly?.time?.findIndex(value => value === `${date}T${time}`) ?? -1;
  const temperatureC = index >= 0 ? hourly?.temperature_2m?.[index] : undefined;
  return typeof temperatureC === "number" ? Math.round((temperatureC * 9 / 5 + 32) * 10) / 10 : null;
}

export async function POST(request: Request) {
  const { latitude, longitude } = await request.json().catch(() => ({})) as RequestBody;
  if (![latitude, longitude].every(value => typeof value === "number" && Number.isFinite(value))) {
    return Response.json({ error: "latitude and longitude must be finite numbers." }, { status: 400 });
  }
  if (latitude! < 24 || latitude! > 50 || longitude! < -125 || longitude! > -66) {
    return Response.json({ error: "This prototype only supports continental US locations." }, { status: 400 });
  }
  // Both FortyGuard and the weather archive are hourly products; use the
  // latest completed whole UTC hour so every source has an exact timestamp.
  const today = new Date(Date.now() - 60 * 60 * 1000);
  today.setUTCMinutes(0, 0, 0);
  const years = [today.getUTCFullYear() - 1, today.getUTCFullYear() - 2, today.getUTCFullYear() - 3];
  const monthDay = today.toISOString().slice(5, 10);
  const time = today.toISOString().slice(11, 16);
  const polygon_aoi = localAoi(latitude!, longitude!);
  try {
    const [jobs, weather] = await Promise.all([
      Promise.all(years.map(async year => ({
        year,
        activityId: await submitJob("/heatmap", {
          polygon_aoi,
          date_time: { start_date: `${year}-${monthDay}`, start_time: time, filter_type: 1 },
          granularity: 100,
          analytic_type: "tcm",
        }),
      }))),
      Promise.all(years.map(async year => {
        const date = `${year}-${monthDay}`;
        try { return { year, temperatureF: await historicalAirTemperature(latitude!, longitude!, date, time) }; }
        catch { return { year, temperatureF: null }; }
      })),
    ]);
    return Response.json({ jobs, weather, comparison: `Same calendar day and UTC hour: ${monthDay} ${time}` });
  } catch (error) {
    const known = error instanceof FortyGuardError ? error : null;
    return Response.json({ error: known?.message ?? "Unable to submit historical heatmaps." }, { status: known?.status ?? 502 });
  }
}
