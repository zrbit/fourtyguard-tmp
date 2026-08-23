import { cn } from "@/lib/utils";
import type { Strength } from "@/types/thermal";

const FILLED: Record<Strength, number> = { high: 3, medium: 2, low: 1 };
const LABEL: Record<Strength, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * Confidence is encoded by value (filled vs. unfilled segments), never by
 * hue — red/green traffic-light coding would collide with the thermal
 * scale's meaning elsewhere in the product.
 */
export function ConfidenceMeter({
  level,
  align = "end",
}: {
  level: Strength;
  align?: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        align === "end" ? "items-end" : "items-start",
      )}
    >
      <span className="flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[6px] w-[18px] rounded-sm"
            style={{
              backgroundColor:
                i < FILLED[level] ? "var(--text-primary)" : "var(--border-strong)",
            }}
          />
        ))}
      </span>
      <span className="font-mono text-[10px] tracking-wider text-ash uppercase">
        {LABEL[level]}
      </span>
    </div>
  );
}
