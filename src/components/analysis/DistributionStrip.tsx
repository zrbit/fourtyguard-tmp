import { iqr } from "@/lib/stats";
import { thermalColor } from "@/lib/utils";

export function DistributionStrip({
  target,
  distribution,
}: {
  target: number;
  distribution: number[];
}) {
  const all = [...distribution, target];
  const min = Math.min(...all) - 1.5;
  const max = Math.max(...all) + 1.5;
  const span = max - min;
  const pct = (v: number) => ((v - min) / span) * 100;
  const { q1, q3 } = iqr(distribution);
  const avg = distribution.reduce((a, b) => a + b, 0) / distribution.length;
  const markerColor = thermalColor(target - avg);

  return (
    <div className="relative mt-5 h-10">
      <span
        className="absolute -top-4 font-mono text-[10px] text-slate"
        style={{ left: "0%" }}
      >
        {min.toFixed(0)}°
      </span>
      <span
        className="absolute -top-4 font-mono text-[10px] text-slate"
        style={{ right: "0%" }}
      >
        {max.toFixed(0)}°
      </span>

      <div
        className="absolute top-[18px] h-1 w-full rounded-full"
        style={{ background: "var(--border-strong)" }}
      />
      <div
        className="absolute top-[18px] h-1 rounded-full"
        style={{
          left: `${pct(q1)}%`,
          width: `${pct(q3) - pct(q1)}%`,
          background: "var(--text-tertiary)",
        }}
      />
      <div
        className="absolute top-2 h-6 w-0.5"
        style={{
          left: `${pct(target)}%`,
          background: markerColor,
        }}
      >
        <span
          className="absolute -top-1.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full"
          style={{ background: markerColor }}
        />
      </div>
    </div>
  );
}
