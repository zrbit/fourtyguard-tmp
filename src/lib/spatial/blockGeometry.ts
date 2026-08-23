import type { BlockMetrics } from "@/types/thermal";

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Synthesized block footprint — DEMO geometry, not a real parcel boundary.
 * We only have a center point per block, so each tile is rendered as a
 * fixed-size square around it (~110m, roughly one NYC/LA block face).
 * Phase 6 (live FortyGuard `map_data`) replaces this with real polygons.
 */
const HALF_WIDTH_METERS = 55;

function metersToDegrees(meters: number, atLat: number) {
  const dLat = meters / METERS_PER_DEGREE_LAT;
  const dLng = meters / (METERS_PER_DEGREE_LAT * Math.cos((atLat * Math.PI) / 180));
  return { dLat, dLng };
}

export type BlockFeature = GeoJSON.Feature<
  GeoJSON.Polygon,
  {
    id: string;
    neighborhood: string;
    temperature: number;
    anomaly: number;
  }
>;

export function blockToFeature(block: BlockMetrics): BlockFeature {
  const { dLat, dLng } = metersToDegrees(HALF_WIDTH_METERS, block.lat);
  const { lat, lng } = block;
  return {
    type: "Feature",
    properties: {
      id: block.id,
      neighborhood: block.neighborhood,
      temperature: block.temperature,
      anomaly: Number((block.temperature - block.nearbyAverage).toFixed(1)),
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lng - dLng, lat - dLat],
          [lng + dLng, lat - dLat],
          [lng + dLng, lat + dLat],
          [lng - dLng, lat + dLat],
          [lng - dLng, lat - dLat],
        ],
      ],
    },
  };
}

export function blocksToFeatureCollection(
  blocks: BlockMetrics[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon, BlockFeature["properties"]> {
  return {
    type: "FeatureCollection",
    features: blocks.map(blockToFeature),
  };
}

/**
 * Point version of the same blocks, for a fixed-pixel-size marker layer.
 * These demo blocks are sampled across different neighborhoods (not
 * adjacent parcels), so at a zoom wide enough to show all of them the
 * ~110m polygon footprint shrinks to a couple of pixels — a marker that
 * stays a constant screen size is what's actually clickable.
 */
export function blocksToPointFeatureCollection(
  blocks: BlockMetrics[],
): GeoJSON.FeatureCollection<GeoJSON.Point, BlockFeature["properties"]> {
  return {
    type: "FeatureCollection",
    features: blocks.map((block) => ({
      type: "Feature",
      properties: {
        id: block.id,
        neighborhood: block.neighborhood,
        temperature: block.temperature,
        anomaly: Number((block.temperature - block.nearbyAverage).toFixed(1)),
      },
      geometry: { type: "Point", coordinates: [block.lng, block.lat] },
    })),
  };
}

export function boundsOf(blocks: BlockMetrics[]): [[number, number], [number, number]] {
  const lats = blocks.map((b) => b.lat);
  const lngs = blocks.map((b) => b.lng);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
