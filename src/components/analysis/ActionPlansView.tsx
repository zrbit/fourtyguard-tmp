"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { List, Map as MapIcon } from "lucide-react";
import { ActionPlanTileCard } from "@/components/analysis/ActionPlanTileCard";
import type { ActionPlanTile, ClusterActionPlanMeta } from "@/lib/reasoning/clusterActionPlans";

// maplibre-gl touches `window` at import time, so the map view is dynamic
// with ssr:false, same convention as every other map in the app
// (ThermalMap, TrainingCoverageMap).
const ActionPlansMap = dynamic(
  () => import("@/components/analysis/ActionPlansMap").then((mod) => mod.ActionPlansMap),
  { ssr: false, loading: () => <div className="flex flex-1 items-center justify-center text-[12.5px] text-slate">Loading map…</div> },
);

/**
 * List/Map toggle for the Action Plans page -- the map is an alternative
 * presentation of the exact same tiles the list already shows, not a
 * separate feature, so it defaults to List (today's unchanged behavior)
 * and stays purely opt-in.
 *
 * Owns the full scrollable content area (intro/stats/footer included, not
 * just the toggle+list/map) specifically so Map mode can hide that
 * surrounding text -- on a shorter/laptop viewport, the intro paragraph +
 * 3 stat cards + footer disclaimer ate most of the available height before
 * the map ever got a turn (confirmed live on the deployed site: the map
 * rendered correctly at 1920x1080 but visibly shrank at 1366x768). Neither
 * the live map page nor /training-data burdens their map with this much
 * fixed text above it; List mode keeps all of it, since that view scrolls
 * naturally and the context is worth the space there.
 */
export function ActionPlansView({
  priorityTiles,
  geographicTiles,
  typicalTiles,
  meta,
}: {
  priorityTiles: ActionPlanTile[];
  geographicTiles: ActionPlanTile[];
  typicalTiles: ActionPlanTile[];
  meta: ClusterActionPlanMeta;
}) {
  const [view, setView] = useState<"list" | "map">("list");

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-5 sm:p-8">
      {view === "list" && (
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
      )}

      {view === "map" && (
        <div className="mx-auto flex w-full max-w-2xl items-baseline justify-between gap-3">
          <h1 className="font-display text-[15px] font-bold text-paper">Where to focus, block by block</h1>
          <span className="font-mono text-[10.5px] text-slate">
            {meta.nPriorityTiles} priority · {meta.nGeographicTiles} geography-driven
          </span>
        </div>
      )}

      <div className={`mt-6 flex items-center gap-1 rounded-md border p-0.5 ${view === "map" ? "mx-auto w-full max-w-2xl" : ""}`} style={{ borderColor: "var(--border)", width: view === "map" ? undefined : "fit-content" }}>
        <ViewButton active={view === "list"} onClick={() => setView("list")} icon={<List className="h-3.5 w-3.5" />} label="List" />
        <ViewButton active={view === "map"} onClick={() => setView("map")} icon={<MapIcon className="h-3.5 w-3.5" />} label="Map" />
      </div>

      {view === "list" ? (
        <div className="mt-6">
          <section>
            <SectionHeading title="Priority — worth investigating" note="Hot, with a real actionable lever." />
            <div className="mt-3 flex flex-col gap-3">
              {priorityTiles.map((tile, i) => (
                <ActionPlanTileCard key={tile.tileId} tile={tile} rank={i + 1} />
              ))}
            </div>
          </section>

          {geographicTiles.length > 0 && (
            <section className="mt-8">
              <SectionHeading
                title="Hot, but not actionable"
                note="Elevation and coastal distance explain these — no policy lever changes them. Shown for transparency, not action."
              />
              <details className="mt-3">
                <summary className="cursor-pointer font-mono text-[11px] text-slate hover:text-ash">
                  Show all {geographicTiles.length} tiles
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {geographicTiles.map((tile) => (
                    <ActionPlanTileCard key={tile.tileId} tile={tile} />
                  ))}
                </div>
              </details>
            </section>
          )}

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
      ) : (
        <div className="mt-4 -mx-5 flex min-h-0 flex-1 sm:-mx-8">
          <ActionPlansMap priorityTiles={priorityTiles} geographicTiles={geographicTiles} typicalTiles={typicalTiles} tileSizeM={meta.tileSizeM} />
        </div>
      )}
    </div>
  );
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[11px] tracking-wide transition-colors"
      style={{
        color: active ? "var(--accent-strong)" : "var(--text-tertiary)",
        background: active ? "var(--accent-dim)" : "transparent",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 className="font-display text-[15px] font-bold text-paper">{title}</h2>
      <p className="mt-0.5 text-[11.5px] text-slate">{note}</p>
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
