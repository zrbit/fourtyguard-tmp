"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MaplibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { CellAttributionBreakdown } from "@/components/analysis/CellAttributionBreakdown";
import type { AoiCellSummary, CellExample } from "@/lib/reasoning/cellAttribution";

export type TrainingAoi = {
  name: string;
  category: string;
  lat: number;
  lng: number;
  latDelta: number;
  lngDelta: number;
  source: "main" | "night_batch";
  collected: boolean;
  areaKm2: number;
};

type EnrichedAoi = TrainingAoi & { cluster: string };

// Same free, key-less CARTO Voyager basemap as the live thermal map
// (src/components/map/ThermalMap.tsx) -- real streets, labels, and
// coastline, so these AOI tiles read against actual LA geography instead of
// a hand-drawn reference grid.
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

const AOI_SOURCE = "training-aois";
const FILL_LAYER = "training-aois-fill";
const LINE_SOLID_LAYER = "training-aois-outline-solid";
const LINE_DASHED_LAYER = "training-aois-outline-pending";
const HOVER_LAYER = "training-aois-hover";
const SELECTED_LAYER = "training-aois-selected";

function clusterOf(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("coastal") || c.includes("port") || c.includes("marina")) return "Coastal";
  if (c.includes("south_bay")) return "South Bay";
  if (c.includes("southeast")) return "Southeast LA";
  if (c.includes("san_gabriel")) return "San Gabriel Valley";
  if (c.includes("valley")) return "San Fernando Valley";
  if (c.includes("hillside") || c.includes("leafy")) return "Hillside / Leafy";
  if (c.includes("industrial")) return "Industrial";
  if (c.includes("park")) return "Park-adjacent";
  if (c.includes("westside") || c.includes("campus")) return "Westside";
  if (c.includes("dense") || c.includes("downtown") || c.includes("urban") || c.includes("mixed") || c.includes("adjacent_city")) return "Dense / Central";
  return "Other";
}

// Kept within the app's existing hue family (teal accent + thermal blue/red)
// rather than an unrelated rainbow, so this reads as one visual system.
const CLUSTER_COLORS: Record<string, string> = {
  Coastal: "#3e9fd9",
  "South Bay": "#35c6a8",
  "Southeast LA": "#d99a4a",
  "San Gabriel Valley": "#b07fd9",
  "San Fernando Valley": "#8fbf4f",
  "Hillside / Leafy": "#35c68f",
  Industrial: "#c6483a",
  "Park-adjacent": "#35c6b2",
  Westside: "#d9bd4a",
  "Dense / Central": "#6b8fd9",
  Other: "#8a9aa0",
};

const KM2_TO_MI2 = 0.386102;
const KM_TO_MI = 0.621371;
const M_PER_DEG_LAT = 111_320;

