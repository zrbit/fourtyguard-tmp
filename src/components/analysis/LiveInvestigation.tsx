"use client";

import { useState } from "react";
import { Activity, Check, RefreshCw, TriangleAlert } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";

type Job = {
  kind: string;
  activityId: string;
  label: string;
  status: string;
  result?: unknown;
};
type InvestigationResponse = { jobs: Omit<Job, "status">[]; error?: string };
type Fact = { label: string; value: string };

const statusLabel = (status: string) => {
  if (status === "Completed") return "Complete";
  if (status === "Failed") return "Failed";
  if (status === "Timed out") return "Timed out";
  return "Working";
};

function readableLabel(path: string) {
  const key = path.split(".").at(-1) ?? path;
  return key.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function readableValue(value: string | number | boolean) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
  }
  return String(value);
}

function collectFacts(value: unknown, path = "", depth = 0, output: Fact[] = []): Fact[] {
  if (output.length >= 6 || depth > 4 || value == null) return output;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (path && !/id|latitude|longitude|processing|year|date|time/i.test(path)) {
      output.push({ label: readableLabel(path), value: readableValue(value) });
    }
    return output;
  }
  if (Array.isArray(value)) {
    value.slice(0, 4).forEach((item, index) => collectFacts(item, `${path}.${index + 1}`, depth + 1, output));
    return output;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) =>
      collectFacts(child, path ? `${path}.${key}` : key, depth + 1, output),
    );
  }
  return output;
}

function evidenceFacts(job: Job): Fact[] {
  if (job.status !== "Completed" || !job.result) return [];
  const result = job.result as Record<string, unknown>;
  if (job.kind === "environment") {
    return collectFacts({ parameters: result.parameters, solarIrradiance: result.solarIrradiance });
  }
  if (job.kind === "satellite") {
    return collectFacts(result.segments).map(fact => ({ ...fact, value: `${fact.value}%` }));
  }
  return [];
}

function causalInterpretation(jobs: Job[]) {
  const satellite = jobs.find(job => job.kind === "satellite");
  if (!satellite) return null;
  const facts = evidenceFacts(satellite);
  const builtShare = facts
    .filter(fact => /building|road|route|pavement|concrete|asphalt/i.test(fact.label))
    .reduce((sum, fact) => sum + (Number.parseFloat(fact.value) || 0), 0);
  if (builtShare >= 70) {
    return `Satellite segmentation classifies about ${builtShare.toFixed(1)}% of this cell as buildings or roads. That supports heat-retaining built surfaces as a plausible contributor, though a nearby land-cover control is needed to estimate its effect.`;
  }
  if (builtShare > 0) {
    return `Satellite segmentation identifies ${builtShare.toFixed(1)}% building/road cover. Built surfaces are present, but this share alone is not strong enough to rank them as the dominant explanation.`;
  }
  return null;
}

export function LiveInvestigation({ block }: { block: BlockMetrics }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function poll(job: Job, attempts = 0): Promise<void> {
    if (attempts >= 20) {
      setJobs(current => current.map(item =>
        item.activityId === job.activityId ? { ...item, status: "Timed out" } : item,
      ));
      return;
    }
    await new Promise(resolve => window.setTimeout(resolve, 4000));
    try {
      const response = await fetch(`/api/fortyguard/status?activityId=${encodeURIComponent(job.activityId)}&kind=${job.kind}`);
      const payload = await response.json() as { status?: string; result?: unknown; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Status check failed.");
      const status = payload.status ?? "Processing";
      setJobs(current => current.map(item =>
        item.activityId === job.activityId ? { ...item, status, result: payload.result } : item,
      ));
      if (status !== "Completed" && status !== "Failed") await poll(job, attempts + 1);
    } catch (cause) {
      setJobs(current => current.map(item =>
        item.activityId === job.activityId ? { ...item, status: "Failed" } : item,
      ));
      setError(cause instanceof Error ? cause.message : "Live status check failed.");
    }
  }

  async function start() {
    setLoading(true);
    setError(null);
    setJobs([]);
    try {
      const response = await fetch("/api/fortyguard/investigate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ latitude: block.lat, longitude: block.lng, temperatureF: block.temperature }),
      });
      const payload = await response.json() as InvestigationResponse;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not start the evidence check.");
      const submitted = payload.jobs.map(job => ({ ...job, status: "Processing" }));
      setJobs(submitted);
      void Promise.all(submitted.map(job => poll(job)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the evidence check.");
    } finally {
      setLoading(false);
    }
  }

  const facts = jobs.flatMap(job => evidenceFacts(job).map(fact => ({ ...fact, source: job.label })));
  const interpretation = causalInterpretation(jobs);
  const allFinished = jobs.length > 0 && jobs.every(job => ["Completed", "Failed", "Timed out"].includes(job.status));

  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={start}
        disabled={loading || (jobs.length > 0 && !allFinished)}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border py-2.5 text-[12px] font-bold disabled:cursor-wait disabled:opacity-60"
        style={{ borderColor: "var(--accent-border)", color: "var(--accent-strong)", background: "var(--accent-dim)" }}
      >
        {loading || (jobs.length > 0 && !allFinished)
          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          : <Activity className="h-3.5 w-3.5" />}
        {loading ? "Submitting evidence…" : jobs.length > 0 && !allFinished ? "Investigating possible causes…" : jobs.length ? "Run evidence again" : "Investigate possible causes"}
      </button>

      {jobs.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {jobs.map(job => (
              <span key={job.activityId} className="flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[9.5px]" style={{ borderColor: "var(--border-strong)", color: job.status === "Completed" ? "#81b29a" : job.status === "Failed" ? "#e36b5d" : "var(--text-tertiary)" }}>
                {job.status === "Completed" && <Check className="h-3 w-3" />}
                {job.label}: {statusLabel(job.status)}
              </span>
            ))}
          </div>

          {facts.length > 0 && (
            <div className="rounded-md border p-3" style={{ borderColor: "var(--border-strong)", background: "var(--surface-sunken)" }}>
              <div className="mb-2 font-mono text-[10px] tracking-wide text-ash uppercase">Live causal context</div>
              {interpretation && <p className="mb-3 text-[11.5px] leading-relaxed text-ash">{interpretation}</p>}
              <div className="space-y-1.5">
                {facts.map((fact, index) => (
                  <div key={`${fact.source}-${fact.label}-${index}`} className="flex items-start justify-between gap-3 text-[11px]">
                    <span className="text-slate">{fact.label}</span>
                    <span className="text-right font-mono text-ash">{fact.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-slate">These measurements provide context, but a nearby control measurement is still required before treating any factor as the cause.</p>
            </div>
          )}

          {allFinished && facts.length === 0 && !error && (
            <p className="text-[10.5px] leading-relaxed text-slate">The evidence jobs finished, but FortyGuard returned no compact causal metrics for this cell.</p>
          )}
        </div>
      )}

      {error && <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed" style={{ color: "#e36b5d" }}><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
    </div>
  );
}
