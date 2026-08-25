import { BrainCircuit, CheckCircle2, TriangleAlert } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";
import { formatSigned, thermalColor } from "@/lib/utils";

export function LiveThermalReasoning({
  block,
  allBlocks,
}: {
  block: BlockMetrics;
  allBlocks: BlockMetrics[];
}) {
  const anomaly = block.temperature - block.nearbyAverage;
  const sorted = [...allBlocks].sort((a, b) => a.temperature - b.temperature);
  const rank = sorted.findIndex(candidate => candidate.id === block.id) + 1;
  const percentile = sorted.length > 1
    ? Math.round(((rank - 1) / (sorted.length - 1)) * 100)
    : 50;
  const spread = block.distribution.length
    ? Math.max(...block.distribution) - Math.min(...block.distribution)
    : 0;
  const aoiMean = allBlocks.reduce((sum, candidate) => sum + candidate.temperature, 0) / allBlocks.length;
  const variance = allBlocks.reduce((sum, candidate) => sum + (candidate.temperature - aoiMean) ** 2, 0) / allBlocks.length;
  const standardDeviation = Math.sqrt(variance);
  const zScore = standardDeviation ? (block.temperature - aoiMean) / standardDeviation : 0;
  const aoiRange = sorted.at(-1)!.temperature - sorted[0].temperature;
  const confidence = block.nearbyBlockCount >= 6 && allBlocks.length >= 30 ? "High" : "Medium";
  const localThreshold = Math.max(0.08, standardDeviation * 0.65);
  const direction = anomaly > localThreshold ? "hotter" : anomaly < -localThreshold ? "cooler" : "similar";
  const significance = Math.abs(zScore) >= 2
    ? "strong AOI outlier"
    : Math.abs(zScore) >= 1
      ? "moderate AOI deviation"
      : "typical for this AOI";
  const conclusion = direction === "similar"
    ? `This cell is ${significance} and does not separate meaningfully from its closest spatial controls.`
    : `This cell is locally ${direction} and is a ${significance}; the difference persists against nearby spatial controls.`;
  const areaAssessment = aoiRange < 1.5
    ? `The whole scan is thermally compact (${aoiRange.toFixed(2)}°F range), so this snapshot does not show an intense neighborhood-scale heat island.`
    : `The scan has a ${aoiRange.toFixed(2)}°F range, indicating meaningful spatial separation inside the study area.`;

  return (
    <section className="border-t p-5" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ash">
          <BrainCircuit className="h-4 w-4 text-accent-strong" />
          Thermal reasoning
        </h2>
        <span className="rounded-full border px-2 py-1 font-mono text-[10px] text-accent-strong" style={{ borderColor: "var(--accent-border)" }}>
          {confidence} data confidence
        </span>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-ash">{conclusion}</p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-slate">{areaAssessment}</p>

      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-accent-strong" />
          <p className="text-[11.5px] leading-relaxed text-slate">
            <span className="text-ash">Local comparison:</span> {formatSigned(anomaly, 2)}°F against the {block.nearbyBlockCount} geographically nearest cells.
          </p>
        </div>
        <div className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-accent-strong" />
          <p className="text-[11.5px] leading-relaxed text-slate">
            <span className="text-ash">AOI position:</span> {percentile}th percentile among {allBlocks.length} live cells; z-score {formatSigned(zScore, 2)} and nearby spread {spread.toFixed(2)}°F.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border p-3" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
        <div className="flex gap-2">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-none" style={{ color: thermalColor(anomaly) }} />
          <p className="text-[11px] leading-relaxed text-slate">
            Temperature establishes <span className="text-ash">where</span> the anomaly is, not <span className="text-ash">why</span>. Canopy, surface, wind, and historical evidence are required before assigning a cause.
          </p>
        </div>
      </div>
    </section>
  );
}
