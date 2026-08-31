"use client";

import Image from "next/image";
import { Camera, Check, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ViewResult = {
  imageDate: string | null;
  segments: Record<string, unknown> | null;
  originalUrl: string | null;
  segmentedUrl: string | null;
};

type ImageryResult = {
  tileId: string;
  status: "Processing" | "Completed" | "Failed";
  message: string | null;
  cached: boolean;
  front: ViewResult | null;
  back: ViewResult | null;
  error?: string;
};

function numericSegments(result: ImageryResult | null) {
  const values = new Map<string, number[]>();
  for (const view of [result?.front, result?.back]) {
    for (const [label, raw] of Object.entries(view?.segments ?? {})) {
      const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (Number.isFinite(value)) values.set(label, [...(values.get(label) ?? []), value]);
    }
  }
  return [...values].map(([label, samples]) => ({ label, value: samples.reduce((sum, value) => sum + value, 0) / samples.length }));
}

function plantingAssessment(result: ImageryResult | null) {
  const segments = numericSegments(result);
  const sum = (pattern: RegExp) => segments.filter(({ label }) => pattern.test(label)).reduce((total, item) => total + item.value, 0);
  const vegetation = sum(/tree|vegetation|plant|grass|canopy/i);
  const candidateGround = sum(/sidewalk|pavement|ground|soil|grass|open/i);
  const roadway = sum(/road|route|highway|car|vehicle/i);
  if (vegetation >= 25) return "Existing vegetation is already prominent in this representative view. Preserve it and inspect gaps before recommending more trees.";
  if (candidateGround >= 8 && roadway < 45) return "Candidate planting opportunity: the view combines limited vegetation with visible non-building ground. Confirm sidewalk width, utilities and ownership on site.";
  if (roadway >= 45) return "Planting appears constrained: roadway or vehicles dominate this representative view. Consider shade structures or nearby off-road parcels instead.";
  return "The segmentation does not establish a clear planting area. A second site inspection or parcel-level review is needed.";
}

export function ActionPlanImagery({ tileId }: { tileId: string }) {
  const [result, setResult] = useState<ImageryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (result?.status !== "Processing") return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/action-plan-imagery?tileId=${encodeURIComponent(tileId)}`, { cache: "no-store" });
        const payload = await response.json() as ImageryResult;
        if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not check Street View status.");
        if (active) setResult(payload);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not check Street View status.");
      }
    };
    const timer = window.setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [result?.status, tileId]);

  async function inspect() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/action-plan-imagery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tileId }),
      });
      const payload = await response.json() as ImageryResult;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not start Street View inspection.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Street View inspection.");
    } finally {
      setLoading(false);
    }
  }

  const assessment = useMemo(() => plantingAssessment(result), [result]);
  const views = (["front", "back"] as const).flatMap((name) => {
    const view = result?.[name];
    return view ? [{ name, view }] : [];
  });

  if (!result) return <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
    <button type="button" onClick={() => void inspect()} disabled={loading} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border py-2 text-[11px] font-semibold disabled:cursor-wait disabled:opacity-60" style={{ borderColor: "var(--border-strong)", color: "var(--text-primary)", background: "var(--surface-raised)" }}>
      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
      {loading ? "Starting representative inspection…" : "Inspect street-level evidence · up to 8,600 credits"}
    </button>
    <p className="mt-1.5 text-[9.5px] leading-relaxed text-slate">One front/back request at this fixed tile&apos;s representative coordinate. The result is cached and reused.</p>
    {error && <ErrorMessage text={error} />}
  </div>;

  if (result.status === "Processing") return <div className="mt-3 flex items-center gap-2 border-t pt-3 text-[11px] text-slate" style={{ borderColor: "var(--border)" }} aria-live="polite">
    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Street View is processing. This page is checking every five seconds.
  </div>;

  if (result.status === "Failed") return <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
    <ErrorMessage text={result.message ?? "Street View processing failed."} />
    <button type="button" onClick={() => void inspect()} disabled={loading} className="mt-2 text-[11px] font-semibold text-accent-strong">Retry inspection</button>
  </div>;

  return <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-ash uppercase"><Check className="h-3.5 w-3.5 text-accent-strong" />Representative street inspection</div>
      <span className="font-mono text-[9px] text-slate">cached</span>
    </div>
    <p className="mt-1 text-[10px] leading-relaxed text-slate">This is one road-level location within the ~450m tile, not complete tile coverage.</p>
    <div className="mt-2 space-y-2">
      {views.map(({ name, view }) => <div key={name} className="overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
        <div className="flex justify-between px-2 py-1.5 font-mono text-[9px] text-slate"><span>{name} view</span><span>{view.imageDate ?? "capture date unavailable"}</span></div>
        <div className="grid grid-cols-2 gap-px" style={{ background: "var(--border)" }}>
          <ImagePanel url={view.originalUrl} label="Original" alt={`${name} original Street View for action-plan tile ${tileId}`} />
          <ImagePanel url={view.segmentedUrl} label="Segmented" alt={`${name} Street View segmentation for action-plan tile ${tileId}`} />
        </div>
      </div>)}
    </div>
    <p className="mt-2 rounded-md border px-2.5 py-2 text-[10.5px] leading-relaxed text-ash" style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }}>{assessment}</p>
  </div>;
}

function ErrorMessage({ text }: { text: string }) {
  return <p className="mt-2 flex gap-1.5 text-[10.5px] leading-relaxed" style={{ color: "#e36b5d" }}><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{text}</p>;
}

function ImagePanel({ url, label, alt }: { url: string | null; label: string; alt: string }) {
  return <div className="relative bg-[var(--surface-sunken)]">
    {url ? <Image src={url} alt={alt} width={640} height={400} unoptimized className="h-32 w-full object-cover" /> : <div className="flex h-32 items-center justify-center text-[10px] text-slate">Unavailable</div>}
    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[8px] text-white">{label}</span>
  </div>;
}
