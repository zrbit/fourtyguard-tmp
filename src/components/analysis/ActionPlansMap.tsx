"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MaplibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { ActionPlanTileCard } from "@/components/analysis/ActionPlanTileCard";
import type { ActionPlanTile, SiteType } from "@/lib/reasoning/clusterActionPlans";

// Same free, key-less CARTO Voyager basemap as the live thermal map and the
// training-coverage map -- one consistent visual system across every map in
// the app.
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const TILE_SOURCE = "action-plan-tiles";
const CIRCLE_LAYER = "action-plan-tiles-circle";
const HOVER_LAYER = "action-plan-tiles-hover";
const SELECTED_LAYER = "action-plan-tiles-selected";

const SITE_TYPE_LABEL: Record<SiteType, string> = {
  highway_dominated: "Highway / major-road",
  surface_parking: "Surface parking",
  building_dominated: "Building / roof",
  green_space: "Green space",
  residential_mixed: "Residential / mixed",
  mixed_unclassified: "Mixed",
};

// Kept within the app's existing hue family, same palette convention as
// TrainingCoverageMap's CLUSTER_COLORS -- one consistent color system
// across every map, not an unrelated rainbow per page.
const SITE_TYPE_COLORS: Record<SiteType, string> = {
  highway_dominated: "#c6483a",
  surface_parking: "#d99a4a",
  building_dominated: "#6b8fd9",
  green_space: "#8fbf4f",
  residential_mixed: "#35c6a8",
  mixed_unclassified: "#8a9aa0",
};
const GEOGRAPHIC_COLOR = "#7c8b96"; // matches CellAttributionBreakdown's geographic_context swatch
const UNSCREENED_COLOR = "#8a9aa0";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function idFilter(id: string): any {
  return ["==", ["get", "id"], id];
}
const NO_MATCH_FILTER = idFilter("__none__");

type TileFeatureProps = { id: string; tier: "priority" | "geographic"; siteType: SiteType | "none"; anomaly: number };

// Fixed-pixel-size circle markers, not geo-sized polygons -- unlike
// TrainingCoverageMap's ~2km AOI boxes (visible at a whole-county zoom),
// priority tiles are BOTH genuinely scattered across all of LA county (a
// tile near Sylmar and one near Torrance can both be "priority") AND only
// 450m across, so a fitBounds wide enough to show every scattered tile
// shrinks a real-size square to sub-pixel and it silently vanishes. Same
// problem, same fix already established for the live map's wide-zoom
// marker layer -- see blockGeometry.ts's blocksToPointFeatureCollection
// comment for the identical reasoning.
function tilePoint(tile: ActionPlanTile, tier: "priority" | "geographic") {
  return {
    type: "Feature" as const,
    properties: { id: tile.tileId, tier, siteType: tile.siteType ?? "none", anomaly: tile.avgCellAnomaly } satisfies TileFeatureProps,
    geometry: { type: "Point" as const, coordinates: [tile.centroidLng, tile.centroidLat] },
  };
}

