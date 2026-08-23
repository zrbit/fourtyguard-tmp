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
  return (
    <div
      // Below `lg` the analysis panel becomes a bottom sheet docked at
      // inset-x-0 bottom-0 — anchoring this to bottom-4 there would put it
      // directly underneath that sheet. Sit just above the sheet's collapsed
      // ("peek") height on small screens instead; lg+ reverts to bottom-4
      // since the panel is docked beside the map there, not below it.
      className="pointer-events-auto absolute right-4 bottom-[calc(42dvh+12px)] z-10 flex max-w-[calc(100%-2rem)] gap-2 overflow-x-auto rounded-md border p-2 backdrop-blur-sm lg:bottom-4"
      style={{ borderColor: "var(--border)", background: "rgba(13,15,19,0.72)" }}
      role="group"
      aria-label="Select a block"
    >
      {blocks.map((b) => {
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
            <span className="font-mono text-[10px] tracking-wide text-slate uppercase">{b.id}</span>
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
  );
}
