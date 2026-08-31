import {
  getMlAttributionForDemoBlock,
  getMlEvidenceNearestTo,
  getMlModelInfo,
} from "@/lib/reasoning/mlExplain";

export const runtime = "nodejs";

/**
 * Serves the precomputed XGBoost + SHAP evidence (Phase 8, static pass --
 * see ml/README.md). Reads a static JSON file on disk; no live Python, no
 * network call. Two lookup modes, since the app has two different reasoning
 * paths with no shared id scheme:
 *  - ?blockId=  the 14 hand-authored demo blocks (src/lib/mock-data/blocks.ts)
 *  - ?lat=&lng=  nearest-neighbor to a collected LA AOI, for the
 *    live homepage's per-cell FortyGuard heatmap flow (src/app/page.tsx)
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const blockId = params.get("blockId");
  const lat = params.get("lat");
  const lng = params.get("lng");

  if (blockId) {
    const attribution = getMlAttributionForDemoBlock(blockId);
    if (!attribution) return Response.json({ error: "No ML evidence available for this block yet." }, { status: 404 });
    return Response.json({ ...attribution, model: getMlModelInfo() });
  }

  if (lat && lng) {
    const nearest = getMlEvidenceNearestTo(Number(lat), Number(lng));
    if (!nearest) return Response.json({ error: "No collected AOI is close enough to this location." }, { status: 404 });
    return Response.json({
      evidence: nearest.evidence,
      predictedAnomaly: nearest.predictedAnomaly,
      decompositionResidual: nearest.decompositionResidual,
      nearestAoi: nearest.aoi,
      model: getMlModelInfo(),
    });
  }

  return Response.json({ error: "Provide either blockId, or both lat and lng." }, { status: 400 });
}
