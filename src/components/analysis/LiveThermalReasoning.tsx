import { BrainCircuit, CircleHelp, Crosshair, Sparkles } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";
import { formatSigned } from "@/lib/utils";
import { LiveInvestigation } from "@/components/analysis/LiveInvestigation";
import { CellAttributionSection } from "@/components/analysis/CellAttributionSection";
import { HistoricalComparison } from "@/components/analysis/HistoricalComparison";
import { ChronicHeatCheck } from "@/components/analysis/ChronicHeatCheck";
// AI action plans (InterventionOptimizer) now cover this; commented out for now.
// import { ActionBrief } from "@/components/analysis/ActionBrief";

export function LiveThermalReasoning({ block, allBlocks, onSelect }: { block: BlockMetrics; allBlocks: BlockMetrics[]; onSelect: (id: string) => void }) {
  const anomaly = block.temperature - block.nearbyAverage;
  // Scan-wide average: broad "does this whole area run hot" signal,
  // distinct from `anomaly` above (fine local-outlier signal vs. the 8
  // nearest cells) -- see page.tsx's blocksFromHeatmap for why both matter.
  const scanAnomaly = block.scanAverage !== undefined ? block.temperature - block.scanAverage : null;
  const temperatures = allBlocks.map(candidate => candidate.temperature);
  const average = temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length;
  const deviation = Math.sqrt(temperatures.reduce((sum, value) => sum + (value - average) ** 2, 0) / temperatures.length);
  const zScore = deviation ? (block.temperature - average) / deviation : 0;
  const rank = [...temperatures].sort((a, b) => a - b).findIndex(value => value === block.temperature) + 1;
  const percentile = temperatures.length > 1 ? Math.round(((rank - 1) / (temperatures.length - 1)) * 100) : 50;
  const threshold = Math.max(0.08, deviation * 0.65);
  const isHotter = anomaly > threshold; const isCooler = anomaly < -threshold;
  const confidence = block.nearbyBlockCount >= 6 && allBlocks.length >= 30 ? "High" : "Medium";
  const headline = isHotter ? "This cell stands out as warmer nearby." : isCooler ? "This cell is a useful cooler reference." : "This cell looks typical for its immediate area.";
  const nextMove = isHotter ? "Check whether the heat persists, then look for shade or surface clues." : "Compare another time or choose a nearby cell before taking action.";

  return <section className="border-t p-5" style={{ borderColor: "var(--border)" }}>
    {/* AI action plans (InterventionOptimizer) now cover this; commented out for now. */}
    {/* <ActionBrief block={block} allBlocks={allBlocks} onSelect={onSelect} /> */}
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ash"><BrainCircuit className="h-4 w-4 text-accent-strong" />What this signal means</h2>
      <span className="rounded-full border px-2 py-1 font-mono text-[10px] text-accent-strong" style={{ borderColor: "var(--accent-border)" }}>{confidence} confidence</span>
    </div>
    <p className="mt-3 text-[15px] font-semibold leading-relaxed text-paper">{headline}</p>
    <p className="mt-1 text-[12px] leading-relaxed text-slate">{nextMove}</p>

    <div className={`mt-4 grid gap-2 ${scanAnomaly !== null ? "grid-cols-2" : "grid-cols-3"}`} aria-label="Signal summary">
      <div className="rounded-md border p-2.5" style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }}><div className="font-mono text-[9px] tracking-wide text-slate uppercase">Warmer than nearby</div><div className="mt-1 font-mono text-[15px] text-paper">{formatSigned(anomaly, 2)}°F</div><div className="mt-0.5 text-[10px] text-slate">than 8 close places</div></div>
      {scanAnomaly !== null && <div className="rounded-md border p-2.5" style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }}><div className="font-mono text-[9px] tracking-wide text-slate uppercase">Warmer than scan average</div><div className="mt-1 font-mono text-[15px] text-paper">{formatSigned(scanAnomaly, 2)}°F</div><div className="mt-0.5 text-[10px] text-slate">than all {allBlocks.length} cells in view</div></div>}
      <div className="rounded-md border p-2.5" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}><div className="font-mono text-[9px] tracking-wide text-slate uppercase">Stands out more than</div><div className="mt-1 font-mono text-[15px] text-paper">{percentile}%</div><div className="mt-0.5 text-[10px] text-slate">of this small scan</div></div>
      <div className="rounded-md border p-2.5" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}><div className="font-mono text-[9px] tracking-wide text-slate uppercase">What to do next</div><div className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-paper"><Crosshair className="h-3.5 w-3.5 text-accent-strong" />Check it</div><div className="mt-0.5 text-[10px] text-slate">before action</div></div>
    </div>

    <details className="mt-3 rounded-md border px-3 py-2.5 text-[11px]" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ash"><Sparkles className="h-3.5 w-3.5 text-accent-strong" />How did we decide this? <CircleHelp className="h-3.5 w-3.5 text-slate" /></summary>
      <p className="mt-2 leading-relaxed text-slate">We compare this 100 m cell two ways: against its {block.nearbyBlockCount} closest cells (catches a single hot parcel even inside an otherwise cool area) and against the average of all {allBlocks.length} cells in this scan (catches a whole area running hot, even where every cell in it looks unremarkable next to its immediate neighbors). It tells us <span className="text-ash">where</span> to investigate—not what caused the heat.</p>
      <p className="mt-1 leading-relaxed text-slate">Statistical separation: z-score {formatSigned(zScore, 2)}. Conditions, imagery, and history below help test the explanation.</p>
    </details>

    <div className="mt-5"><div className="flex items-center gap-2"><span className="font-mono text-[10px] tracking-wide text-accent-strong uppercase">Validate this signal</span><span className="h-px flex-1" style={{ background: "var(--border)" }} /></div><p className="mt-1 text-[11px] text-slate">Choose only the checks that answer your next question.</p></div>
    <LiveInvestigation key={block.id} block={block} />
    <ChronicHeatCheck key={`chronic-${block.id}`} block={block} />
    <HistoricalComparison key={`history-${block.id}`} block={block} />
    {/* Tier 1 (MlAttribution) removed from the live per-cell flow (2026-08-31):
        its nearest-AOI lookup has no timestamp tie-break, so with multiple
        historical records at the same AOI coordinates (verified: Van Nuys has
        5, predictions ranging +2.22°F to +11.15°F) it silently shows whichever
        one happens to sort first -- unrelated to what the live scan is
        actually showing. Tier 2 (CellAttributionSection below) uses the
        current cell's own features and doesn't have this problem; Tier 1
        stays valid on the neighborhood/training-data views (AnalysisPanel),
        where blockId lookup is exact, not nearest-neighbor. */}
    <CellAttributionSection key={`cell-${block.id}`} lat={block.lat} lng={block.lng} active />
  </section>;
}
