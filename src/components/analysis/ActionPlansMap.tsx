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
const SQUARE_LAYER = "action-plan-tiles-square";
const HOVER_LAYER = "action-plan-tiles-hover";
const SELECTED_LAYER = "action-plan-tiles-selected";
const SQUARE_ICON = "action-plan-square-marker";

// MapLibre's `circle` layer type has no square equivalent. A `symbol` layer
// with a text glyph ("■") was tried first and silently rendered nothing --
// the basemap's font server returned the right glyph range (200 OK,
// verified via network inspection) but apparently doesn't rasterize that
// character reliably. A self-supplied SDF icon sidesteps the basemap's font
// server entirely -- generated once client-side (see registerSquareIcon
// below) and recolored per-feature via icon-color, same as circle-color
// before. Keeps the same fixed-pixel-size property circles had (see
// tilePoint()'s comment for why that matters), just square instead of
// round -- matches TrainingCoverageMap's square AOI boxes visually.
function registerSquareIcon(map: MaplibreMap) {
  if (map.hasImage(SQUARE_ICON)) return;
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(2, 2, size - 4, size - 4); // small margin so the SDF has room to anti-alias
  const imageData = ctx.getImageData(0, 0, size, size);
  map.addImage(SQUARE_ICON, { width: size, height: size, data: imageData.data }, { sdf: true });
}

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

type Tier = "priority" | "geographic" | "typical";
type TileFeatureProps = { id: string; tier: Tier; siteType: SiteType | "none"; anomaly: number };

