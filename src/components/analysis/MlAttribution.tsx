"use client";

import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { ProvenanceTag } from "@/components/ui/ProvenanceTag";
import type { Evidence } from "@/types/thermal";

type ModelInfo = { modelVersion: string; generatedAt: string; cvMae: number | null; cvR2: number | null };
type Response_ = { evidence: Evidence[]; model: ModelInfo | null; nearestAoi?: string; error?: string };

type Lookup = { blockId: string } | { lat: number; lng: number };

/**
 * Phase 8 (static/precomputed pass): shows the trained XGBoost model's
 * SHAP-ranked evidence, fetched from the static export at
 * ml/src/serve/export_for_app.py -> src/lib/mock-data/ml-explanations.json
 * via /api/reasoning/ml-explain. Kept as its own clearly-labeled section
 * rather than merged into a deterministic hypothesis list, so provenance
 * stays unambiguous -- this is a separate, independently-trained reasoning
 * path.
 *
 * Two lookup modes (see the route for why): `blockId` for the 14 demo
 * blocks, or `lat`/`lng` for the live homepage's per-cell FortyGuard flow,
 * which has no shared id with the demo blocks -- that mode finds the
 * nearest of the 17 collected AOIs and says so explicitly.
 */
export function MlAttribution({ lookup, active }: { lookup: Lookup; active: boolean }) {
  // Starts "loading": this only ever renders once `active` is true (guarded
  // below), at which point a fetch is always about to start.
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [nearestAoi, setNearestAoi] = useState<string | null>(null);

  const lookupKey = "blockId" in lookup ? lookup.blockId : `${lookup.lat},${lookup.lng}`;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const query = "blockId" in lookup
      ? `blockId=${encodeURIComponent(lookup.blockId)}`
      : `lat=${lookup.lat}&lng=${lookup.lng}`;
    fetch(`/api/reasoning/ml-explain?${query}`)
      .then((response) => response.json() as Promise<Response_>)
      .then((payload) => {
        if (cancelled) return;
        if (!payload.evidence?.length) {
          setState("unavailable");
          return;
        }
        setEvidence(payload.evidence);
        setModel(payload.model ?? null);
        setNearestAoi(payload.nearestAoi ?? null);
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
          <Cpu className="h-4 w-4 text-slate" />
          Model attribution
        </h2>
        <ProvenanceTag provenance="modelled" />
      </div>

      {state === "loading" && <p className="text-[12.5px] text-slate">Loading model attribution…</p>}

      {state === "ready" && (
        <>
          <p className="mb-3 text-[12px] leading-relaxed text-slate">
            An XGBoost model, trained on real FortyGuard temperature and land-cover data with physically-constrained
            directions (more pavement can only push warmer, more tree canopy only cooler — never backwards),
            independently ranks each factor&apos;s contribution below via SHAP.
            {nearestAoi && (
              <>
                {" "}
                Shown here: the nearest analyzed neighborhood, <strong>{nearestAoi}</strong> — this cell itself
                wasn&apos;t individually part of the training data.
              </>
            )}
          </p>
          <ul className="flex flex-col gap-2.5">
            {evidence.slice(0, 5).map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"
                style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-paper">{e.metric}</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-slate">{e.explanation}</div>
                </div>
                <span
                  className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10.5px] tracking-wide uppercase"
                  style={{
                    borderColor: "var(--border-strong)",
                    color:
                      e.warmingEffect === "warmer"
                        ? "var(--thermal-hot)"
                        : e.warmingEffect === "cooler"
                          ? "var(--thermal-cold)"
                          : "var(--text-secondary)",
                  }}
                >
                  {e.warmingEffect}
                </span>
              </li>
            ))}
          </ul>
          {model && (
            <p className="mt-3 font-mono text-[10.5px] text-slate">
              {model.modelVersion}
              {model.cvMae != null ? ` · cross-validated MAE ${model.cvMae.toFixed(2)}°F` : ""} · trained on a small
              real dataset (17 LA neighborhoods) — treat as illustrative, not a mature model.
            </p>
          )}
        </>
      )}
    </div>
  );
}