// MapLibre's FilterSpecification/ExpressionSpecification unions can't be
// satisfied by a plainly inferred array literal, so these are small typed
// escape hatches -- same pattern as ThermalMap.tsx.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function idFilter(id: string): any {
  return ["==", ["get", "id"], id];
}
const NO_MATCH_FILTER = idFilter("__none__");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CLUSTER_COLOR_EXPRESSION: any = [
  "match",
  ["get", "cluster"],
  ...Object.entries(CLUSTER_COLORS).flatMap(([cluster, color]) => [cluster, color]),
  CLUSTER_COLORS.Other,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fillOpacityExpression(activeCluster: string | null): any {
  if (!activeCluster) return ["case", ["get", "collected"], 0.55, 0];
  return [
    "case",
    ["all", ["get", "collected"], ["==", ["get", "cluster"], activeCluster]], 0.55,
    ["get", "collected"], 0.08,
    0,
  ];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lineOpacityExpression(activeCluster: string | null): any {
  if (!activeCluster) return 1;
  return ["case", ["==", ["get", "cluster"], activeCluster], 1, 0.2];
}

function aoiPolygon(a: EnrichedAoi) {
  const ring: [number, number][] = [
    [a.lng - a.lngDelta, a.lat - a.latDelta],
    [a.lng + a.lngDelta, a.lat - a.latDelta],
    [a.lng + a.lngDelta, a.lat + a.latDelta],
    [a.lng - a.lngDelta, a.lat + a.latDelta],
    [a.lng - a.lngDelta, a.lat - a.latDelta],
  ];
  return {
    type: "Feature" as const,
    properties: { id: a.name, cluster: a.cluster, collected: a.collected },
    geometry: { type: "Polygon" as const, coordinates: [ring] },
  };
}

function boundsOf(aois: TrainingAoi[]): [[number, number], [number, number]] {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const a of aois) {
    minLat = Math.min(minLat, a.lat - a.latDelta);
    maxLat = Math.max(maxLat, a.lat + a.latDelta);
    minLng = Math.min(minLng, a.lng - a.lngDelta);
    maxLng = Math.max(maxLng, a.lng + a.lngDelta);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

export function TrainingCoverageMap({
  aois,
  cellAttribution,
}: {
  aois: TrainingAoi[];
  cellAttribution?: Record<string, { summary: AoiCellSummary; examples: CellExample[] }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [hovered, setHovered] = useState<TrainingAoi | null>(null);
  const [selected, setSelected] = useState<TrainingAoi | null>(null);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);

  const enriched = useMemo(() => aois.map((a) => ({ ...a, cluster: clusterOf(a.category) })), [aois]);
  const byName = useMemo(() => new Map(enriched.map((a) => [a.name, a])), [enriched]);
  const featureCollection = useMemo(
    () => ({ type: "FeatureCollection" as const, features: enriched.map(aoiPolygon) }),
    [enriched],
  );

  const clusterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of enriched) counts[a.cluster] = (counts[a.cluster] ?? 0) + 1;
    return counts;
  }, [enriched]);
  const clusters = useMemo(() => Object.keys(clusterCounts).sort((a, b) => clusterCounts[b] - clusterCounts[a]), [clusterCounts]);

  const collected = enriched.filter((a) => a.collected);
  const pending = enriched.filter((a) => !a.collected);
  const totalAreaMi2 = collected.reduce((s, a) => s + a.areaKm2, 0) * KM2_TO_MI2;
  const { spanW, spanH } = useMemo(() => {
    const [[minLng, minLat], [maxLng, maxLat]] = boundsOf(enriched);
    const meanLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const mPerDegLng = M_PER_DEG_LAT * Math.cos(meanLatRad);
    const widthKm = ((maxLng - minLng) * mPerDegLng) / 1000;
    const heightKm = ((maxLat - minLat) * M_PER_DEG_LAT) / 1000;
    return { spanW: Math.round(widthKm * KM_TO_MI), spanH: Math.round(heightKm * KM_TO_MI) };
  }, [enriched]);

  const inspected = hovered ?? selected;

  // Mount the real basemap once and add the AOI layer on top of it, the
  // same source/layer pattern as ThermalMap.tsx.
  useEffect(() => {
    if (!containerRef.current || enriched.length === 0) return;
    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: boundsOf(enriched),
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource(AOI_SOURCE, { type: "geojson", data: featureCollection });
      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: AOI_SOURCE,
        paint: { "fill-color": CLUSTER_COLOR_EXPRESSION, "fill-opacity": fillOpacityExpression(null) },
      });
      map.addLayer({
        id: LINE_SOLID_LAYER,
        type: "line",
        source: AOI_SOURCE,
        filter: ["get", "collected"],
        paint: { "line-color": CLUSTER_COLOR_EXPRESSION, "line-width": 1.5, "line-opacity": lineOpacityExpression(null) },
      });
      map.addLayer({
        id: LINE_DASHED_LAYER,
        type: "line",
        source: AOI_SOURCE,
        filter: ["!", ["get", "collected"]],
        paint: { "line-color": CLUSTER_COLOR_EXPRESSION, "line-width": 1.5, "line-dasharray": [2, 1.5], "line-opacity": lineOpacityExpression(null) },
      });
      map.addLayer({
        id: HOVER_LAYER,
        type: "line",
        source: AOI_SOURCE,
        filter: NO_MATCH_FILTER,
        paint: { "line-width": 2.5, "line-color": "#10242a" },
      });
      map.addLayer({
        id: SELECTED_LAYER,
        type: "line",
        source: AOI_SOURCE,
        filter: NO_MATCH_FILTER,
        paint: { "line-width": 3, "line-color": "#0f8f78" },
      });

      map.on("mouseenter", FILL_LAYER, (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (!id) return;
        map.setFilter(HOVER_LAYER, idFilter(id));
        const aoi = byName.get(id);
        if (aoi) setHovered(aoi);
      });
      map.on("mouseleave", FILL_LAYER, () => {
        map.getCanvas().style.cursor = "";
        map.setFilter(HOVER_LAYER, NO_MATCH_FILTER);
        setHovered(null);
      });
      map.on("click", FILL_LAYER, (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        const aoi = id ? byName.get(id) : undefined;
        if (aoi) setSelected(aoi);
      });
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Mount once; the AOI list is effectively static for a given export, and
    // updates are pushed via source.setData below rather than a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the source data in sync if the AOI list itself ever changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(AOI_SOURCE);
      if (source && "setData" in source) (source as GeoJSONSource).setData(featureCollection);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [featureCollection]);

  // Dim tiles outside the selected cluster filter.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (!map.getLayer(FILL_LAYER)) return;
      map.setPaintProperty(FILL_LAYER, "fill-opacity", fillOpacityExpression(activeCluster));
      map.setPaintProperty(LINE_SOLID_LAYER, "line-opacity", lineOpacityExpression(activeCluster));
      map.setPaintProperty(LINE_DASHED_LAYER, "line-opacity", lineOpacityExpression(activeCluster));
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [activeCluster]);

  // Keep the selected outline in sync, including selections made via the
  // sidebar rather than a map click.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer(SELECTED_LAYER)) map.setFilter(SELECTED_LAYER, selected ? idFilter(selected.name) : NO_MATCH_FILTER);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selected]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px]">
      <div ref={containerRef} className="min-h-[280px] min-w-0" role="region" aria-label="Map of training AOIs across Los Angeles County" />

      <aside className="flex flex-col gap-5 overflow-y-auto border-t p-5 md:border-t-0 md:border-l" style={{ borderColor: "var(--border)" }}>
        <section>
          <h2 className="mb-2.5 font-mono text-[11px] tracking-wider text-slate uppercase">Coverage</h2>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Candidate AOIs" value={enriched.length} />
            <Stat label="Collected" value={collected.length} />
            <Stat label="Sq mi collected" value={totalAreaMi2.toFixed(0)} />
            <Stat label="Span (mi × mi)" value={`${spanW}×${spanH}`} />
          </div>
          <div className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
            <div className="flex items-center gap-2">
              <span className="h-[11px] w-4 flex-none rounded-sm border" style={{ borderColor: "var(--accent)", background: "var(--accent-dim)" }} />
              <span className="text-ash">Collected (real satellite)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-[11px] w-4 flex-none rounded-sm border border-dashed" style={{ borderColor: "var(--text-tertiary)" }} />
              <span className="text-ash">Not yet collected</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 font-mono text-[11px] tracking-wider text-slate uppercase">Selected</h2>
          {inspected ? (
            <div>
              <div className="font-display text-[15px] font-bold text-paper">{inspected.name}</div>
              <div className="mt-0.5 text-[11.5px] text-slate">
                {inspected.category.replace(/_/g, " ")} · {clusterOf(inspected.category)}
              </div>
              <div className="mt-2.5 flex flex-col gap-1 font-mono text-[11.5px]">
                <Row label="Coordinates" value={`${inspected.lat.toFixed(4)}, ${inspected.lng.toFixed(4)}`} />
                <Row label="Area" value={`${inspected.areaKm2.toFixed(2)} km² (${(inspected.areaKm2 * KM2_TO_MI2).toFixed(2)} mi²)`} />
                <Row label="Batch" value={inspected.source === "main" ? "daytime" : "night-batch"} />
              </div>
              <span
                className="mt-2 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase"
                style={
                  inspected.collected
                    ? { color: "var(--accent-strong)", borderColor: "var(--accent-border)", background: "var(--accent-dim)" }
                    : { color: "var(--text-tertiary)", borderColor: "var(--border-strong)", borderStyle: "dashed" }
                }
              >
                {inspected.collected ? "Collected" : "Not yet collected"}
              </span>
              {cellAttribution?.[inspected.name] && (
                <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <CellAttributionBreakdown
                    aoiName={inspected.name}
                    summary={cellAttribution[inspected.name].summary}
                    examples={cellAttribution[inspected.name].examples}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-slate">Hover or click a tile on the map to inspect it.</p>
          )}
        </section>

        <section>
          <h2 className="mb-2.5 font-mono text-[11px] tracking-wider text-slate uppercase">Category clusters</h2>
          <div className="flex flex-col gap-0.5">
            {clusters.map((cluster) => (
              <button
                key={cluster}
                type="button"
                onClick={() => setActiveCluster((c) => (c === cluster ? null : cluster))}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] transition-colors"
                style={{
                  background: activeCluster === cluster ? "var(--surface-raised)" : "transparent",
                  opacity: activeCluster !== null && activeCluster !== cluster ? 0.4 : 1,
                }}
              >
                <span className="h-[11px] w-[11px] flex-none rounded-sm" style={{ background: CLUSTER_COLORS[cluster] }} />
                <span className="flex-1 text-paper">{cluster}</span>
                <span className="font-mono text-[11px] text-slate">{clusterCounts[cluster]}</span>
              </button>
            ))}
          </div>
        </section>

        {pending.length > 0 && (
          <section>
            <h2 className="mb-2.5 font-mono text-[11px] tracking-wider text-slate uppercase">Still pending ({pending.length})</h2>
            <div className="flex flex-col gap-0">
              {pending.map((a) => (
                <div key={a.name} className="flex items-center justify-between gap-3 border-b py-1 text-[12px] text-ash" style={{ borderColor: "var(--border)" }}>
                  <span>{a.name}</span>
                  <span className="font-mono text-[10.5px] text-slate">{clusterOf(a.category)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-raised)" }}>
      <div className="font-mono text-[22px] leading-tight font-medium text-paper" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[10.5px] tracking-wide text-slate uppercase">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate">{label}</span>
      <span className="text-ash">{value}</span>
    </div>
  );
}