// Fixed-pixel-size circle markers, not geo-sized polygons -- unlike
// TrainingCoverageMap's ~2km AOI boxes (visible at a whole-county zoom),
// priority tiles are BOTH genuinely scattered across all of LA county (a
// tile near Sylmar and one near Torrance can both be "priority") AND only
// 450m across, so a fitBounds wide enough to show every scattered tile
// shrinks a real-size square to sub-pixel and it silently vanishes. Same
// problem, same fix already established for the live map's wide-zoom
// marker layer -- see blockGeometry.ts's blocksToPointFeatureCollection
// comment for the identical reasoning.
function tilePoint(tile: ActionPlanTile, tier: Tier) {
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
 * spot on a real map, an alternative to the ranked list. Every tile is
 * drawn, not just priority: geographic and typical tiles render as small
 * grey/transparent squares (2026-08-31, per explicit user request -- they
 * were invisible/hidden-behind-a-checkbox before, which read as "we only
 * screened these 48 spots" when actually all 1,706 tiles were screened,
 * most just didn't turn up a strong actionable lever) so the map reads as
 * "here's everywhere we looked, and here's what actually stood out," not a
 * sparse scatter of 48 dots on an otherwise-blank county. Colored by site
 * type for priority tiles -- the most differentiated signal a viewer can
 * read at a glance -- and one flat muted grey for everything else.
 */
export function ActionPlansMap({
  priorityTiles,
  geographicTiles,
  typicalTiles,
  tileSizeM,
}: {
  priorityTiles: ActionPlanTile[];
  geographicTiles: ActionPlanTile[];
  typicalTiles: ActionPlanTile[];
  tileSizeM: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(priorityTiles[0]?.tileId ?? null);

  const allTiles = useMemo(
    () => [...priorityTiles, ...geographicTiles, ...typicalTiles],
    [priorityTiles, geographicTiles, typicalTiles],
  );
  const byId = useMemo(() => new Map(allTiles.map((t) => [t.tileId, t])), [allTiles]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const hovered = hoveredId ? byId.get(hoveredId) : undefined;
  const inspected = hovered ?? selected;

  const featureCollection = useMemo(() => {
    // Grey (geographic/typical) tiles listed first, priority last -- within
    // one symbol layer, later features paint on top, and the 48 priority
    // squares must never end up visually buried under the ~1,658 grey ones.
    const features = [
      ...geographicTiles.map((t) => tilePoint(t, "geographic")),
      ...typicalTiles.map((t) => tilePoint(t, "typical")),
      ...priorityTiles.map((t) => tilePoint(t, "priority")),
    ];
    return { type: "FeatureCollection" as const, features };
  }, [priorityTiles, geographicTiles, typicalTiles]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const squareColorExpression: any = [
    "case",
    ["==", ["get", "tier"], "priority"],
    ["match", ["get", "siteType"], ...(Object.entries(SITE_TYPE_COLORS) as [SiteType, string][]).flatMap(([type, color]) => [type, color]), UNSCREENED_COLOR],
    GEOGRAPHIC_COLOR,
  ];
  // icon-size is a MULTIPLIER of the source icon's pixel size (32px, see
  // registerSquareIcon), not an absolute pixel size -- 0.42/0.16 render at
  // roughly 13px/5px. Non-priority tiles are drawn smaller AND dimmer
  // (icon-opacity below) than before now that there are ~1,658 of them
  // instead of an optional 225 -- they need to read as a muted backdrop,
  // not compete with the 48 priority squares that are the actual headline.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function squareSizeExpression(): any {
    return ["case", ["==", ["get", "tier"], "priority"], 0.42, 0.16];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const squareOpacityExpression: any = ["case", ["==", ["get", "tier"], "priority"], 0.95, 0.32];

  useEffect(() => {
    if (!containerRef.current || allTiles.length === 0) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: boundsOf(allTiles),
      fitBoundsOptions: { padding: 60 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      registerSquareIcon(map);
      map.addSource(TILE_SOURCE, { type: "geojson", data: featureCollection });
      map.addLayer({
        id: SQUARE_LAYER,
        type: "symbol",
        source: TILE_SOURCE,
        layout: {
          "icon-image": SQUARE_ICON,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "icon-size": squareSizeExpression() as any,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "icon-color": squareColorExpression as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "icon-opacity": squareOpacityExpression as any,
          "icon-halo-color": "#10242a",
          "icon-halo-width": 0.6,
        },
      });
      map.addLayer({
        id: HOVER_LAYER,
        type: "symbol",
        source: TILE_SOURCE,
        filter: NO_MATCH_FILTER,
        layout: {
          "icon-image": SQUARE_ICON,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "icon-size": ["+", squareSizeExpression(), 0.19] as any,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: { "icon-color": "transparent", "icon-halo-color": "#10242a", "icon-halo-width": 2.5 },
      });
      map.addLayer({
        id: SELECTED_LAYER,
        type: "symbol",
        source: TILE_SOURCE,
        filter: NO_MATCH_FILTER,
        layout: {
          "icon-image": SQUARE_ICON,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "icon-size": ["+", squareSizeExpression(), 0.26] as any,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: { "icon-color": "transparent", "icon-halo-color": "#0f8f78", "icon-halo-width": 3 },
      });

      map.on("mouseenter", SQUARE_LAYER, (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        map.setFilter(HOVER_LAYER, idFilter(id));
        setHoveredId(id);
      });
      map.on("mouseleave", SQUARE_LAYER, () => {
        map.getCanvas().style.cursor = "";
        map.setFilter(HOVER_LAYER, NO_MATCH_FILTER);
        setHoveredId(null);
      });
      map.on("click", SQUARE_LAYER, (e: MapLayerMouseEvent) => {
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
      if (map.getLayer(SELECTED_LAYER)) map.setFilter(SELECTED_LAYER, selectedId ? idFilter(selectedId) : NO_MATCH_FILTER);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedId]);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="relative h-full min-w-0 flex-1">
        <div ref={containerRef} className="h-full w-full" role="region" aria-label="Map of all screened action-plan tiles" />

        <div
          className="pointer-events-auto z-10 flex flex-col gap-1.5 rounded-md border px-3 py-2.5 text-[11px] backdrop-blur-sm"
          style={{ position: "absolute", top: 16, left: 16, borderColor: "var(--border)", background: "var(--overlay)" }}
        >
          <div className="font-mono text-[9.5px] tracking-wide text-slate uppercase">Priority — by site type</div>
          <div className="flex flex-col gap-1">
            {(Object.keys(SITE_TYPE_COLORS) as SiteType[]).map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="flex-none rounded-sm" style={{ width: 9, height: 9, background: SITE_TYPE_COLORS[type] }} />
                <span className="text-slate">{SITE_TYPE_LABEL[type]}</span>
              </div>
            ))}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 border-t pt-1.5" style={{ borderColor: "var(--border)" }}>
            <span className="flex-none rounded-sm" style={{ width: 7, height: 7, background: GEOGRAPHIC_COLOR, opacity: 0.6 }} />
            <span className="text-slate">Screened, {geographicTiles.length + typicalTiles.length} others — no strong lever</span>
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
