"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Radio, RefreshCw } from "lucide-react";
import { TopBar, type HeatPeriod } from "@/components/layout/TopBar";
import type { BlockMetrics, City } from "@/types/thermal";
import { formatSigned, thermalColor } from "@/lib/utils";
// AI action plans cover this; commented out for now.
// import { InterventionOptimizer } from "@/components/analysis/InterventionOptimizer";
import { LiveThermalReasoning } from "@/components/analysis/LiveThermalReasoning";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const LiveMapLoading = dynamic(() => import("@/components/map/LiveMapLoading"), { ssr: false });
type Feature = { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> };

function walk(value: unknown, out: number[][]) { if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number") out.push(value as number[]); else if (Array.isArray(value)) value.forEach(item => walk(item, out)); }
function featureList(value: unknown, depth = 0): Feature[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === "string") { try { return featureList(JSON.parse(value), depth + 1); } catch { return []; } }
  if (Array.isArray(value)) {
    if (value.some(item => typeof item === "object" && item !== null && "geometry" in item)) return value as Feature[];
    return value.flatMap(item => featureList(item, depth + 1));
  }
  if (typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  if (Array.isArray(object.features)) return object.features as Feature[];
  return Object.values(object).flatMap(item => featureList(item, depth + 1));
}
function temperatureValue(value: unknown, path = "", depth = 0): number | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))) {
    const number = Number(value);
    return /temp|tcm|value|heat|celsius|\bdn\b/i.test(path) && number > -80 && number < 90 ? number : null;
  }
  if (typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) { const found = temperatureValue(child, `${path}.${key}`, depth + 1); if (found !== null) return found; }
  const fallback = Object.entries(value as Record<string, unknown>).filter(([key, child]) => !/id|index|row|col|lat|lon|year|count/i.test(key) && (typeof child === "number" || (typeof child === "string" && Number.isFinite(Number(child))))).map(([, child]) => Number(child)).find(number => number > -80 && number < 90);
  return fallback ?? null;
}
function blocksFromHeatmap(mapData: unknown, city: City): BlockMetrics[] {
  const raw = featureList(mapData);
  const tiles = raw.map((feature, index) => {
    const properties = feature.properties ?? {};
    const candidate = temperatureValue(properties);
    const points: number[][] = []; walk(feature.geometry?.coordinates, points);
    if (candidate === null || !points.length) return null;
    const celsius = candidate; const lng = points.reduce((sum, point) => sum + point[0], 0) / points.length; const lat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return { index, celsius, lat, lng };
  }).filter((tile): tile is { index: number; celsius: number; lat: number; lng: number } => tile !== null);
  // Scan-wide average: every cell already returned by this same heatmap
  // call, no extra FortyGuard request. This is a broad "does this whole
  // area run hot" signal, distinct from the 8-nearest-neighbor average
  // below, which is a fine local-outlier signal -- a cell deep inside a
  // large hot zone reads as unremarkable vs. its neighbors (they're hot
  // too) but clearly warm vs. this scan-wide figure.
  const scanTemperatures = tiles.map(tile => Math.round((tile.celsius * 9 / 5 + 32) * 100) / 100);
  const scanAverage = scanTemperatures.length
    ? Math.round((scanTemperatures.reduce((sum, value) => sum + value, 0) / scanTemperatures.length) * 100) / 100
    : 0;
  return tiles.map(tile => {
    // Keep enough precision for analysis. The API's LA scan has a total
    // spread close to 1°F, so rounding each cell to a tenth before comparing
    // neighbors can incorrectly erase a real local gradient.
    const temperature = Math.round((tile.celsius * 9 / 5 + 32) * 100) / 100;
    const neighbors = tiles
      .filter(candidate => candidate.index !== tile.index)
      .map(candidate => ({
        ...candidate,
        distance: Math.hypot(candidate.lat - tile.lat, candidate.lng - tile.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
    const distribution = neighbors.map(candidate =>
      Math.round((candidate.celsius * 9 / 5 + 32) * 100) / 100,
    );
    const nearbyAverage = distribution.length
      ? distribution.reduce((sum, value) => sum + value, 0) / distribution.length
      : temperature;
    return {
      id: `live-${tile.index}`,
      city,
      neighborhood: "FortyGuard 100 m cell",
      lat: tile.lat,
      lng: tile.lng,
      temperature,
      nearbyAverage: Math.round(nearbyAverage * 100) / 100,
      scanAverage,
      surfaceTemperature: temperature,
      nearbySurfaceTemperature: Math.round(nearbyAverage * 100) / 100,
      treeCanopyPct: 0,
      nearbyTreeCanopyPct: 0,
      imperviousSurfacePct: 0,
      nearbyImperviousSurfacePct: 0,
      buildingDensity: 0,
      nearbyBuildingDensity: 0,
      windMph: 0,
      nearbyWindMph: 0,
      historicalAnomaly: 0,
      nearbyBlockCount: neighbors.length,
      distribution,
    };
  });
}

function mostUnusualBlock(blocks: BlockMetrics[]) {
  return blocks.reduce((best, candidate) =>
    Math.abs(candidate.temperature - candidate.nearbyAverage) >
    Math.abs(best.temperature - best.nearbyAverage)
      ? candidate
      : best,
  );
}

function nightMinusDay(day: BlockMetrics[], night: BlockMetrics[]) {
  const nightById = new Map(night.map(block => [block.id, block]));
  return day.flatMap(dayBlock => {
    const nightBlock = nightById.get(dayBlock.id);
    if (!nightBlock) return [];
    const change = Math.round((nightBlock.temperature - dayBlock.temperature) * 100) / 100;
    return [{ ...nightBlock, neighborhood: "Night − day temperature change", temperature: change, nearbyAverage: 0, surfaceTemperature: change, nearbySurfaceTemperature: 0, distribution: [] }];
  });
}

function scheduledScanTimestamp(period: "day" | "night") {
  const timestamp = new Date();
  timestamp.setUTCHours(period === "day" ? 20 : 8, 0, 0, 0);
  if (timestamp.getTime() > Date.now() - 2 * 60 * 60 * 1000) timestamp.setUTCDate(timestamp.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(timestamp) + " UTC";
}

// A user-searched area: a live scan of an arbitrary bbox instead of one of
// the three fixed STUDY_AREAS. `bboxKey` is a stable string derived from
// `bbox` so it can sit in a useEffect dependency array (arrays/objects can't).
type CustomArea = { bbox: [number, number, number, number]; bboxKey: string; label: string; center: [number, number] };

export default function Home() {
  const [city, setCity] = useState<City>("Los Angeles"); const [period, setPeriod] = useState<HeatPeriod>("day"); const [scans, setScans] = useState<Partial<Record<"day" | "night", BlockMetrics[]>>>({}); const [blocks, setBlocks] = useState<BlockMetrics[]>([]); const [selectedId, setSelectedId] = useState(""); const [manualSelection, setManualSelection] = useState(false); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [loadStatus, setLoadStatus] = useState("Submitting live heatmap…");
  const [customArea, setCustomArea] = useState<CustomArea | null>(null);
  async function load() {
    if (period === "compare") return;
    setLoading(true); setLoadStatus("Loading cached live heatmap…"); setError(null); setBlocks([]); setManualSelection(false);
    // v4: bumped when the "Los Angeles" study area was widened west to pull
    // in the Sepulveda Basin/Lake Balboa vegetation, so no browser serves
    // the smaller, stale Van Nuys-only box under the same city name.
    // Custom (user-searched) areas key on their own bbox instead of a city
    // name, so two different searches -- and the fixed cities -- never share
    // a cache slot or collide on a stale result.
    const areaKey = customArea ? `custom:${customArea.bboxKey}` : city;
    const cacheKey = `fortyguard-live-heatmap-v4:${areaKey}:${period}`;
    const jobKey = `fortyguard-live-job-v4:${areaKey}:${period}`;
    const requestBody = customArea ? { bbox: customArea.bbox, period } : { city, period };
    try { const cached = window.localStorage.getItem(cacheKey); if (cached) { const live = blocksFromHeatmap(cached, city); if (live.length) { setScans(current => ({ ...current, [period]: live })); setBlocks(live); setSelectedId(mostUnusualBlock(live).id); setLoading(false); return; } } } catch { /* Storage is an optional performance optimization. */ }
    setLoadStatus(customArea ? `Scanning ${customArea.label}…` : "Submitting live heatmap…");
    try {
      let activityId = window.localStorage.getItem(jobKey);
      let resumed = Boolean(activityId);
      if (!activityId) { const submit = await fetch("/api/fortyguard/heatmap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }); const job = await submit.json(); if (!submit.ok || job.error) throw new Error(job.error ?? "Heatmap submission failed."); activityId = String(job.activityId); resumed = Boolean(job.reused); window.localStorage.setItem(jobKey, activityId); }
      if (!activityId) throw new Error("Heatmap submission did not return an activity ID.");
      setLoadStatus(resumed ? "Resuming existing FortyGuard job…" : "FortyGuard is processing live tiles…");
      // FortyGuard's Quickstart recommends bounded polling at five-second
      // intervals. This allows ten minutes for a queued asynchronous job while
      // avoiding unnecessary status traffic.
      for (let attempt = 0; attempt < 120; attempt += 1) { await new Promise(resolve => setTimeout(resolve, 5000)); const response = await fetch(`/api/fortyguard/status?kind=heatmap&activityId=${encodeURIComponent(activityId)}`); const state = await response.json(); if (!response.ok || state.error) throw new Error(state.error ?? "Status check failed."); if (state.status === "Completed") { const live = blocksFromHeatmap(state.result?.mapData, city); if (!live.length) { window.localStorage.removeItem(jobKey); window.localStorage.removeItem(cacheKey); setLoadStatus("Empty result detected; submitting restored larger area…"); const retry = await fetch("/api/fortyguard/heatmap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }); const replacement = await retry.json(); if (!retry.ok || replacement.error) throw new Error(replacement.error ?? "Larger heatmap submission failed."); activityId = String(replacement.activityId); window.localStorage.setItem(jobKey, activityId); attempt = 0; continue; } try { window.localStorage.setItem(cacheKey, JSON.stringify(state.result?.mapData)); } catch { /* Rendering remains available even if storage is full. */ } window.localStorage.removeItem(jobKey); setLoadStatus(`Rendering ${live.length} live tiles…`); await new Promise(resolve => setTimeout(resolve, 250)); setScans(current => ({ ...current, [period]: live })); setBlocks(live); setSelectedId(mostUnusualBlock(live).id); return; } if (state.status === "Failed") { window.localStorage.removeItem(jobKey); throw new Error("FortyGuard heatmap generation failed."); } }
      throw new Error("FortyGuard is still processing this heatmap after 10 minutes. Retry shortly; do not refresh while a scan is active.");
    } catch (cause) {
      // A stale/expired upstream activity ID should never trap every retry on
      // the same failed status request. Preserve successful map data, but let
      // the next retry submit a fresh job.
      window.localStorage.removeItem(jobKey);
      setError(cause instanceof Error ? cause.message : "Unable to load live data.");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    if (period === "compare") return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // `load` intentionally follows the selected city/custom area; making the
    // entire polling workflow a callback dependency would restart active jobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, period, customArea?.bboxKey]);
  const visibleBlocks = useMemo(() => period === "compare" && scans.day && scans.night ? nightMinusDay(scans.day, scans.night) : blocks, [blocks, period, scans.day, scans.night]);
  const block = useMemo(() => visibleBlocks.find(item => item.id === selectedId) ?? visibleBlocks[0], [visibleBlocks, selectedId]);
  const anomaly = block ? block.temperature - block.nearbyAverage : 0;
  const scanAnomaly = block?.scanAverage !== undefined ? block.temperature - block.scanAverage : null;
  const comparisonMax = Math.max(...visibleBlocks.map(item => item.temperature)); const comparisonMin = Math.min(...visibleBlocks.map(item => item.temperature));
  const coolingScore = period === "compare" && block ? Math.round(((block.temperature - comparisonMin) / Math.max(0.01, comparisonMax - comparisonMin)) * 100) : null;
  const dayTimestamp = scheduledScanTimestamp("day"); const nightTimestamp = scheduledScanTimestamp("night");
  return (
    <div className="flex h-dvh flex-col">
      <TopBar city={city} onCityChange={(nextCity) => { setScans({}); setPeriod("day"); setCustomArea(null); setCity(nextCity); }} period={period} onPeriodChange={setPeriod} comparisonAvailable={Boolean(scans.day && scans.night)} />
      <main className="flex min-h-0 flex-1">
        {loading ? <LiveMapLoading city={city} status={loadStatus} center={customArea?.center} /> : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <AlertTriangle className="h-7 w-7 text-thermal-hot" />
            <p className="max-w-md text-sm text-ash">{error}</p>
            <button type="button" onClick={() => void load()} className="flex items-center gap-2 rounded border px-3 py-2 text-xs text-accent-strong" style={{ borderColor: "var(--accent-border)" }}><RefreshCw className="h-3.5 w-3.5" />Try the live map again</button>
          </div>
        ) : block ? <>
          <MapView
            blocks={visibleBlocks}
            selectedId={block.id}
            onSelect={(id) => { setSelectedId(id); setManualSelection(true); }}
            legendLabel={period === "compare" ? "night − day" : undefined}
            comparison={period === "compare"}
            areaLabel={customArea?.label ?? null}
            onAreaSearch={(area) => {
              setScans({});
              setPeriod(current => (current === "compare" ? "day" : current));
              setCustomArea(area);
            }}
          />
          <aside className="hidden w-[420px] flex-none overflow-y-auto border-l lg:block" style={{ borderColor: "var(--border)", background: "var(--ground)" }}>
            <div className="p-5">
              <div className="flex items-center justify-between font-mono text-[11px] tracking-wider text-slate uppercase"><span>Selected place</span><span className="flex items-center gap-1 text-accent-strong"><Radio className="h-3 w-3" />{period === "compare" ? "Night − day" : period === "day" ? "Daytime" : "Nighttime"} scan</span></div>
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate">{period === "compare" ? <>Daytime: {dayTimestamp}<br />Nighttime: {nightTimestamp}</> : period === "day" ? `Daytime scan: ${dayTimestamp}` : `Nighttime scan: ${nightTimestamp}`}</p>
              <div className="mt-5 flex items-end gap-2 font-mono"><span className="text-4xl font-semibold">{period === "compare" ? formatSigned(block.temperature, 1) : block.temperature.toFixed(1)}</span><span className="pb-1 text-lg text-ash">°F</span></div>
              <p className="mt-2 font-mono text-[13px]" style={{ color: thermalColor(anomaly) }}>{period === "compare" ? "Temperature change from daytime to nighttime" : `${formatSigned(anomaly, 2)}°F compared with 8 nearby places`}</p>
              {period !== "compare" && scanAnomaly !== null && <p className="mt-0.5 font-mono text-[11px]" style={{ color: thermalColor(scanAnomaly) }}>{formatSigned(scanAnomaly, 2)}°F vs. this scan's average ({block.scanAverage!.toFixed(1)}°F)</p>}
              {coolingScore !== null && <div className="mt-3 rounded-md border p-3" style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }}><div className="font-mono text-[10px] tracking-wide text-accent-strong uppercase">Overnight cooling priority</div><div className="mt-1 text-sm font-semibold text-paper">{coolingScore}/100</div><p className="mt-1 text-[11px] leading-relaxed text-slate">Higher scores identify cells that cooled the least between the two scans.</p></div>}
              <p className="mt-2 font-mono text-[10.5px] text-slate">{block.lat.toFixed(5)}, {block.lng.toFixed(5)}</p>
              <p className="mt-4 text-[12px] leading-relaxed text-slate">{manualSelection ? "You picked this place. Choose another square on the map to compare it." : "We picked this place because it is one of the most unusual temperatures nearby."}</p>
            </div>
            {period !== "compare" && <><LiveThermalReasoning block={block} allBlocks={blocks} onSelect={(id) => { setSelectedId(id); setManualSelection(true); }} />{/* AI action plans cover this; commented out for now. */}{/* <InterventionOptimizer block={block} allBlocks={blocks} /> */}</>}
          </aside>
        </> : null}
      </main>
    </div>
  );
}
