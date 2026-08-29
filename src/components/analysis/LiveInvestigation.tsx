"use client";

import { useState } from "react";
import { Activity, Check, CircleHelp, RefreshCw, TriangleAlert } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";

type Job = { kind: string; activityId: string; label: string; status: string; result?: unknown; message?: string | null };
type InvestigationResponse = { jobs: Omit<Job, "status">[]; error?: string };
type Fact = { label: string; value: string };

const isFinal = (status: string) => ["Completed", "Failed", "No response"].includes(status);
const statusLabel = (status: string) => status === "Completed" ? "Ready" : status === "Failed" ? "Unavailable" : status === "No response" ? "No response yet" : "Processing";

function Info({ text }: { text: string }) {
  return <span className="inline-flex align-middle" title={text} aria-label={text}><CircleHelp className="h-3.5 w-3.5 text-slate" /></span>;
}

function readableLabel(path: string) {
  const key = path.split(".").at(-1) ?? path;
  return key.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function collectFacts(value: unknown, path = "", depth = 0, output: Fact[] = []): Fact[] {
  if (output.length >= 6 || depth > 4 || value == null) return output;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (path && !/id|latitude|longitude|processing|year|date|time/i.test(path)) output.push({ label: readableLabel(path), value: typeof value === "number" ? value.toFixed(1).replace(/\.0$/, "") : String(value) });
    return output;
  }
  if (Array.isArray(value)) { value.slice(0, 4).forEach((item, index) => collectFacts(item, `${path}.${index + 1}`, depth + 1, output)); return output; }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => collectFacts(child, path ? `${path}.${key}` : key, depth + 1, output));
  return output;
}

function evidenceFacts(job: Job): Fact[] {
  if (job.status !== "Completed" || !job.result) return [];
  const result = job.result as Record<string, unknown>;
  if (job.kind === "environment") return collectFacts({ parameters: result.parameters, solarIrradiance: result.solarIrradiance });
  if (job.kind === "satellite") return collectFacts(result.segments).map(fact => ({ ...fact, value: `${fact.value}%` }));
  if (job.kind === "streetview") return (["front", "back"] as const).flatMap(view => {
    const data = result[view];
    return data && typeof data === "object" ? collectFacts((data as Record<string, unknown>).segments).map(fact => ({ ...fact, label: `${view === "front" ? "Front" : "Rear"}: ${fact.label}`, value: `${fact.value}%` })) : [];
  });
  return [];
}

function causalInterpretation(jobs: Job[]) {
  const streetFacts = jobs.filter(job => job.kind === "streetview").flatMap(evidenceFacts);
  const vegetation = streetFacts.filter(fact => /tree|vegetation|plant|grass|canopy/i.test(fact.label)).reduce((sum, fact) => sum + (Number.parseFloat(fact.value) || 0), 0);
  const hardscape = streetFacts.filter(fact => /road|route|pavement|concrete|asphalt|sidewalk/i.test(fact.label)).reduce((sum, fact) => sum + (Number.parseFloat(fact.value) || 0), 0);
  if (hardscape > vegetation) return "The street views show more exposed hard surfaces than vegetation. That supports limited shade and heat-retaining materials as possible contributors.";
  if (vegetation > 0) return "Street views detect visible vegetation. Compare it with nearby cells before treating it as a reason for this temperature difference.";
  return null;
}

