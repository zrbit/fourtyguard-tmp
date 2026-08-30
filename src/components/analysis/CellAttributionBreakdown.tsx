import type { AoiCellSummary, CellExample } from "@/lib/reasoning/cellAttribution";

/**
 * Tier 2's "why is this block hot" percentage breakdown -- the honest
 * version, per the product decision (2026-08-30): elevation and distance
 * to coast dominating is a real, physically expected result (marine-layer
 * cooling, the lapse rate), so this shows the full breakdown across three
 * categories rather than filtering down to only actionable recommendations.
 *
 * Server-renderable (no client state) -- takes the AOI's precomputed
 * summary + two representative real cells (hottest/coolest, from
 * ml/src/serve/export_percell_for_app.py) as props. Colors reuse the
 * existing design tokens: --accent for actionable, a neutral slate for
 * geographic context, and a muted amber for weather -- kept visually
 * distinct from --thermal-hot/--thermal-cold, which stay reserved for
 * temperature itself, not category tagging.
 */

const CATEGORY_META: Record<
  AoiCellSummary["topDriverPct"] extends infer T ? keyof T : never,
  { label: string; color: string; dim: string }
> = {
  actionable: { label: "Actionable — a city could change this", color: "var(--accent)", dim: "var(--accent-dim)" },
  geographic_context: { label: "Geographic context — fixed, not actionable", color: "#7c8b96", dim: "rgba(124,139,150,0.16)" },
  weather_context: { label: "Weather condition — today only", color: "#c9974f", dim: "rgba(201,151,79,0.14)" },
};

export function CellAttributionBreakdown({
  aoiName,
  summary,
  examples,
}: {
  aoiName: string;
  summary: AoiCellSummary;
  examples: CellExample[];
}) {
  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <h3 className="font-display text-[13.5px] font-bold text-paper">Tier 2 — why cells in {aoiName} run hot</h3>
      <p className="mt-1 text-[11.5px] leading-relaxed text-slate">
        Across this neighborhood&apos;s {summary.nCells.toLocaleString()} analyzed 100m cells, the single largest
        SHAP driver is most often:
      </p>

      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full border" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
        {(Object.keys(CATEGORY_META) as Array<keyof typeof CATEGORY_META>).map((key) => (
          <div key={key} style={{ width: `${summary.topDriverPct[key]}%`, background: CATEGORY_META[key].color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-slate">
        {(Object.keys(CATEGORY_META) as Array<keyof typeof CATEGORY_META>).map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: CATEGORY_META[key].color }} />
            {summary.topDriverPct[key]}% · {CATEGORY_META[key].label}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {examples.map((example) => (
          <ExampleCellCard key={example.label} example={example} />
        ))}
      </div>
    </div>
  );
}

function ExampleCellCard({ example }: { example: CellExample }) {
  const isHot = example.cellAnomaly >= 0;
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-paper capitalize">{example.label} cell in this neighborhood</span>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wide"
          style={{
            color: isHot ? "var(--thermal-hot)" : "var(--thermal-cold)",
            borderColor: isHot ? "rgba(198,72,58,0.4)" : "rgba(62,127,217,0.4)",
            background: isHot ? "rgba(198,72,58,0.08)" : "rgba(62,127,217,0.08)",
          }}
        >
          {example.cellAnomaly > 0 ? "+" : ""}
          {example.cellAnomaly.toFixed(2)}°F
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        {example.breakdown.map((item) => (
          <div key={item.feature} className="flex items-center gap-2 text-[11px]">
            <span className="w-9 shrink-0 text-right font-mono font-semibold text-paper" style={{ fontVariantNumeric: "tabular-nums" }}>
              {item.pct}%
            </span>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CATEGORY_META[item.category as keyof typeof CATEGORY_META]?.color ?? "var(--text-tertiary)" }} />
            <span className="min-w-0 flex-1 truncate text-ash">{item.label}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate">{item.direction}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
