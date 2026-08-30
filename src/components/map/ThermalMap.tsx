"use client";

import { useEffect, useRef } from "react";
import {
  Map as MaplibreMap,
  NavigationControl,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { blocksToFeatureCollection, boundsOf } from "@/lib/spatial/blockGeometry";
import type { BlockMetrics } from "@/types/thermal";

// Free, key-less CARTO Voyager basemap with light streets, labels, and
// colorful geographic context. No account or token is needed. Attribution is
// rendered by MapLibre's built-in AttributionControl per CARTO/OSM terms.
//
// Pinned to the maplibre-gl v4 line deliberately: v6.5.0 fetched this
// style's TileJSON successfully but never issued a single vector-tile
// request afterward (confirmed via devtools — style loaded, source
// registered, zero .mvt requests, map stayed blank indefinitely). v4 is
// the long-established, widely-deployed line and renders it correctly.
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const MARKER_SOURCE = "block-markers";
const RECTANGLE_LAYER = "blocks-rectangle";
const HOVER_LAYER = "blocks-hover-outline";
const SELECTED_LAYER = "blocks-selected-outline";

// MapLibre's FilterSpecification union can't be satisfied by a plainly
// inferred array literal, so this is a small typed escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function idFilter(id: string): any {
  return ["==", ["get", "id"], id];
}
const NO_MATCH_FILTER = idFilter("__none__");

// Rectangles are colored from the coldest to hottest loaded cell: cool blue
// through the mid-range to warm red.
function thermalColorExpression(minTemperature: number, maxTemperature: number, theme: "light" | "dark") {
  const colors = theme === "light"
    ? ["#136fa9", "#5aaed5", "#dbcab9", "#e46f5c", "#b93730"]
    : ["#2677bf", "#61addb", "#50636c", "#e76e5a", "#bd3d35"];
  const range = Math.max(0.01, maxTemperature - minTemperature);
  return [
    "interpolate",
    ["linear"],
    ["get", "temperature"],
    minTemperature,
    colors[0],
    minTemperature + range * 0.25,
    colors[1],
    minTemperature + range * 0.5,
    colors[2],
    minTemperature + range * 0.75,
    colors[3],
    maxTemperature,
    colors[4],
  ];
}

export function ThermalMap({
  blocks,
  selectedId,
  onSelect,
  theme,
}: {
  blocks: BlockMetrics[];
  selectedId: string;
  onSelect: (id: string) => void;
  theme: "light" | "dark";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const temperatures = blocks.map(block => block.temperature);
  const minTemperature = Math.min(...temperatures);
  const maxTemperature = Math.max(...temperatures);
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
      // Each block has a square ~110m footprint. Its color represents its
      // actual temperature within the range of all loaded cells.
      map.addSource(MARKER_SOURCE, {
        type: "geojson",
        data: blocksToFeatureCollection(blocks),
      });
      map.addLayer({
        id: RECTANGLE_LAYER,
        type: "fill",
        source: MARKER_SOURCE,
        paint: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MapLibre rejects dynamic expression arrays
          "fill-color": thermalColorExpression(minTemperature, maxTemperature, theme) as any,
          "fill-opacity": 0.82,
        },
      });
      map.addLayer({
        id: HOVER_LAYER,
        type: "line",
        source: MARKER_SOURCE,
        filter: NO_MATCH_FILTER,
        paint: {
          "line-width": 1.5,
          "line-color": theme === "light" ? "#10242a" : "#edeff2",
        },
      });
      map.addLayer({
        id: SELECTED_LAYER,
        type: "line",
        source: MARKER_SOURCE,
        filter: NO_MATCH_FILTER,
        paint: {
          "line-width": 2.5,
          "line-color": "#73e6d5",
        },
      });

      map.on("click", RECTANGLE_LAYER, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) onSelectRef.current(id);
      });
      map.on("mouseenter", RECTANGLE_LAYER, (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) map.setFilter(HOVER_LAYER, idFilter(id));
      });
      map.on("mouseleave", RECTANGLE_LAYER, () => {
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
  }, [theme]);

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
