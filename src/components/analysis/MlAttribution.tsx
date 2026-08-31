"use client";

import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { ProvenanceTag } from "@/components/ui/ProvenanceTag";
import type { Evidence } from "@/types/thermal";

type ModelInfo = { modelVersion: string; generatedAt: string; cvMae: number | null; cvR2: number | null; nAois: number | null; nRows: number | null };
type Response_ = {
  evidence: Evidence[];
  predictedAnomaly: number;
  decompositionResidual: number;
  model: ModelInfo | null;
  nearestAoi?: string;
  error?: string;
};

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
 * nearest collected AOI and says so explicitly.
 */
export function MlAttribution({
  lookup,
  active,
  observedAnomaly,
  observedComparisonCount,
}: {
  lookup: Lookup;
  active: boolean;
  observedAnomaly?: number;
  observedComparisonCount?: number;
}) {
  // Starts "loading": this only ever renders once `active` is true (guarded
  // below), at which point a fetch is always about to start.
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [nearestAoi, setNearestAoi] = useState<string | null>(null);
  const [predictedAnomaly, setPredictedAnomaly] = useState<number | null>(null);
  const [decompositionResidual, setDecompositionResidual] = useState<number | null>(null);

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
        setPredictedAnomaly(payload.predictedAnomaly);
        setDecompositionResidual(payload.decompositionResidual);
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

  const exportedShapTotal = evidence.reduce((sum, item) => sum + (item.shapValue ?? 0), 0);
  const primaryEvidence = evidence.slice(0, 5);
  const remainingEvidence = evidence.slice(5);

  return (
    <div className="border-t p-5" style={{ borderColor: "var(--border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
          <Cpu className="h-4 w-4 text-slate" />
          Neighborhood model attribution - Tier 1
        </h2>
        <ProvenanceTag provenance="modelled" />
      </div>

      {state === "loading" && <p className="text-[12.5px] text-slate">Loading model attribution…</p>}

      {state === "ready" && (
        <>
          <p className="mb-3 text-[12px] leading-relaxed text-slate">
            These are contributions to an XGBoost model estimate, not a breakdown of the selected cell&apos;s measured
            temperature. The model was trained on real FortyGuard temperature and land-cover data with
            physically-constrained directions and is explained below with SHAP.
            {nearestAoi && (
              <>
                {" "}
                The estimate shown here comes from the nearest analyzed neighborhood, <strong>{nearestAoi}</strong>;
                this exact live cell was not the model input.
              </>
            )}
          </p>

          {predictedAnomaly != null && (
            <div className="mb-3 rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
              <div className="grid grid-cols-2 gap-2.5">
                {observedAnomaly != null && (
                  <ComparisonValue
                    label="Selected cell observation"
                    value={observedAnomaly}
                    note={`vs. ${observedComparisonCount ?? 8} nearby cells`}
                  />
                )}
                <ComparisonValue
                  label="Neighborhood model estimate"
                  value={predictedAnomaly}
                  note={nearestAoi ? `for ${nearestAoi}` : "for the model input"}
                />
              </div>
              {observedAnomaly != null && (
                <p className="mt-2.5 text-[10.5px] leading-relaxed text-slate">
                  These numbers use different reference groups: the live observation compares this cell with nearby
                  cells, while Tier 1 estimates a neighborhood anomaly. They are not expected to match.
                </p>
              )}
            </div>
          )}

          <ul className="flex flex-col gap-2.5">
            {primaryEvidence.map((item) => <ContributionItem key={item.id} item={item} />)}
          </ul>

          {remainingEvidence.length > 0 && (
            <details className="mt-2.5 rounded-md border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
              <summary className="cursor-pointer font-mono text-[10.5px] text-slate hover:text-ash">
                Show {remainingEvidence.length} remaining model factors
              </summary>
              <ul className="mt-2.5 flex flex-col gap-2.5">
                {remainingEvidence.map((item) => <ContributionItem key={item.id} item={item} />)}
              </ul>
            </details>
          )}

          {predictedAnomaly != null && decompositionResidual != null && (
            <div className="mt-3 rounded-md border p-3 font-mono text-[10.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
              <div className="text-slate">How the model estimate adds up</div>
              <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-paper">
                <span>Model estimate</span><span>{formatSignedF(predictedAnomaly)}</span>
                <span>Baseline + hidden context</span><span>{formatSignedF(decompositionResidual)}</span>
                <span>{evidence.length} listed SHAP factors</span><span>{formatSignedF(exportedShapTotal)}</span>
              </div>
              <p className="mt-1.5 font-sans text-[10.5px] leading-relaxed text-slate">
                SHAP explains the model&apos;s estimate relative to its learned baseline. The residual combines that
                baseline with model-only context intentionally omitted from the intervention-facing list. The last
                two rows sum to the model estimate.
              </p>
            </div>
          )}
          {model && (
            <p className="mt-3 font-mono text-[10.5px] text-slate">
              {model.modelVersion}
              {model.cvMae != null ? ` · cross-validated MAE ${model.cvMae.toFixed(2)}°F` : ""}
              {model.cvR2 != null ? `, R² ${model.cvR2.toFixed(2)}` : ""} · trained on
              {model.nRows != null && model.nAois != null ? ` ${model.nRows} rows across ${model.nAois} LA neighborhoods` : " a real dataset"}
              {" "}— treat as illustrative, not a mature model.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ComparisonValue({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-wide text-slate uppercase">{label}</div>
      <div className="mt-1 font-mono text-[15px] font-semibold text-paper">{formatSignedF(value)}</div>
      <div className="mt-0.5 text-[10px] text-slate">{note}</div>
    </div>
  );
}

function ContributionItem({ item }: { item: Evidence }) {
  const color = item.warmingEffect === "warmer"
    ? "var(--thermal-hot)"
    : item.warmingEffect === "cooler"
      ? "var(--thermal-cold)"
      : "var(--text-secondary)";
  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"
      style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
    >
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-paper">{item.metric}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-slate">{item.explanation}</div>
      </div>
      <span
        className="shrink-0 rounded-full border px-2 py-1 text-right font-mono text-[10px] tracking-wide"
        style={{ borderColor: "var(--border-strong)", color }}
      >
        {item.shapValue != null && <span className="block font-semibold">{formatSignedF(item.shapValue)}</span>}
        <span className="block uppercase">{item.warmingEffect}</span>
      </span>
    </li>
  );
}

function formatSignedF(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}°F`;
}
