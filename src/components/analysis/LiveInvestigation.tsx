"use client";

import { useState } from "react";
import { Activity, Check, Radio, RefreshCw, TriangleAlert } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";

type Job = { kind: string; activityId: string; label: string; status: string };
type InvestigationResponse = { jobs: Omit<Job, "status">[]; submittedAt: string; error?: string };

const statusLabel = (status: string) => {
  if (status === "Completed") return "Complete";
  if (status === "Failed") return "Failed";
  return "Working";
};

export function LiveInvestigation({ block }: { block: BlockMetrics }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function poll(job: Job, attempts = 0): Promise<void> {
    if (attempts >= 20) {
      setJobs((current) => current.map((item) => item.activityId === job.activityId ? { ...item, status: "Timed out" } : item));
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 4000));
    try {
      const response = await fetch(`/api/fortyguard/status?activityId=${encodeURIComponent(job.activityId)}&kind=${job.kind}`);
      const payload = await response.json() as { status?: string; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Status check failed.");
      const status = payload.status ?? "Processing";
      setJobs((current) => current.map((item) => item.activityId === job.activityId ? { ...item, status } : item));
      if (status !== "Completed" && status !== "Failed") await poll(job, attempts + 1);
    } catch (cause) {
      setJobs((current) => current.map((item) => item.activityId === job.activityId ? { ...item, status: "Failed" } : item));
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
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not start the live investigation.");
      const submitted = payload.jobs.map((job) => ({ ...job, status: "Processing" }));
      setJobs(submitted);
      void Promise.all(submitted.map((job) => poll(job)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the live investigation.");
    } finally {
      setLoading(false);
    }
  }

  const complete = jobs.length > 0 && jobs.every((job) => job.status === "Completed");

  return (
    <section className="border-t p-5" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-bold">Validate with FortyGuard</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-slate">
            Runs a live local heatmap, atmospheric context, and satellite surface check for this selected cell. Temperature analysis above is already live; these jobs test possible causes.
          </p>
        </div>
        <Radio className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      </div>

      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border py-2.5 text-[12px] font-bold tracking-wide disabled:cursor-wait disabled:opacity-60"
        style={{ borderColor: "var(--accent-border)", color: "var(--accent-strong)", background: "var(--accent-dim)" }}
      >
        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
        {loading ? "Submitting live evidence…" : jobs.length ? "Run again" : "Run live evidence check"}
      </button>

      {jobs.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {jobs.map((job) => (
            <div key={job.activityId} className="flex items-center justify-between rounded-md border px-3 py-2 text-[11.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
              <span>{job.label}</span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide" style={{ color: job.status === "Completed" ? "#81b29a" : job.status === "Failed" ? "#e36b5d" : "var(--accent-strong)" }}>
                {job.status === "Completed" ? <Check className="h-3 w-3" /> : null}
                {statusLabel(job.status)}
              </span>
            </div>
          ))}
          {complete && <p className="pt-1 text-[11.5px] leading-relaxed text-slate">Live evidence is available to the server-side investigation pipeline. A next map refresh can use the resulting GeoJSON tiles without exposing your API key.</p>}
        </div>
      )}

      {error && <p className="mt-3 flex gap-1.5 text-[11.5px] leading-relaxed" style={{ color: "#e36b5d" }}><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
    </section>
  );
}
