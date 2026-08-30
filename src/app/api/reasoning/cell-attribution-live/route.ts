import { getCellAttributionNearestTo } from "@/lib/reasoning/cellAttribution";

export const runtime = "nodejs";

/**
 * Proxies to the local Python live-prediction server (ml/src/serve/
 * live_predict_server.py, run separately: `python -m
 * src.serve.live_predict_server` from ml/) for a REAL per-click Tier 2
 * prediction -- live FortyGuard satellite call (billed to
 * FORTYGUARD_API_KEY) for the trusted canopy anchor, free sources for
 * everything else, real XGBoost + SHAP inference.
 *
 * This is additive, never required: if the Python server isn't running
 * (most likely during normal `npm run dev` use, since it's a second
 * process the developer has to start deliberately), this falls back to
 * the existing nearest-collected-AOI resolution (getCellAttributionNearestTo,
 * same one /api/reasoning/cell-attribution already uses) rather than
 * failing the request. The client (CellAttributionSection.tsx) surfaces
 * which mode it got via `live: boolean` in the response, so the UI can be
 * honest about whether this is a real live computation for the exact
 * clicked point or the nearest analyzed neighborhood's data.
 */

const LIVE_SERVER_URL = "http://127.0.0.1:8787/predict";
const LIVE_SERVER_TIMEOUT_MS = 60_000; // satellite polling can take ~25-40s on a cache miss

export async function POST(request: Request) {
  const { lat, lng } = await request.json().catch(() => ({}));
  if (typeof lat !== "number" || typeof lng !== "number") {
    return Response.json({ error: "Provide numeric lat and lng." }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIVE_SERVER_TIMEOUT_MS);
    const response = await fetch(LIVE_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const result = await response.json();
      return Response.json({ ...result, live: true });
    }
    // Live server responded but with an error (e.g. its own credit safety
    // cap) -- fall through to the nearest-AOI fallback below rather than
    // surfacing a raw 5xx to the user.
  } catch {
    // Live server isn't running / unreachable / timed out -- expected in
    // normal dev unless it's been started deliberately. Fall back below.
  }

  const nearest = getCellAttributionNearestTo(lat, lng);
  if (!nearest) {
    return Response.json({ error: "No live server running and no nearby analyzed AOI found." }, { status: 404 });
  }
  return Response.json({
    aoi: nearest.aoi,
    summary: nearest.summary,
    examples: nearest.examples,
    live: false,
  });
}
