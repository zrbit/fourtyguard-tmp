"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Radio, RefreshCw } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import type { BlockMetrics, City } from "@/types/thermal";
import { formatSigned, thermalColor } from "@/lib/utils";
import { InterventionSimulator } from "@/components/analysis/InterventionSimulator";
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

export default function Home() {
  const [city, setCity] = useState<City>("Los Angeles"); const [blocks, setBlocks] = useState<BlockMetrics[]>([]); const [selectedId, setSelectedId] = useState(""); const [manualSelection, setManualSelection] = useState(false); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [loadStatus, setLoadStatus] = useState("Submitting live heatmap…");
  async function load() {
    setLoading(true); setLoadStatus("Loading cached live heatmap…"); setError(null); setBlocks([]); setManualSelection(false);
    const cacheKey = `fortyguard-live-heatmap-v1:${city}`;
    const jobKey = `fortyguard-live-job-v1:${city}`;
    try { const cached = window.localStorage.getItem(cacheKey); if (cached) { const live = blocksFromHeatmap(cached, city); if (live.length) { setBlocks(live); setSelectedId(mostUnusualBlock(live).id); setLoading(false); return; } } } catch { /* Storage is an optional performance optimization. */ }
    setLoadStatus("Submitting live heatmap…");
    try {
      let activityId = window.localStorage.getItem(jobKey);
      let resumed = Boolean(activityId);
      if (!activityId) { const submit = await fetch("/api/fortyguard/heatmap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city }) }); const job = await submit.json(); if (!submit.ok || job.error) throw new Error(job.error ?? "Heatmap submission failed."); activityId = String(job.activityId); resumed = Boolean(job.reused); window.localStorage.setItem(jobKey, activityId); }
      if (!activityId) throw new Error("Heatmap submission did not return an activity ID.");
      setLoadStatus(resumed ? "Resuming existing FortyGuard job…" : "FortyGuard is processing live tiles…");
      // FortyGuard's Quickstart recommends bounded polling at five-second
      // intervals. This allows ten minutes for a queued asynchronous job while
      // avoiding unnecessary status traffic.
      for (let attempt = 0; attempt < 120; attempt += 1) { await new Promise(resolve => setTimeout(resolve, 5000)); const response = await fetch(`/api/fortyguard/status?kind=heatmap&activityId=${encodeURIComponent(activityId)}`); const state = await response.json(); if (!response.ok || state.error) throw new Error(state.error ?? "Status check failed."); if (state.status === "Completed") { const live = blocksFromHeatmap(state.result?.mapData, city); if (!live.length) { window.localStorage.removeItem(jobKey); window.localStorage.removeItem(cacheKey); setLoadStatus("Empty result detected; submitting restored larger area…"); const retry = await fetch("/api/fortyguard/heatmap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city }) }); const replacement = await retry.json(); if (!retry.ok || replacement.error) throw new Error(replacement.error ?? "Larger heatmap submission failed."); activityId = String(replacement.activityId); window.localStorage.setItem(jobKey, activityId); attempt = 0; continue; } try { window.localStorage.setItem(cacheKey, JSON.stringify(state.result?.mapData)); } catch { /* Rendering remains available even if storage is full. */ } window.localStorage.removeItem(jobKey); setLoadStatus(`Rendering ${live.length} live tiles…`); await new Promise(resolve => setTimeout(resolve, 250)); setBlocks(live); setSelectedId(mostUnusualBlock(live).id); return; } if (state.status === "Failed") { window.localStorage.removeItem(jobKey); throw new Error("FortyGuard heatmap generation failed."); } }
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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // `load` intentionally follows the selected city; making the entire
    // polling workflow a callback dependency would restart active jobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);
  const block = useMemo(() => blocks.find(item => item.id === selectedId) ?? blocks[0], [blocks, selectedId]);
  const anomaly = block ? block.temperature - block.nearbyAverage : 0;
  return <div className="flex h-dvh flex-col"><TopBar city={city} onCityChange={setCity} /><main className="flex min-h-0 flex-1">{loading ? <LiveMapLoading city={city} status={loadStatus} /> : error ? <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"><AlertTriangle className="h-7 w-7 text-thermal-hot" /><p className="max-w-md text-sm text-ash">{error}</p><button type="button" onClick={() => void load()} className="flex items-center gap-2 rounded border px-3 py-2 text-xs text-accent-strong" style={{ borderColor: "var(--accent-border)" }}><RefreshCw className="h-3.5 w-3.5" />Try the live map again</button></div> : block ? <><MapView blocks={blocks} selectedId={block.id} onSelect={(id) => { setSelectedId(id); setManualSelection(true); }} /><aside className="hidden w-[420px] flex-none overflow-y-auto border-l lg:block" style={{ borderColor: "var(--border)", background: "var(--ground)" }}><div className="p-5"><div className="flex items-center justify-between font-mono text-[11px] tracking-wider text-slate uppercase"><span>Selected place</span><span className="flex items-center gap-1 text-accent-strong"><Radio className="h-3 w-3" />Live</span></div><div className="mt-5 flex items-end gap-2 font-mono"><span className="text-4xl font-semibold">{block.temperature.toFixed(1)}</span><span className="pb-1 text-lg text-ash">°F</span></div><p className="mt-2 font-mono text-[13px]" style={{ color: thermalColor(anomaly) }}>{formatSigned(anomaly, 2)}°F compared with 8 nearby places</p><p className="mt-2 font-mono text-[10.5px] text-slate">{block.lat.toFixed(5)}, {block.lng.toFixed(5)}</p><p className="mt-4 text-[12px] leading-relaxed text-slate">{manualSelection ? "You picked this place. Choose another square on the map to compare it." : "We picked this place because it is one of the most unusual temperatures nearby."}</p></div><LiveThermalReasoning block={block} allBlocks={blocks} onSelect={(id) => { setSelectedId(id); setManualSelection(true); }} /><InterventionSimulator block={block} /></aside></> : null}</main></div>;
}
