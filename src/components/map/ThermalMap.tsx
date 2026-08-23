"use client";

import { useEffect, useRef } from "react";
import {
  Map as MaplibreMap,
  NavigationControl,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import {
  blocksToFeatureCollection,
  blocksToPointFeatureCollection,
  boundsOf,
} from "@/lib/spatial/blockGeometry";
import type { BlockMetrics } from "@/types/thermal";

// Free, key-less dark basemap — no account or token required, which matters
// since demo mode has to run without any credentials. Attribution is
// rendered by MapLibre's built-in AttributionControl per CARTO/OSM terms.
//
// Pinned to the maplibre-gl v4 line deliberately: v6.5.0 fetched this
// style's TileJSON successfully but never issued a single vector-tile
// request afterward (confirmed via devtools — style loaded, source
// registered, zero .mvt requests, map stayed blank indefinitely). v4 is
// the long-established, widely-deployed line and renders it correctly.
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

const FOOTPRINT_SOURCE = "block-footprints";
const FILL_LAYER = "blocks-fill";
const LINE_LAYER = "blocks-line";

const MARKER_SOURCE = "block-markers";
const CIRCLE_LAYER = "blocks-circle";
const HOVER_LAYER = "blocks-hover-ring";
const SELECTED_LAYER = "blocks-selected-ring";

// Same structural-typing friction as thermalColorExpression() below —
// MapLibre's FilterSpecification union can't be satisfied by a plainly
// inferred array literal, so this is a small typed escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function idFilter(id: string): any {
  return ["==", ["get", "id"], id];
}
const NO_MATCH_FILTER = idFilter("__none__");

// Mirrors the diverging thermal scale from the design system exactly —
// anomaly, not absolute temperature, drives fill/marker color. MapLibre's
// style-spec types this paint property as a deeply-nested discriminated
// union that a dynamically-built expression array can't satisfy
// structurally, so this is intentionally untyped — the shape is a
// standard `interpolate` expression validated at runtime by MapLibre.
function thermalColorExpression() {
  return [
    "interpolate",
    ["linear"],
    ["get", "anomaly"],
    -6,
    "#1f4e96",
    -2,
    "#3e7fd9",
    0,
    "#3a4048",
    2,
    "#c6483a",
    6,
    "#8c2a20",
  ];
}

export function ThermalMap({
  blocks,
  selectedId,
  onSelect,
}: {
  blocks: BlockMetrics[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Mount once. Block selection is synced via a separate effect below so we
  // don't tear down and rebuild the map every time the user clicks a tile.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: boundsOf(blocks),
      fitBoundsOptions: { padding: 80 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      // Footprint polygons: geographically accurate (~110m), but at a
      // city-wide zoom spanning several neighborhoods they shrink to a
      // couple of pixels — decorative context, not the click target.
      map.addSource(FOOTPRINT_SOURCE, {
        type: "geojson",
        data: blocksToFeatureCollection(blocks),
      });
      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: FOOTPRINT_SOURCE,
        paint: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see thermalColorExpression()
          "fill-color": thermalColorExpression() as any,
          "fill-opacity": 0.6,
        },
      });
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: FOOTPRINT_SOURCE,
        paint: { "line-color": "rgba(237,239,242,0.35)", "line-width": 1 },
      });

      // Marker circles: fixed screen-space size regardless of zoom — the
      // actual click/hover/selection target.
      map.addSource(MARKER_SOURCE, {
        type: "geojson",
        data: blocksToPointFeatureCollection(blocks),
      });
      map.addLayer({
        id: CIRCLE_LAYER,
        type: "circle",
        source: MARKER_SOURCE,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 10],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see thermalColorExpression()
          "circle-color": thermalColorExpression() as any,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(13,15,19,0.85)",
        },
      });
      map.addLayer({
        id: HOVER_LAYER,
        type: "circle",
        source: MARKER_SOURCE,
        filter: NO_MATCH_FILTER,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 9, 14, 15],
          "circle-color": "transparent",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#edeff2",
        },
      });
      map.addLayer({
        id: SELECTED_LAYER,
        type: "circle",
        source: MARKER_SOURCE,
        filter: NO_MATCH_FILTER,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 11, 14, 18],
          "circle-color": "transparent",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#c9a24a",
        },
      });

      map.on("click", CIRCLE_LAYER, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) onSelectRef.current(id);
      });
      map.on("mouseenter", CIRCLE_LAYER, (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) map.setFilter(HOVER_LAYER, idFilter(id));
      });
      map.on("mouseleave", CIRCLE_LAYER, () => {
        map.getCanvas().style.cursor = "";
        map.setFilter(HOVER_LAYER, NO_MATCH_FILTER);
      });
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the accent ring in sync with whichever block is selected,
  // including selections made via the keyboard-accessible block list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer(SELECTED_LAYER)) {
        map.setFilter(SELECTED_LAYER, idFilter(selectedId));
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedId]);

  return <div ref={containerRef} className="h-full w-full flex-1" />;
}
