const API_ROOT = "https://api.fortyguard.com/v1";

export class FortyGuardError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FortyGuardError";
  }
}

function apiKey() {
  // `api_key` supports the hackathon-provided .env name; the documented
  // FORTYGUARD_API_KEY is preferred for deployments. Neither reaches the client.
  const key = process.env.FORTYGUARD_API_KEY ?? process.env.api_key;
  if (!key) throw new FortyGuardError("Missing FortyGuard API key. Add FORTYGUARD_API_KEY to .env.");
  return key;
}

function trainingApiKey() {
  const key = process.env.FORTYGUARD_TRAINING_API_KEY_3
    ?? process.env.FORTYGUARD_TRAINING_API_KEY_2
    ?? process.env.FORTYGUARD_TRAINING_API_KEY;
  if (!key) throw new FortyGuardError("Missing FortyGuard training API key.");
  return key;
}

async function request(path: string, init?: RequestInit, key = apiKey()) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { "api-key": key, "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    throw new FortyGuardError(body?.message ?? `FortyGuard request failed (${response.status}).`, response.status);
  }
  return body as { data?: Record<string, unknown> };
}

export async function submitJob(path: string, payload: unknown) {
  const body = await request(path, { method: "POST", body: JSON.stringify(payload) });
  const activityId = body.data?.activity_id;
  if (typeof activityId !== "string") throw new FortyGuardError("FortyGuard did not return an activity ID.");
  return activityId;
}

export async function jobStatus(activityId: string) {
  return request(`/status/${encodeURIComponent(activityId)}`);
}

/** Paid collection path, isolated from the key used by the live app. */
export async function submitTrainingJob(path: string, payload: unknown) {
  const body = await request(path, { method: "POST", body: JSON.stringify(payload) }, trainingApiKey());
  const activityId = body.data?.activity_id;
  if (typeof activityId !== "string") throw new FortyGuardError("FortyGuard did not return an activity ID.");
  return activityId;
}

export async function trainingJobStatus(activityId: string) {
  return request(`/status/${encodeURIComponent(activityId)}`, undefined, trainingApiKey());
}

export function localAoi(latitude: number, longitude: number) {
  // Roughly a 1 km² study area in the continental US: deliberately far below
  // the documented 50 mi² Premium limit, while wide enough for nearby controls.
  const latDelta = 0.005;
  const lngDelta = 0.006;
  const ring = [
    [longitude - lngDelta, latitude - latDelta],
    [longitude + lngDelta, latitude - latDelta],
    [longitude + lngDelta, latitude + latDelta],
    [longitude - lngDelta, latitude + latDelta],
    [longitude - lngDelta, latitude - latDelta],
  ];
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
}
