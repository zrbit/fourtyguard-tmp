"use client";

import { useEffect, useState } from "react";
import { CellAttributionBreakdown } from "@/components/analysis/CellAttributionBreakdown";
import { ProvenanceTag } from "@/components/ui/ProvenanceTag";
import type { AoiCellSummary, BreakdownItem, CellExample } from "@/lib/reasoning/cellAttribution";

type LiveResponse = {
  live: true;
  predictedAnomaly: number;
  breakdown: BreakdownItem[];
  liveSatellite: { imperviousPct: number; canopyPct: number; cached: boolean; creditsSpent: number };
  modelVersion: string;
};
type FallbackResponse = { live: false; aoi: string; summary: AoiCellSummary; examples: CellExample[] };
type Response_ = LiveResponse | FallbackResponse | { error: string };

const CATEGORY_DOT: Record<string, string> = {
  actionable: "var(--accent)",
  geographic_context: "#7c8b96",
  weather_context: "#c9974f",
  other: "var(--text-tertiary)",
};

/**
 * Tier 2 (per-cell) counterpart to MlAttribution.tsx. Two modes, both
 * served by /api/reasoning/cell-attribution-live:
 *
 * - live: true -- a REAL prediction for the exact clicked point (real
 *   FortyGuard satellite call for the canopy anchor, free sources for
 *   everything else, real XGBoost + SHAP inference). Only available when
 *   the local Python live-prediction server (ml/src/serve/
 *   live_predict_server.py) is running -- a second process the developer
 *   starts deliberately, not part of `npm run dev`.
 * - live: false -- the nearest collected AOI's precomputed summary +
 *   example cells (same data /api/reasoning/cell-attribution already
 *   serves), used whenever the live server isn't reachable. This feature
 *   is additive: the app works identically to before if the live server
 *   is never started.
 */
export function CellAttributionSection({ lat, lng, active }: { lat: number; lng: number; active: boolean }) {
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [data, setData] = useState<Response_ | null>(null);

  const lookupKey = `${lat},${lng}`;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/reasoning/cell-attribution-live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    })
      .then((response) => response.json() as Promise<Response_>)
      .then((payload) => {
        if (cancelled) return;
        if ("error" in payload) {
          setState("unavailable");
          return;
        }
        setData(payload);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lookupKey]);

  if (!active || state === "unavailable") return null;

  return (
    <div className="border-t p-5" style={{ borderColor: "var(--border)" }}>
      {state === "loading" && <p className="text-[12.5px] text-slate">Loading per-cell attribution…</p>}
      {state === "ready" && data && !("error" in data) && data.live && <LiveBreakdown data={data} />}
      {state === "ready" && data && !("error" in data) && !data.live && (
        <>
          <p className="mb-1 text-[11px] leading-relaxed text-slate">
            Shown here: the nearest analyzed neighborhood, <strong>{data.aoi}</strong> — this cell itself wasn&apos;t
            individually part of the training data. (Start the live-prediction server for a real answer at this
            exact point.)
          </p>
          <CellAttributionBreakdown aoiName={data.aoi} summary={data.summary} examples={data.examples} />
        </>
      )}
    </div>
  );
}

function LiveBreakdown({ data }: { data: LiveResponse }) {
  const isHot = data.predictedAnomaly >= 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-display text-[13.5px] font-bold text-paper">Tier 2 — this exact point, live</h3>
        <ProvenanceTag provenance="live" />
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-slate">
        A real prediction computed for this exact location — a live FortyGuard satellite read
        {data.liveSatellite.cached ? " (reused from an earlier click nearby, no new credits spent)" : ` (${data.liveSatellite.creditsSpent.toLocaleString()} credits spent)`}
        {" "}for tree canopy, free sources for everything else.
      </p>
      <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] font-semibold text-paper">Predicted vs. this neighborhood</span>
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wide"
            style={{
              color: isHot ? "var(--thermal-hot)" : "var(--thermal-cold)",
              borderColor: isHot ? "rgba(198,72,58,0.4)" : "rgba(62,127,217,0.4)",
              background: isHot ? "rgba(198,72,58,0.08)" : "rgba(62,127,217,0.08)",
            }}
          >
            {data.predictedAnomaly > 0 ? "+" : ""}
            {data.predictedAnomaly.toFixed(2)}°F
          </span>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {data.breakdown.map((item) => (
            <div key={item.feature} className="flex items-center gap-2 text-[11px]">
              <span className="w-9 shrink-0 text-right font-mono font-semibold text-paper" style={{ fontVariantNumeric: "tabular-nums" }}>
                {item.pct}%
              </span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CATEGORY_DOT[item.category] ?? "var(--text-tertiary)" }} />
              <span className="min-w-0 flex-1 truncate text-ash">{item.label}</span>
              <span className="shrink-0 font-mono text-[10px] text-slate">{item.direction}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 font-mono text-[10.5px] text-slate">
        {data.modelVersion} · live satellite canopy {data.liveSatellite.canopyPct}%, impervious {data.liveSatellite.imperviousPct}%.
      </p>
    </div>
  );
}
