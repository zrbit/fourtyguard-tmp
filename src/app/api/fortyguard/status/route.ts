import { FortyGuardError, jobStatus } from "@/lib/fortyguard/client";
import { removeJob, saveResult } from "@/lib/fortyguard/jobStore";

export const runtime = "nodejs";

function compactResult(kind: string, result: Record<string, unknown> | undefined) {
  if (!result) return null;
  if (kind === "heatmap") return { stats: result.stats_data ?? null, mapData: result.map_data ?? null };
  if (kind === "environment") return { metadata: result.metadata ?? null, parameters: result.parameters ?? null, solarIrradiance: result.solar_irradiance ?? null };
  if (kind === "satellite") {
    const segmentation = result.segmentation as Record<string, unknown> | undefined;
    return { imageYear: result.image_year ?? null, segments: segmentation?.segments ?? null, processingSeconds: segmentation?.processing_time_seconds ?? null };
  }
  if (kind === "streetview") {
    const compactView = (view: unknown) => {
      if (!view || typeof view !== "object") return null;
      const data = view as Record<string, unknown>;
      return { segments: data.segments ?? null, imageDate: data.image_date ?? null };
    };
    // Exclude Base64 source/segmented images: the client only needs measured
    // coverage, and this keeps the response compact and privacy-conscious.
    return { front: compactView(result.front), back: compactView(result.back) };
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const activityId = url.searchParams.get("activityId");
  const kind = url.searchParams.get("kind") ?? "unknown";
  if (!activityId || !/^[\w-]{8,}$/.test(activityId)) return Response.json({ error: "A valid activityId is required." }, { status: 400 });
  try {
    const body = await jobStatus(activityId);
    const data = body.data ?? {};
    const status = typeof data.status === "string" ? data.status : "Processing";
    const message = typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message
      : null;
    const result = status === "Completed" ? compactResult(kind, data.result as Record<string, unknown> | undefined) : null;
    if (status === "Completed") {
      const heatmap = result as { mapData?: { features?: unknown[] } } | null;
      if (kind === "heatmap" && (!heatmap?.mapData?.features || heatmap.mapData.features.length === 0)) removeJob(activityId);
      else saveResult(activityId, result);
    }
    return Response.json({ status, result, message });
  } catch (error) {
    // Upstream no longer recognizes this job (or it is otherwise unusable),
    // so do not keep serving the same broken ID from the durable cache.
    removeJob(activityId);
    const known = error instanceof FortyGuardError ? error : null;
    return Response.json({ error: known?.message ?? "Unable to check job status." }, { status: known?.status ?? 502 });
  }
}
