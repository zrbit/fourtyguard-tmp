import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ThermometerIcon } from "@/components/icons/FactorIcons";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { TrainingDataClient } from "@/components/training/TrainingDataClient";
import { getTrainingCoverage } from "@/lib/training/trainingCoverage";
import { getCellAttributionForAoi, getCellAttributionAoiNames } from "@/lib/reasoning/cellAttribution";

export const metadata = { title: "Training Data — Heat Lens" };

export default function TrainingDataPage() {
  const aois = getTrainingCoverage();
  // Tier 2 per-cell breakdowns (ml/src/serve/export_percell_for_app.py) --
  // only the AOIs that have per-cell enrichment + a per-cell model run get
  // an entry; server component so this reads the static JSON once here,
  // TrainingCoverageMap (client) just receives the already-resolved data.
  const cellAttribution = Object.fromEntries(
    getCellAttributionAoiNames().map((name) => [name, getCellAttributionForAoi(name)!]),
  );

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
            <ThermometerIcon className="h-4 w-4 text-accent" />
            <span className="font-display text-sm font-bold tracking-wide">HEAT LENS</span>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {aois.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate">
          No training coverage data exported yet — run{" "}
          <code className="mx-1 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[12px]">
            python -m src.serve.export_training_coverage
          </code>{" "}
          from ml/.
        </div>
      ) : (
        <TrainingDataClient aois={aois} cellAttribution={cellAttribution} />
      )}
    </div>
  );
}
