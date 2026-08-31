import { FortyGuardError, submitTrainingJob, trainingJobStatus } from "@/lib/fortyguard/client";
import {
  claimActionPlanImagery,
  readActionPlanImagery,
  removeActionPlanImagery,
  type ActionPlanImageryState,
  type StreetViewData,
  writeActionPlanImagery,
} from "@/lib/fortyguard/actionPlanImageryStore";
import { getActionPlanTilesByTier } from "@/lib/reasoning/clusterActionPlans";

export const runtime = "nodejs";

const problem = (message: string, status = 400) => Response.json({ error: message }, { status });

function priorityTile(tileId: string | null) {
  if (!tileId || !/^-?\d+_-?\d+$/.test(tileId)) return null;
  return getActionPlanTilesByTier("priority").find((tile) => tile.tileId === tileId) ?? null;
}

function imageString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string" && item.length > 0) ?? null;
  return null;
}

function compactView(value: unknown): StreetViewData | null {
  if (!value || typeof value !== "object") return null;
  const view = value as Record<string, unknown>;
  const segmentation = view.segmentation && typeof view.segmentation === "object"
    ? view.segmentation as Record<string, unknown>
    : null;
  return {
    imageDate: typeof view.image_date === "string" ? view.image_date : null,
    segments: view.segments && typeof view.segments === "object" ? view.segments as Record<string, unknown> : null,
    originalImage: imageString(view.original_image ?? view.orignal_image),
    segmentedImage: imageString(view.segmented_image ?? view.image_content ?? segmentation?.image_content),
  };
}

function publicResult(state: ActionPlanImageryState) {
  const publicView = (view: StreetViewData | null | undefined, name: "front" | "back") => view ? {
    imageDate: view.imageDate,
    segments: view.segments,
    originalUrl: view.originalImage ? `/api/action-plan-imagery?tileId=${encodeURIComponent(state.tileId)}&view=${name}&image=original` : null,
    segmentedUrl: view.segmentedImage ? `/api/action-plan-imagery?tileId=${encodeURIComponent(state.tileId)}&view=${name}&image=segmented` : null,
  } : null;
  return {
    tileId: state.tileId,
    latitude: state.latitude,
    longitude: state.longitude,
    status: state.status,
    message: state.message ?? null,
    cached: state.status === "Completed",
    front: publicView(state.front, "front"),
    back: publicView(state.back, "back"),
  };
}

function imageResponse(encoded: string) {
  const match = encoded.match(/^data:(image\/[\w.+-]+);base64,([\s\S]*)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  const bytes = Buffer.from(match?.[2] ?? encoded, "base64");
  return new Response(bytes, {
    headers: {
      "content-type": mimeType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  let tileId: string | null = null;
  try {
    const body = await request.json() as { tileId?: unknown };
    tileId = typeof body.tileId === "string" ? body.tileId : null;
  } catch {
    return problem("A JSON body with tileId is required.");
  }
  const tile = priorityTile(tileId);
  if (!tile) return problem("Street View is only available for an exported priority tile.", 404);

  const existing = readActionPlanImagery(tile.tileId);
  if (existing?.status === "Completed" || existing?.status === "Processing") {
    return Response.json(publicResult(existing));
  }
  if (existing?.status === "Failed") removeActionPlanImagery(tile.tileId);

  const release = claimActionPlanImagery(tile.tileId);
  if (!release) return problem("This tile's Street View request is already starting. Try again in a moment.", 409);
  try {
    const afterClaim = readActionPlanImagery(tile.tileId);
    if (afterClaim) return Response.json(publicResult(afterClaim));
    const activityId = await submitTrainingJob("/streetview", {
      latitude: tile.centroidLat,
      longitude: tile.centroidLng,
      vertical_angle: 0,
      horizontal_angle: 0,
      back_view: true,
    });
    const state: ActionPlanImageryState = {
      tileId: tile.tileId,
      latitude: tile.centroidLat,
      longitude: tile.centroidLng,
      activityId,
      submittedAt: new Date().toISOString(),
      status: "Processing",
    };
    writeActionPlanImagery(state);
    return Response.json(publicResult(state), { status: 202 });
  } catch (error) {
    const known = error instanceof FortyGuardError ? error : null;
    return problem(known?.message ?? "Unable to start Street View inspection.", known?.status ?? 502);
  } finally {
    release();
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tile = priorityTile(url.searchParams.get("tileId"));
  if (!tile) return problem("A valid priority tileId is required.", 404);
  const state = readActionPlanImagery(tile.tileId);
  if (!state) return problem("No Street View inspection has been requested for this tile.", 404);

  const viewName = url.searchParams.get("view");
  const imageName = url.searchParams.get("image");
  if (viewName || imageName) {
    if (state.status !== "Completed") return problem("Street View imagery is not ready yet.", 409);
    const view = viewName === "front" ? state.front : viewName === "back" ? state.back : null;
    const image = imageName === "original" ? view?.originalImage : imageName === "segmented" ? view?.segmentedImage : null;
    return image ? imageResponse(image) : problem("That image is unavailable.", 404);
  }

  if (state.status === "Completed" || state.status === "Failed") return Response.json(publicResult(state));
  try {
    const body = await trainingJobStatus(state.activityId);
    const data = body.data ?? {};
    const upstreamStatus = typeof data.status === "string" ? data.status : "Processing";
    if (upstreamStatus === "Completed") {
      const result = data.result && typeof data.result === "object" ? data.result as Record<string, unknown> : {};
      state.status = "Completed";
      state.front = compactView(result.front);
      state.back = compactView(result.back);
      state.message = null;
      writeActionPlanImagery(state);
    } else if (upstreamStatus === "Failed") {
      state.status = "Failed";
      state.message = typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : "Street View processing failed. You can retry this tile.";
      writeActionPlanImagery(state);
    }
    return Response.json(publicResult(state));
  } catch (error) {
    const known = error instanceof FortyGuardError ? error : null;
    return problem(known?.message ?? "Unable to check Street View status.", known?.status ?? 502);
  }
}
