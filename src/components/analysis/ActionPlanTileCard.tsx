import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { ActionPlanTile } from "@/lib/reasoning/clusterActionPlans";
import { ActionPlanImagery } from "./ActionPlanImagery";

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  actionable: { label: "Actionable", color: "var(--accent)" },
  geographic_context: { label: "Geographic context", color: "#7c8b96" },
  weather_context: { label: "Weather condition", color: "#c9974f" },
  other: { label: "Other", color: "var(--text-tertiary)" },
};

/**
 * One ~450m tile's action-plan card: rank, location, temperature anomaly,
 * a plain-language recommendation (only present for "priority" tiles --
 * see export_clusters_for_app.py), and the same percentage-breakdown
 * vocabulary as CellAttributionBreakdown so the two views (per-cell,
 * per-tile) read as one consistent system.
 */
export function ActionPlanTileCard({ tile, rank }: { tile: ActionPlanTile; rank?: number }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {rank != null && (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold"
              style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }}
            >
              {rank}
            </span>
          )}
          <div>
            <div className="font-display text-[14.5px] font-bold text-paper">Near {tile.primaryAoi}</div>
            <div className="font-mono text-[10px] text-slate">
              {tile.centroidLat.toFixed(4)}, {tile.centroidLng.toFixed(4)} · {tile.nCells} cells analyzed
            </div>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 font-mono text-[13px] font-bold"
          style={{
            color: "var(--thermal-hot)",
            borderColor: "rgba(198,72,58,0.4)",
            background: "rgba(198,72,58,0.08)",
          }}
        >
          +{tile.avgCellAnomaly.toFixed(2)}°F
        </span>
      </div>

      {tile.recommendation && (
        <p className="mt-3 rounded-md border px-3 py-2.5 text-[12px] leading-relaxed text-ash" style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }}>
          {tile.recommendation}
        </p>
      )}

      {tile.siteType && <FeasibilityScreen tile={tile} />}

      <div className="mt-3 flex flex-col gap-1">
        {tile.breakdown.slice(0, 4).map((item) => (
          <div key={item.feature} className="flex items-center gap-2 text-[11px]">
            <span className="w-9 shrink-0 text-right font-mono font-semibold text-paper" style={{ fontVariantNumeric: "tabular-nums" }}>
              {item.pct}%
            </span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CATEGORY_META[item.category]?.color ?? "var(--text-tertiary)" }} />
            <span className="min-w-0 flex-1 truncate text-ash">{item.label}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate">{item.direction}</span>
          </div>
        ))}
      </div>

      {tile.priorityTier === "priority" && <ActionPlanImagery tileId={tile.tileId} />}
    </div>
  );
}

/**
 * Intervention suitability screening -- explicitly NOT a construction-ready
 * feasibility study. Classifies the tile's dominant land use from OSM
 * geometry (ml/src/serve/site_type.py) and shows which interventions are
 * physically plausible here versus excluded, before any generic advice
 * ("plant trees") gets suggested on a site where it can't apply (a highway
 * shoulder, a rooftop-dominated block).
 */
function FeasibilityScreen({ tile }: { tile: ActionPlanTile }) {
  return (
    <div className="mt-3 rounded-md border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9.5px] tracking-wide text-slate uppercase">Intervention suitability screening</span>
        <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-ash" style={{ borderColor: "var(--border-strong)" }}>{tile.siteTypeLabel}</span>
      </div>

      {!!tile.suitableActions?.length && (
        <div className="mt-2 flex flex-col gap-1">
          {tile.suitableActions.map((action) => (
            <div key={action} className="flex items-start gap-1.5 text-[11.5px] text-ash">
              <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "var(--accent)" }} />
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}

      {!!tile.excludedActions?.length && (
        <div className="mt-2 flex flex-col gap-1">
          {tile.excludedActions.map((item) => (
            <div key={item.action} className="flex items-start gap-1.5 text-[11px]">
              <CircleX className="mt-0.5 h-3 w-3 shrink-0 text-slate" />
              <span className="text-slate">
                <span className="line-through decoration-[var(--border-strong)]">{item.action}</span> excluded — {item.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {!!tile.requiresFieldVerification?.length && (
        <div className="mt-2.5 flex items-start gap-1.5 border-t pt-2 text-[10.5px] leading-relaxed text-slate" style={{ borderColor: "var(--border)" }}>
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-slate" />
          <span>Screening only — still requires field verification: {tile.requiresFieldVerification.join(", ").toLowerCase()}.</span>
        </div>
      )}
    </div>
  );
}
