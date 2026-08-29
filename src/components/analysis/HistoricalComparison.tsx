"use client";

import { useState } from "react";
import { CalendarDays, Check, CircleHelp, RefreshCw, TriangleAlert } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BlockMetrics } from "@/types/thermal";

type HistoryJob = { year: number; activityId: string; status: string; temperatureF?: number | null; message?: string | null };
type WeatherPoint = { year: number; temperatureF: number | null };

function Info({ text }: { text: string }) {
  return <span className="inline-flex align-middle" title={text} aria-label={text}><CircleHelp className="h-3.5 w-3.5 text-slate" /></span>;
}

function findMean(value: unknown, path = "", depth = 0): number | null {
  if (depth > 5 || value == null) return null;
  if ((typeof value === "number" || typeof value === "string") && /mean|average/i.test(path)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const found = findMean(child, `${path}.${key}`, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function asFahrenheit(value: number | null) {
  return value === null ? null : value < 90 ? Math.round((value * 9 / 5 + 32) * 10) / 10 : value;
}

export function HistoricalComparison({ block }: { block: BlockMetrics }) {
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function poll(job: HistoryJob, attempt = 0): Promise<void> {
    if (attempt >= 120) { setJobs(current => current.map(item => item.activityId === job.activityId ? { ...item, status: "No response" } : item)); return; }
    await new Promise(resolve => window.setTimeout(resolve, 5000));
    try {
      const response = await fetch(`/api/fortyguard/status?kind=heatmap&activityId=${encodeURIComponent(job.activityId)}`);
      const payload = await response.json() as { status?: string; result?: { stats?: unknown }; message?: string | null; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Historical status check failed.");
      const status = payload.status ?? "Processing";
      const temperatureF = status === "Completed" ? asFahrenheit(findMean(payload.result?.stats)) : null;
      setJobs(current => current.map(item => item.activityId === job.activityId ? { ...item, status, temperatureF, message: payload.message } : item));
      if (status !== "Completed" && status !== "Failed") await poll(job, attempt + 1);
    } catch (cause) {
      setJobs(current => current.map(item => item.activityId === job.activityId ? { ...item, status: "Failed" } : item));
      setError(cause instanceof Error ? cause.message : "Historical comparison failed.");
    }
  }

  async function start() {
    setLoading(true); setError(null); setJobs([]); setWeather([]);
    try {
      const response = await fetch("/api/fortyguard/history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ latitude: block.lat, longitude: block.lng }) });
      const payload = await response.json() as { jobs?: Omit<HistoryJob, "status">[]; weather?: WeatherPoint[]; comparison?: string; error?: string };
      if (!response.ok || payload.error || !payload.jobs) throw new Error(payload.error ?? "Could not start the historical comparison.");
      const submitted = payload.jobs.map(job => ({ ...job, status: "Processing" }));
      setJobs(submitted); setWeather(payload.weather ?? []); setLabel(payload.comparison ?? "Same-day comparison");
      void Promise.all(submitted.map(job => poll(job)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the historical comparison."); }
    finally { setLoading(false); }
  }

  const busy = jobs.length > 0 && jobs.some(job => !["Completed", "Failed", "No response"].includes(job.status));
  const successful = jobs.filter(job => job.status === "Completed" && job.temperatureF !== null && job.temperatureF !== undefined);
  const historicMean = successful.length ? successful.reduce((sum, job) => sum + (job.temperatureF ?? 0), 0) / successful.length : null;
  const chartData = [
    ...[...jobs].sort((a, b) => a.year - b.year).map(job => ({ year: String(job.year), block: job.temperatureF ?? null, air: weather.find(point => point.year === job.year)?.temperatureF ?? null })),
    { year: "Today", block: block.temperature, air: null },
  ];

  return <section className="mt-4 rounded-lg border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
    <div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] text-accent-strong" style={{ background: "var(--accent-dim)" }}>3</span><div><div className="flex items-center gap-2"><h3 className="text-[13px] font-bold text-paper">Was it hot here before?</h3><Info text="Compares this cell at the same calendar day and UTC hour in each of the last three years. It may take several minutes because FortyGuard generates a separate heatmap per year." /></div><p className="mt-0.5 text-[11px] leading-relaxed text-slate">See whether today is unusual, not just a warm regional day.</p></div></div>
    <button type="button" onClick={start} disabled={loading || busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border py-2.5 text-[12px] font-bold disabled:cursor-wait disabled:opacity-60" style={{ borderColor: "var(--border-strong)", color: "var(--text-primary)", background: "var(--surface)" }}>
      {loading || busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
      {loading ? "Starting…" : busy ? "Comparing history…" : jobs.length ? "Check history again" : "Compare prior years"}
    </button>
    {jobs.length > 0 && <div className="mt-3" aria-live="polite">
      <div className="flex items-center justify-between"><p className="font-mono text-[10px] tracking-wide text-ash uppercase">Temperature trend</p><Info text="Gold: FortyGuard's block-level heatmap mean. Grey: Open-Meteo's 2 m regional air temperature." /></div>
      <p className="mt-1 text-[10px] text-slate">{label}</p>
      <div className="mt-2 h-44 rounded-md border px-1 pt-2" style={{ borderColor: "var(--border-strong)", background: "var(--surface-sunken)" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 6, left: -8 }}>
            <XAxis dataKey="year" tick={{ fill: "#9aa3ad", fontSize: 10 }} axisLine={{ stroke: "rgba(237,239,242,0.2)" }} tickLine={false} />
            <YAxis unit="°" tick={{ fill: "#9aa3ad", fontSize: 10 }} axisLine={false} tickLine={false} width={34} domain={["dataMin - 3", "dataMax + 3"]} />
            <Tooltip contentStyle={{ background: "#1b2028", border: "1px solid rgba(237,239,242,0.2)", borderRadius: 4, fontSize: 11 }} labelStyle={{ color: "#edeff2" }} itemStyle={{ color: "#edeff2" }} formatter={(value, name) => [`${Number(value).toFixed(1)}°F`, name === "block" ? "Block mean" : "Air temperature"]} />
            <Line type="monotone" dataKey="block" stroke="#73e6d5" strokeWidth={2} dot={{ r: 3 }} connectNulls name="block" />
            <Line type="monotone" dataKey="air" stroke="#a9bbc2" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls name="air" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 space-y-1.5">{jobs.map(job => <div key={job.activityId} className="flex justify-between gap-3 text-[11px]"><span className="text-slate">{job.year}</span><span className="font-mono text-ash">{job.status === "Completed" ? `${job.temperatureF?.toFixed(1) ?? "—"}°F block mean` : job.status === "Failed" ? "Unavailable" : job.status === "No response" ? "No response yet" : "Processing…"}{job.status === "Completed" && <Check className="ml-1 inline h-3 w-3 text-accent-strong" />}</span></div>)}</div>
      {historicMean !== null && <p className="mt-3 text-[11.5px] leading-relaxed text-ash"><span className="font-semibold">Takeaway:</span> today is {(block.temperature - historicMean) >= 0 ? "+" : ""}{(block.temperature - historicMean).toFixed(1)}°F versus the available three-year block average.</p>}
      <p className="mt-2 text-[10px] leading-relaxed text-slate">Block mean is FortyGuard thermal data. Air temperature is Open-Meteo historical reanalysis at 2 m, included only to explain broader weather conditions.</p>
    </div>}
    {error && <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed" style={{ color: "#e36b5d" }}><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
  </section>;
}