export function LiveInvestigation({ block }: { block: BlockMetrics }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function poll(job: Job, attempts = 0): Promise<void> {
    if (attempts >= 120) { setJobs(current => current.map(item => item.activityId === job.activityId ? { ...item, status: "No response" } : item)); return; }
    await new Promise(resolve => window.setTimeout(resolve, 5000));
    try {
      const response = await fetch(`/api/fortyguard/status?activityId=${encodeURIComponent(job.activityId)}&kind=${job.kind}`);
      const payload = await response.json() as { status?: string; result?: unknown; message?: string | null; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Status check failed.");
      const status = payload.status ?? "Processing";
      setJobs(current => current.map(item => item.activityId === job.activityId ? { ...item, status, result: payload.result, message: payload.message } : item));
      if (status !== "Completed" && status !== "Failed") await poll(job, attempts + 1);
    } catch (cause) {
      setJobs(current => current.map(item => item.activityId === job.activityId ? { ...item, status: "Failed" } : item));
      setError(cause instanceof Error ? cause.message : "Live status check failed.");
    }
  }

  async function start(analysis: "environment" | "imagery") {
    setLoading(true); setError(null);
    if (analysis === "environment") setJobs([]);
    try {
      const response = await fetch("/api/fortyguard/investigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ latitude: block.lat, longitude: block.lng, temperatureF: block.temperature, analysis }) });
      const payload = await response.json() as InvestigationResponse;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not start the evidence check.");
      const submitted = payload.jobs.map(job => ({ ...job, status: "Processing" }));
      setJobs(current => analysis === "environment" ? submitted : [...current, ...submitted]);
      void Promise.all(submitted.map(job => poll(job)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the evidence check."); }
    finally { setLoading(false); }
  }

  const allFinished = jobs.length > 0 && jobs.every(job => isFinal(job.status));
  const environmentJob = jobs.find(job => job.kind === "environment");
  const imageryBusy = jobs.some(job => ["satellite", "streetview"].includes(job.kind) && !isFinal(job.status));
  const facts = jobs.flatMap(job => evidenceFacts(job).map(fact => ({ ...fact, source: job.label })));
  const streetFacts = jobs.filter(job => job.kind === "streetview").flatMap(evidenceFacts);
  const interpretation = causalInterpretation(jobs);

  return <section className="mt-4 rounded-lg border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
    <div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] text-accent-strong" style={{ background: "var(--accent-dim)" }}>1</span><div><div className="flex items-center gap-2"><h3 className="text-[13px] font-bold text-paper">Why could this spot be warmer?</h3><Info text="Weather conditions can show whether the whole area was hot. Street and satellite imagery can reveal visible shade, trees, and pavement. Neither proves a cause on its own." /></div><p className="mt-0.5 text-[11px] leading-relaxed text-slate">First check local weather and sunlight. Then use images to look for shade, trees, and exposed pavement.</p></div></div>
    <button type="button" onClick={() => void start("environment")} disabled={loading || Boolean(environmentJob && !isFinal(environmentJob.status))} className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border py-2.5 text-[12px] font-bold disabled:cursor-wait disabled:opacity-60" style={{ borderColor: "var(--accent-border)", color: "var(--accent-strong)", background: "var(--accent-dim)" }}>
      {loading && !imageryBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
      {environmentJob && !isFinal(environmentJob.status) ? "Checking local weather…" : environmentJob ? "Refresh local weather" : "Check local weather"}
    </button>
    <button type="button" onClick={() => void start("imagery")} disabled={loading || imageryBusy || environmentJob?.status !== "Completed"} className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border py-2 text-[11px] font-semibold disabled:cursor-wait disabled:opacity-60" style={{ borderColor: "var(--border-strong)", color: "var(--text-primary)", background: "var(--surface)" }}>
      {imageryBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
      {imageryBusy ? "Collecting street and satellite images…" : environmentJob?.status !== "Completed" ? "Unlock images after weather check" : "Look for shade and pavement in images"}
    </button>
    <p className="mt-1 text-[10px] text-slate">Weather is usually quicker. Image analysis can take several minutes.</p>
    {jobs.length > 0 && <div className="mt-3 space-y-2" aria-live="polite">
      {jobs.map(job => <div key={job.activityId} className="flex items-start justify-between gap-3 border-b pb-2 text-[11px]" style={{ borderColor: "var(--border)" }}>
        <div><span className="text-ash">{job.label}</span>{job.status === "Processing" && <p className="mt-0.5 text-[10px] text-slate">Still processing. We keep checking for up to 10 minutes.</p>}{job.status === "Failed" && job.message && <p className="mt-0.5 text-[10px] text-slate">{job.message}</p>}</div>
        <span className="shrink-0 font-mono text-[10px]" style={{ color: job.status === "Completed" ? "#81b29a" : job.status === "Failed" ? "#e36b5d" : "var(--text-secondary)" }}>{job.status === "Completed" && <Check className="mr-1 inline h-3 w-3" />}{statusLabel(job.status)}</span>
      </div>)}
      {streetFacts.length > 0 && <div className="mt-3 rounded-md border p-3" style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }}><div className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-ash uppercase">Street view result <Info text="Share of visible scene classified into surface categories by FortyGuard. The capture date can differ from the thermal reading." /></div><div className="mt-2 space-y-1.5">{streetFacts.map((fact, index) => <div key={`${fact.label}-${index}`} className="flex justify-between gap-3 text-[11px]"><span className="text-slate">{fact.label}</span><span className="font-mono text-ash">{fact.value}</span></div>)}</div></div>}
      {facts.filter(fact => fact.source !== "Street-level evidence").length > 0 && <div className="rounded-md border p-3" style={{ borderColor: "var(--border-strong)", background: "var(--surface-sunken)" }}><div className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-ash uppercase">What the data suggests <Info text="Evidence is useful context. A matched nearby control is still needed to estimate a factor's heat effect." /></div>{interpretation && <p className="mt-2 text-[11.5px] leading-relaxed text-ash">{interpretation}</p>}<div className="mt-2 space-y-1.5">{facts.filter(fact => fact.source !== "Street-level evidence").map((fact, index) => <div key={`${fact.source}-${fact.label}-${index}`} className="flex justify-between gap-3 text-[11px]"><span className="text-slate">{fact.label}</span><span className="font-mono text-ash">{fact.value}</span></div>)}</div></div>}
      {allFinished && facts.length === 0 && !error && <p className="text-[11px] leading-relaxed text-slate">No compact surface metrics were returned. This can happen when imagery is unavailable or the provider needs more processing time.</p>}
    </div>}
    {error && <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed" style={{ color: "#e36b5d" }}><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
  </section>;
}
