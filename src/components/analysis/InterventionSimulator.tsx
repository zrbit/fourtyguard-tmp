"use client";

import { useState } from "react";
import type { BlockMetrics } from "@/types/thermal";

export function InterventionSimulator({ block }: { block: BlockMetrics }) {
  const [canopy, setCanopy] = useState(15);
  const [pavement, setPavement] = useState(20);
  const anomaly = block.temperature - block.nearbyAverage;
  const estimatedReduction = Math.max(0, Math.min(4.5, canopy * 0.045 + pavement * 0.025));
  const projected = Math.round((block.temperature - estimatedReduction) * 10) / 10;
  return <section className="border-t p-5" style={{ borderColor: "var(--border)" }}><h2 className="font-display text-[15px] font-bold">Cooling intervention model</h2><p className="mt-1 text-[12px] leading-relaxed text-slate">A transparent screening estimate based on the live tile’s current temperature—not a measured forecast.</p><label className="mt-4 block font-mono text-[11px] text-ash">Tree canopy increase · {canopy}%<input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="35" value={canopy} onChange={e => setCanopy(Number(e.target.value))} /></label><label className="mt-3 block font-mono text-[11px] text-ash">Cool/reflective pavement · {pavement}%<input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="50" value={pavement} onChange={e => setPavement(Number(e.target.value))} /></label><div className="mt-4 rounded-md p-3" style={{ background: "var(--accent-dim)" }}><div className="font-mono text-[10px] tracking-wide text-accent-strong uppercase">Modelled estimate</div><div className="mt-1 text-sm text-paper">{projected}°F projected tile temperature <span className="text-ash">({estimatedReduction.toFixed(1)}°F reduction; current anomaly {anomaly >= 0 ? "+" : ""}{anomaly.toFixed(1)}°F)</span></div></div></section>;
}
