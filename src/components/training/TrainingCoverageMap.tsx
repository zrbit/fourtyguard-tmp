"use client";

import { useMemo, useState } from "react";

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

// Rough reference coastline (Malibu -> Long Beach), for orientation only --
// not authoritative GIS data.
const COASTLINE: [number, number][] = [
  [-118.9, 34.037], [-118.68, 34.036], [-118.53, 34.015], [-118.5, 33.995],
  [-118.49, 33.985], [-118.47, 33.985], [-118.455, 33.965], [-118.44, 33.935],
  [-118.41, 33.9], [-118.39, 33.86], [-118.385, 33.825], [-118.34, 33.755],
  [-118.29, 33.72], [-118.24, 33.735], [-118.19, 33.76], [-118.15, 33.77],
];

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

const M_PER_DEG_LAT = 111_320;
const KM2_TO_MI2 = 0.386102;
const KM_TO_MI = 0.621371;

function project(lat: number, lng: number, bounds: { minLat: number; maxLat: number; minLng: number; mPerDegLng: number; widthKm: number; heightKm: number; vbW: number; vbH: number }) {
  const x = ((lng - bounds.minLng) * bounds.mPerDegLng) / 1000 / bounds.widthKm * bounds.vbW;
  const y = ((bounds.maxLat - lat) * M_PER_DEG_LAT) / 1000 / bounds.heightKm * bounds.vbH;
  return [x, y] as const;
}

export function TrainingCoverageMap({ aois }: { aois: TrainingAoi[] }) {
  const [hovered, setHovered] = useState<TrainingAoi | null>(null);
  const [selected, setSelected] = useState<TrainingAoi | null>(null);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);

  const enriched = useMemo(() => aois.map((a) => ({ ...a, cluster: clusterOf(a.category) })), [aois]);

  const bounds = useMemo(() => {
    const meanLatRad = (enriched.reduce((s, a) => s + a.lat, 0) / enriched.length) * (Math.PI / 180);
    const mPerDegLng = M_PER_DEG_LAT * Math.cos(meanLatRad);
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const a of enriched) {
      minLat = Math.min(minLat, a.lat - a.latDelta);
      maxLat = Math.max(maxLat, a.lat + a.latDelta);
      minLng = Math.min(minLng, a.lng - a.lngDelta);
      maxLng = Math.max(maxLng, a.lng + a.lngDelta);
    }
    const padKm = 4;
    const padLat = (padKm * 1000) / M_PER_DEG_LAT;
    const padLng = (padKm * 1000) / mPerDegLng;
    minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
    const widthKm = ((maxLng - minLng) * mPerDegLng) / 1000;
    const heightKm = ((maxLat - minLat) * M_PER_DEG_LAT) / 1000;
    const vbW = 100;
    const vbH = vbW * (heightKm / widthKm);
    return { minLat, maxLat, minLng, maxLng, mPerDegLng, widthKm, heightKm, vbW, vbH, padKm };
  }, [enriched]);

  const clusterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of enriched) counts[a.cluster] = (counts[a.cluster] ?? 0) + 1;
    return counts;
  }, [enriched]);
  const clusters = useMemo(() => Object.keys(clusterCounts).sort((a, b) => clusterCounts[b] - clusterCounts[a]), [clusterCounts, clusterCounts]);

  const collected = enriched.filter((a) => a.collected);
  const pending = enriched.filter((a) => !a.collected);
  const totalAreaMi2 = collected.reduce((s, a) => s + a.areaKm2, 0) * KM2_TO_MI2;
  const spanW = Math.round((bounds.widthKm - 2 * bounds.padKm) * KM_TO_MI);
  const spanH = Math.round((bounds.heightKm - 2 * bounds.padKm) * KM_TO_MI);

  const inspected = hovered ?? selected;
  const gridStepDeg = 0.1;
  const gridLats: number[] = [];
  for (let lat = Math.ceil(bounds.minLat / gridStepDeg) * gridStepDeg; lat < bounds.maxLat; lat += gridStepDeg) gridLats.push(lat);
  const gridLngs: number[] = [];
  for (let lng = Math.ceil(bounds.minLng / gridStepDeg) * gridStepDeg; lng < bounds.maxLng; lng += gridStepDeg) gridLngs.push(lng);

  const coastPoints = COASTLINE.map(([lng, lat]) => project(lat, lng, bounds).join(",")).join(" ");
  const coastLabelPos = project(33.99, -118.55, bounds);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 p-5">
        <svg viewBox={`0 0 ${bounds.vbW} ${bounds.vbH}`} className="block h-auto w-full" role="img" aria-label="Map of training AOIs across Los Angeles County">
          {gridLats.map((lat) => {
            const [, y] = project(lat, bounds.minLng, bounds);
            return (
              <g key={`glat-${lat}`}>
                <line x1={0} x2={bounds.vbW} y1={y} y2={y} stroke="var(--border)" strokeWidth={0.15} />
                <text x={0.6} y={y - 0.6} fontSize={1.6} fontFamily="var(--font-mono)" fill="var(--text-tertiary)">
                  {lat.toFixed(1)}°N
                </text>
              </g>
            );
          })}
          {gridLngs.map((lng) => {
            const [x] = project(bounds.minLat, lng, bounds);
            return <line key={`glng-${lng}`} x1={x} x2={x} y1={0} y2={bounds.vbH} stroke="var(--border)" strokeWidth={0.15} />;
          })}

          <polyline points={coastPoints} fill="none" stroke="var(--text-tertiary)" strokeWidth={0.25} strokeDasharray="0.3 1" strokeLinecap="round" opacity={0.55} />
          <text x={coastLabelPos[0]} y={coastLabelPos[1] - 1} fontSize={1.6} fontFamily="var(--font-mono)" fill="var(--text-tertiary)">
            approx. coastline (reference only)
          </text>

          {enriched.map((a) => {
            const [x1, y1] = project(a.lat + a.latDelta, a.lng - a.lngDelta, bounds);
            const [x2, y2] = project(a.lat - a.latDelta, a.lng + a.lngDelta, bounds);
            const color = CLUSTER_COLORS[a.cluster];
            const dimmed = activeCluster !== null && a.cluster !== activeCluster;
            const isInspected = inspected?.name === a.name;
            return (
              <rect
                key={a.name}
                x={Math.min(x1, x2)}
                y={Math.min(y1, y2)}
                width={Math.abs(x2 - x1)}
                height={Math.abs(y2 - y1)}
                rx={0.3}
                fill={a.collected ? color : "transparent"}
                fillOpacity={a.collected ? 0.55 : 0}
                stroke={color}
                strokeWidth={isInspected ? 0.5 : 0.2}
                strokeDasharray={a.collected ? "none" : "0.5 0.4"}
                opacity={dimmed ? 0.15 : 1}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHovered(a)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(a)}
              />
            );
          })}
        </svg>
      </div>

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
