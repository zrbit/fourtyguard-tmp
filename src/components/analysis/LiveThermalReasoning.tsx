import { BrainCircuit, CircleHelp, Crosshair, Sparkles } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";
import { formatSigned } from "@/lib/utils";
import { LiveInvestigation } from "@/components/analysis/LiveInvestigation";
import { HistoricalComparison } from "@/components/analysis/HistoricalComparison";
import { ChronicHeatCheck } from "@/components/analysis/ChronicHeatCheck";

export function LiveThermalReasoning({ block, allBlocks }: { block: BlockMetrics; allBlocks: BlockMetrics[] }) {
  const anomaly = block.temperature - block.nearbyAverage;
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
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ash"><BrainCircuit className="h-4 w-4 text-accent-strong" />What this signal means</h2>
      <span className="rounded-full border px-2 py-1 font-mono text-[10px] text-accent-strong" style={{ borderColor: "var(--accent-border)" }}>{confidence} confidence</span>
    </div>
    <p className="mt-3 text-[15px] font-semibold leading-relaxed text-paper">{headline}</p>
    <p className="mt-1 text-[12px] leading-relaxed text-slate">{nextMove}</p>

    <div className="mt-4 grid grid-cols-3 gap-2" aria-label="Signal summary">
      <div className="rounded-md border p-2.5" style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }}><div className="font-mono text-[9px] tracking-wide text-slate uppercase">Local signal</div><div className="mt-1 font-mono text-[15px] text-paper">{formatSigned(anomaly, 2)}°F</div><div className="mt-0.5 text-[10px] text-slate">vs 8 nearby</div></div>
      <div className="rounded-md border p-2.5" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}><div className="font-mono text-[9px] tracking-wide text-slate uppercase">Area rank</div><div className="mt-1 font-mono text-[15px] text-paper">{percentile}th</div><div className="mt-0.5 text-[10px] text-slate">of this scan</div></div>
      <div className="rounded-md border p-2.5" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}><div className="font-mono text-[9px] tracking-wide text-slate uppercase">Next step</div><div className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-paper"><Crosshair className="h-3.5 w-3.5 text-accent-strong" />Validate</div><div className="mt-0.5 text-[10px] text-slate">before action</div></div>
    </div>

    <details className="mt-3 rounded-md border px-3 py-2.5 text-[11px]" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ash"><Sparkles className="h-3.5 w-3.5 text-accent-strong" />How did we decide this? <CircleHelp className="h-3.5 w-3.5 text-slate" /></summary>
      <p className="mt-2 leading-relaxed text-slate">We compare this 100 m cell with its {block.nearbyBlockCount} closest cells and its position across {allBlocks.length} live cells. It tells us <span className="text-ash">where</span> to investigate—not what caused the heat.</p>
      <p className="mt-1 leading-relaxed text-slate">Statistical separation: z-score {formatSigned(zScore, 2)}. Conditions, imagery, and history below help test the explanation.</p>
    </details>

    <div className="mt-5"><div className="flex items-center gap-2"><span className="font-mono text-[10px] tracking-wide text-accent-strong uppercase">Validate this signal</span><span className="h-px flex-1" style={{ background: "var(--border)" }} /></div><p className="mt-1 text-[11px] text-slate">Choose only the checks that answer your next question.</p></div>
    <LiveInvestigation key={block.id} block={block} />
    <ChronicHeatCheck key={`chronic-${block.id}`} block={block} />
    <HistoricalComparison key={`history-${block.id}`} block={block} />
  </section>;
}
