import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ActionPlansView } from "@/components/analysis/ActionPlansView";
import { getActionPlanTilesByTier, getClusterActionPlanMeta } from "@/lib/reasoning/clusterActionPlans";

export const metadata = { title: "Action Plans — Heat Lens" };

export default function ActionPlansPage() {
  const meta = getClusterActionPlanMeta();
  const priorityTiles = getActionPlanTilesByTier("priority");
  const geographicTiles = getActionPlanTilesByTier("geographic");

  return (
    <div className="flex h-dvh flex-col">
      <header
        className="flex h-14 flex-none items-center justify-between gap-4 border-b px-4 sm:px-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 font-mono text-xs text-slate transition-colors hover:text-paper">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Live map
          </Link>
          <span className="h-4 w-px" style={{ background: "var(--border-strong)" }} />
          <div className="flex items-center gap-2.5">
            <ClipboardList className="h-4 w-4 text-accent" />
            <span className="font-display text-sm font-bold tracking-wide">HEAT LENS</span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {!meta ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate">
          No action-plan data exported yet — run{" "}
          <code className="mx-1 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[12px]">
            python -m src.serve.export_clusters_for_app
          </code>{" "}
          from ml/.
        </div>
      ) : (
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-5 sm:p-8">
          <div className="mx-auto w-full max-w-2xl">
            <div className="font-mono text-[10.5px] tracking-[0.09em] text-slate uppercase">
              Tier 2 aggregated · {meta.tileSizeM}m tiles
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold text-paper text-balance">
              Where to focus, block by block
            </h1>
            <p className="mt-2 max-w-[58ch] text-[13.5px] leading-relaxed text-slate">
              Every ~{meta.tileSizeM}m tile with at least {meta.minCellsPerTile} analyzed cells, ranked by how much
              hotter it runs than its own surroundings. Split into tiles worth an official&apos;s attention
              (a real, actionable cause exists) and tiles that are hot for reasons no policy can change.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-2.5">
              <Stat value={meta.nPriorityTiles} label="Priority tiles" accent />
              <Stat value={meta.nGeographicTiles} label="Geography-driven" />
              <Stat value={meta.nTypicalTiles} label="Typical / not notably hot" />
            </div>
          </div>

          <ActionPlansView priorityTiles={priorityTiles} geographicTiles={geographicTiles} tileSizeM={meta.tileSizeM} />

          <footer className="mx-auto mt-10 w-full max-w-2xl border-t pt-4 text-[11px] leading-relaxed text-slate" style={{ borderColor: "var(--border)" }}>
            {meta.modelVersion} · {meta.nTiles.toLocaleString()} tiles aggregated from Tier 2&apos;s per-cell model.
            Tiles are a fixed geographic grid, not an adaptive clustering — the same location always maps to the
            same tile across runs.
            {meta.hasFeasibilityScreen && (
              <>
                {" "}Priority tiles are additionally screened against real OSM road/building/parking/canopy
                geometry for which interventions are physically plausible before any are suggested — screening
                only, not a construction-ready feasibility study.
              </>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div
      className="rounded-md border p-2.5"
      style={{ borderColor: accent ? "var(--accent-border)" : "var(--border)", background: accent ? "var(--accent-dim)" : "var(--surface-raised)" }}
    >
      <div
        className="font-mono text-[22px] leading-tight font-medium"
        style={{ fontVariantNumeric: "tabular-nums", color: accent ? "var(--accent-strong)" : "var(--text-primary)" }}
      >
        {value}
      </div>
      <div className="mt-0.5 font-mono text-[10px] tracking-wide text-slate uppercase">{label}</div>
    </div>
  );
}
