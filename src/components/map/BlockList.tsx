import { cn, formatSigned, thermalColor } from "@/lib/utils";
import type { BlockMetrics } from "@/types/thermal";

/**
 * Keyboard-operable equivalent of clicking a map tile (§10 of the design
 * system: every map interaction needs a non-map counterpart). Also the
 * only way to select a block for anyone on a touch device too imprecise
 * to hit a ~55m tile at city zoom.
 */
export function BlockList({
  blocks,
  selectedId,
  onSelect,
}: {
  blocks: BlockMetrics[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const mostUnusual = [...blocks]
    .sort((a, b) => Math.abs(b.temperature - b.nearbyAverage) - Math.abs(a.temperature - a.nearbyAverage))
    .slice(0, 8);
  const selected = blocks.find(block => block.id === selectedId);
  const choices = selected && !mostUnusual.some(block => block.id === selected.id)
    ? [selected, ...mostUnusual]
    : mostUnusual;

  return (
    <div
      // Below `lg` the analysis panel becomes a bottom sheet docked at
      // inset-x-0 bottom-0 — anchoring this to bottom-4 there would put it
      // directly underneath that sheet. Sit just above the sheet's collapsed
      // ("peek") height on small screens instead; lg+ reverts to bottom-4
      // since the panel is docked beside the map there, not below it.
      className="pointer-events-auto absolute right-4 bottom-[calc(42dvh+12px)] z-10 max-w-[calc(100%-2rem)] rounded-md border p-2 backdrop-blur-sm lg:hidden"
      style={{ borderColor: "var(--border)", background: "var(--overlay)" }}
      role="group"
      aria-label="Select a notable cell"
    >
      <div className="mb-1 font-mono text-[9px] tracking-wide text-slate uppercase">Most unusual cells</div>
      <div className="flex flex-wrap gap-1.5">
      {choices.map((b) => {
        const anomaly = b.temperature - b.nearbyAverage;
        const active = b.id === selectedId;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            aria-pressed={active}
            className={cn(
              "flex flex-none cursor-pointer flex-col items-start gap-0.5 rounded-sm border px-2.5 py-1.5 text-left transition-colors duration-150",
            )}
            style={{
              borderColor: active ? "var(--accent-border)" : "var(--border)",
              background: active ? "var(--accent-dim)" : "var(--surface)",
            }}
          >
            <span className="font-mono text-[10px] tracking-wide text-slate uppercase">{active ? "Selected" : "Cell"}</span>
            <span
              className="font-mono text-[11px] font-semibold"
              style={{ color: thermalColor(anomaly) }}
            >
              {formatSigned(anomaly)}°F
            </span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
