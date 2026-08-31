"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { List, Map as MapIcon } from "lucide-react";
import { ActionPlanTileCard } from "@/components/analysis/ActionPlanTileCard";
import type { ActionPlanTile } from "@/lib/reasoning/clusterActionPlans";

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
 */
export function ActionPlansView({
  priorityTiles,
  geographicTiles,
  tileSizeM,
}: {
  priorityTiles: ActionPlanTile[];
  geographicTiles: ActionPlanTile[];
  tileSizeM: number;
}) {
  const [view, setView] = useState<"list" | "map">("list");

  return (
    <>
      <div className="mt-6 flex items-center gap-1 rounded-md border p-0.5" style={{ borderColor: "var(--border)", width: "fit-content" }}>
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
        </div>
      ) : (
        <div className="mt-6 -mx-5 flex min-h-0 flex-1 sm:-mx-8">
          <ActionPlansMap priorityTiles={priorityTiles} geographicTiles={geographicTiles} tileSizeM={tileSizeM} />
        </div>
      )}
    </>
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
