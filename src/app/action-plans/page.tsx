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
  const typicalTiles = getActionPlanTilesByTier("typical");

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
        <ActionPlansView priorityTiles={priorityTiles} geographicTiles={geographicTiles} typicalTiles={typicalTiles} meta={meta} />
      )}
    </div>
  );
}