function boundsOf(tiles: ActionPlanTile[]): [[number, number], [number, number]] {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const t of tiles) {
    minLat = Math.min(minLat, t.centroidLat);
    maxLat = Math.max(maxLat, t.centroidLat);
    minLng = Math.min(minLng, t.centroidLng);
    maxLng = Math.max(maxLng, t.centroidLng);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

/**
 * Map view for the Action Plans page -- one tile of intervention detail per
 * spot on a real map, an alternative to the ranked list. Only priority and
 * geographic tiles are drawn (typical tiles are never shown in the list
 * either, at 1,433 of them there's nothing informative to add by drawing
 * them). Colored by site type for priority tiles -- the most differentiated
 * signal a viewer can read at a glance across the whole area -- and one
 * flat muted tone for geographic (hot, but not actionable) tiles.
 */
export function ActionPlansMap({
  priorityTiles,
  geographicTiles,
  tileSizeM,
}: {
  priorityTiles: ActionPlanTile[];
  geographicTiles: ActionPlanTile[];
  tileSizeM: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(priorityTiles[0]?.tileId ?? null);
  const [showGeographic, setShowGeographic] = useState(false);

  const allTiles = useMemo(() => [...priorityTiles, ...geographicTiles], [priorityTiles, geographicTiles]);
  const byId = useMemo(() => new Map(allTiles.map((t) => [t.tileId, t])), [allTiles]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const hovered = hoveredId ? byId.get(hoveredId) : undefined;
  const inspected = hovered ?? selected;

  const featureCollection = useMemo(() => {
    const features = [
      ...priorityTiles.map((t) => tilePoint(t, "priority")),
      ...geographicTiles.map((t) => tilePoint(t, "geographic")),
    ];
    return { type: "FeatureCollection" as const, features };
  }, [priorityTiles, geographicTiles]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circleColorExpression: any = [
    "case",
    ["==", ["get", "tier"], "geographic"], GEOGRAPHIC_COLOR,
    ["match", ["get", "siteType"], ...(Object.entries(SITE_TYPE_COLORS) as [SiteType, string][]).flatMap(([type, color]) => [type, color]), UNSCREENED_COLOR],
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function circleRadiusExpression(): any {
    return ["case", ["==", ["get", "tier"], "priority"], 6, 3.5];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function circleOpacityExpression(includeGeographic: boolean): any {
    return includeGeographic
      ? ["case", ["==", ["get", "tier"], "priority"], 0.95, 0.55]
      : ["case", ["==", ["get", "tier"], "priority"], 0.95, 0];
  }

  useEffect(() => {
    if (!containerRef.current || allTiles.length === 0) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: boundsOf(priorityTiles.length ? priorityTiles : allTiles),
      fitBoundsOptions: { padding: 60 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource(TILE_SOURCE, { type: "geojson", data: featureCollection });
      map.addLayer({
        id: CIRCLE_LAYER,
        type: "circle",
        source: TILE_SOURCE,
        paint: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-radius": circleRadiusExpression() as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-color": circleColorExpression as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-opacity": circleOpacityExpression(false) as any,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#10242a",
          "circle-stroke-opacity": 0.6,
        },
      });
      map.addLayer({
        id: HOVER_LAYER,
        type: "circle",
        source: TILE_SOURCE,
        filter: NO_MATCH_FILTER,
        paint: { "circle-radius": 11, "circle-color": "transparent", "circle-stroke-width": 2.5, "circle-stroke-color": "#10242a" },
      });
      map.addLayer({
        id: SELECTED_LAYER,
        type: "circle",
        source: TILE_SOURCE,
        filter: NO_MATCH_FILTER,
        paint: { "circle-radius": 12, "circle-color": "transparent", "circle-stroke-width": 3, "circle-stroke-color": "#0f8f78" },
      });

      map.on("mouseenter", CIRCLE_LAYER, (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        map.setFilter(HOVER_LAYER, idFilter(id));
        setHoveredId(id);
      });
      map.on("mouseleave", CIRCLE_LAYER, () => {
        map.getCanvas().style.cursor = "";
        map.setFilter(HOVER_LAYER, NO_MATCH_FILTER);
        setHoveredId(null);
      });
      map.on("click", CIRCLE_LAYER, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) setSelectedId(id);
      });
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Mount once; the tile set is static for a given page load, updates flow
    // through source.setData()/setPaintProperty() below instead of a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(TILE_SOURCE);
      if (source && "setData" in source) (source as GeoJSONSource).setData(featureCollection);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [featureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer(CIRCLE_LAYER)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.setPaintProperty(CIRCLE_LAYER, "circle-opacity", circleOpacityExpression(showGeographic) as any);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGeographic]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer(SELECTED_LAYER)) map.setFilter(SELECTED_LAYER, selectedId ? idFilter(selectedId) : NO_MATCH_FILTER);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedId]);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="relative h-full min-w-0 flex-1">
        <div ref={containerRef} className="h-full w-full" role="region" aria-label="Map of priority and geography-driven action-plan tiles" />

        <div
          className="pointer-events-auto z-10 flex flex-col gap-1.5 rounded-md border px-3 py-2.5 text-[11px] backdrop-blur-sm"
          style={{ position: "absolute", top: 16, left: 16, borderColor: "var(--border)", background: "var(--overlay)" }}
        >
          <label className="flex items-center gap-1.5 text-slate">
            <input type="checkbox" checked={showGeographic} onChange={(e) => setShowGeographic(e.target.checked)} className="accent-[var(--accent)]" />
            Show {geographicTiles.length} geography-driven tiles
          </label>
          <div className="mt-0.5 flex flex-col gap-1 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>
            {(Object.keys(SITE_TYPE_COLORS) as SiteType[]).map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="flex-none rounded-sm" style={{ width: 9, height: 9, background: SITE_TYPE_COLORS[type] }} />
                <span className="text-slate">{SITE_TYPE_LABEL[type]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="hidden h-full w-[420px] flex-none flex-col gap-4 overflow-y-auto border-l p-4 md:flex" style={{ borderColor: "var(--border)" }}>
        {inspected ? (
          <ActionPlanTileCard
            tile={inspected}
            rank={inspected.priorityTier === "priority" ? priorityTiles.findIndex((t) => t.tileId === inspected.tileId) + 1 : undefined}
          />
        ) : (
          <p className="p-2 text-[12.5px] leading-relaxed text-slate">Hover or click a tile on the map to inspect it.</p>
        )}

        <div>
          <h2 className="mb-2 font-mono text-[10.5px] tracking-wider text-slate uppercase">Priority tiles, ranked</h2>
          <div className="flex flex-col gap-0.5">
            {priorityTiles.map((t, i) => (
              <button
                key={t.tileId}
                type="button"
                onClick={() => setSelectedId(t.tileId)}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] transition-colors"
                style={{ background: selectedId === t.tileId ? "var(--surface-raised)" : "transparent" }}
              >
                <span className="w-4 flex-none font-mono text-[10px] text-slate">{i + 1}</span>
                <span
                  className="flex-none rounded-sm"
                  style={{ width: 9, height: 9, background: t.siteType ? SITE_TYPE_COLORS[t.siteType] : UNSCREENED_COLOR }}
                />
                <span className="min-w-0 flex-1 truncate text-paper">Near {t.primaryAoi}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-slate">+{t.avgCellAnomaly.toFixed(1)}°F</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
