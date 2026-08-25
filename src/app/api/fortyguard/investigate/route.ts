import { FortyGuardError, submitJob } from "@/lib/fortyguard/client";

export const runtime = "nodejs";

type RequestBody = { latitude?: number; longitude?: number; temperatureF?: number };

const problem = (message: string, status = 400) => Response.json({ error: message }, { status });

export async function POST(request: Request) {
  let body: RequestBody;
  try { body = await request.json(); } catch { return problem("A JSON body is required."); }
  const { latitude, longitude, temperatureF } = body;
  if (![latitude, longitude, temperatureF].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return problem("latitude, longitude, and temperatureF must be finite numbers.");
  }
  if (latitude! < 24 || latitude! > 50 || longitude! < -125 || longitude! > -66) {
    return problem("This prototype only submits locations in the continental United States.");
  }

  const now = new Date(Date.now() - 60 * 60 * 1000);
  now.setUTCMinutes(0, 0, 0);
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16);
  const dateTime = { start_date: date, start_time: time, filter_type: 1 };
  const temperatureC = (temperatureF! - 32) * (5 / 9);

  try {
    const [environment, satellite] = await Promise.all([
      submitJob("/env_params", { latitude, longitude, temperature: temperatureC, date_time: dateTime }),
      submitJob("/satellite", { sat: { latitude, longitude }, date_time: dateTime, granularity: 100 }),
    ]);
    return Response.json({
      submittedAt: now.toISOString(),
      jobs: [
        { kind: "environment", activityId: environment, label: "Atmospheric conditions" },
        { kind: "satellite", activityId: satellite, label: "Surface segmentation" },
      ],
    });
  } catch (error) {
    const known = error instanceof FortyGuardError ? error : null;
    return problem(known?.message ?? "Unable to submit the live investigation.", known?.status ?? 502);
  }
}
