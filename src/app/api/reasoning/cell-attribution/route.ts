import { getCellAttributionNearestTo, getCellAttributionModelInfo } from "@/lib/reasoning/cellAttribution";

export const runtime = "nodejs";

/**
 * Serves Tier 2's precomputed per-cell attribution (ml/src/serve/
 * export_percell_for_app.py). Same shape of compromise as
 * /api/reasoning/ml-explain: a live homepage click has no shared id with
 * the collected AOIs, so this resolves to the nearest analyzed
 * neighborhood's Tier 2 summary + example cells -- not a live per-cell
 * computation for the exact clicked point (that needs a real spatial
 * index over ~103K cells; not built).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = params.get("lat");
  const lng = params.get("lng");

  if (!lat || !lng) {
    return Response.json({ error: "Provide both lat and lng." }, { status: 400 });
  }

  const nearest = getCellAttributionNearestTo(Number(lat), Number(lng));
  if (!nearest) {
    return Response.json({ error: "No AOI with Tier 2 data is close enough to this location." }, { status: 404 });
  }

  return Response.json({
    aoi: nearest.aoi,
    summary: nearest.summary,
    examples: nearest.examples,
    model: getCellAttributionModelInfo(),
  });
}
