"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";

export function InterventionSimulator({ block }: { block: BlockMetrics }) {
  const [canopy, setCanopy] = useState(15); const [pavement, setPavement] = useState(20);
  const estimatedReduction = Math.max(0, Math.min(4.5, canopy * 0.045 + pavement * 0.025)); const projected = Math.round((block.temperature - estimatedReduction) * 10) / 10;
  return <section className="border-t p-5" style={{ borderColor: "var(--border)" }}><details><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><span><span className="flex items-center gap-2 text-sm font-bold text-ash"><SlidersHorizontal className="h-4 w-4 text-accent-strong" />Explore cooling options</span><span className="mt-1 block text-[11px] text-slate">A quick scenario, not a forecast.</span></span><span className="rounded-full border px-2 py-1 font-mono text-[10px] text-accent-strong" style={{ borderColor: "var(--accent-border)" }}>Try it</span></summary><div className="mt-4 rounded-lg border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><label className="block font-mono text-[11px] text-ash">More tree canopy · {canopy}%<input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="35" value={canopy} onChange={e => setCanopy(Number(e.target.value))} /></label><label className="mt-3 block font-mono text-[11px] text-ash">Cool pavement · {pavement}%<input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="50" value={pavement} onChange={e => setPavement(Number(e.target.value))} /></label><div className="mt-3 rounded-md p-3" style={{ background: "var(--accent-dim)" }}><div className="font-mono text-[10px] tracking-wide text-accent-strong uppercase">Screening scenario</div><div className="mt-1 text-[13px] text-paper">{projected}°F projected tile temperature <span className="text-ash">({estimatedReduction.toFixed(1)}°F estimated reduction)</span></div></div></div></details></section>;
}
