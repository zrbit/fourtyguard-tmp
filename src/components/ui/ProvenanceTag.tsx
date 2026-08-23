import { cn } from "@/lib/utils";
import type { Provenance } from "@/types/thermal";

const COPY: Record<Provenance, string> = {
  live: "Live",
  demo: "Demo",
  modelled: "Modelled",
};

export function ProvenanceTag({
  provenance,
  className,
}: {
  provenance: Provenance;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-wider uppercase",
        provenance === "live" ? "text-accent-strong" : "text-ash",
        className,
      )}
      style={{
        borderColor:
          provenance === "live" ? "var(--accent-border)" : "var(--border-strong)",
      }}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          provenance === "live" && "bg-accent shadow-[0_0_0_3px_var(--accent-dim)]",
          provenance === "demo" && "border border-slate bg-transparent",
          provenance === "modelled" &&
            "border border-dashed border-slate bg-transparent",
        )}
      />
      {COPY[provenance]}
    </span>
  );
}
