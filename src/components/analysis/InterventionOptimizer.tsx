"use client";

import { useState } from "react";
import { BrainCircuit, CheckCircle2, CircleHelp, CloudSun, RefreshCw, TriangleAlert } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";
import { formatSigned } from "@/lib/utils";

type Forecast = { peakTemperatureF: number; peakApparentF: number; peakSolarWm2: number; peakTime: string };
type Action = { title: string; when: string; score: number; reason: string; outcome: string };

function localControls(block: BlockMetrics, allBlocks: BlockMetrics[]) {
  return allBlocks.filter(candidate => candidate.id !== block.id).map(candidate => ({ candidate, distance: Math.hypot(candidate.lat - block.lat, candidate.lng - block.lng) })).sort((a, b) => a.distance - b.distance).slice(0, 8).map(item => item.candidate);
}
function timeLabel(iso: string) { return new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", timeZone: "UTC" }).format(new Date(`${iso}Z`)); }

export function InterventionOptimizer({ block, allBlocks }: { block: BlockMetrics; allBlocks: BlockMetrics[] }) {
  const [forecast, setForecast] = useState<Forecast | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const anomaly = block.temperature - block.nearbyAverage;
  const controls = localControls(block, allBlocks); const warmerThan = controls.filter(control => block.temperature > control.temperature).length;

  async function buildPlan() {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/forecast?latitude=${encodeURIComponent(block.lat)}&longitude=${encodeURIComponent(block.lng)}`); const payload = await response.json() as Forecast & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Could not load the local forecast."); setForecast(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not build an action plan."); }
    finally { setLoading(false); }
  }

  const actions: Action[] = forecast ? [
    { title: "Create shade where people wait and walk", when: forecast.peakSolarWm2 >= 500 ? "Start with the next sunny period" : "Plan after checking street imagery", score: Math.min(96, Math.round(52 + Math.max(0, anomaly) * 35 + forecast.peakSolarWm2 / 22)), reason: forecast.peakSolarWm2 >= 500 ? "The forecast shows strong sun during the hottest hours, so direct shade is the clearest immediate protection to investigate." : "The local heat signal is clear, but imagery should confirm whether lack of shade is the right explanation.", outcome: "Reduces direct sun exposure; a local temperature effect needs imagery and site review." },
    { title: "Review cool or lighter ground surfaces", when: "Add to the site-improvement plan", score: Math.min(90, Math.round(42 + Math.max(0, anomaly) * 42 + forecast.peakTemperatureF / 5)), reason: "This spot is warmer than nearby controls, so exposed ground materials are worth checking once shade and surface imagery are available.", outcome: "May reduce stored daytime heat; this is a screening recommendation, not a predicted temperature change." },
    { title: "Protect people during the hottest hours", when: `Prepare for ${timeLabel(forecast.peakTime)}`, score: Math.min(94, Math.round(35 + Math.max(0, forecast.peakApparentF - 80) * 3 + Math.max(0, anomaly) * 20)), reason: `The next-24-hour apparent temperature peaks near ${forecast.peakApparentF.toFixed(1)}°F, so a near-term response can matter before permanent improvements are built.`, outcome: "Consider cooling access, water, and shaded waiting areas where people are exposed." },
  ].sort((a, b) => b.score - a.score) : [];

  return <section className="border-t p-5" style={{ borderColor: "var(--border)" }}>
    <div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-accent-strong" /><h2 className="text-sm font-bold text-ash">What should we do here?</h2><span title="This transparent planning model combines the local temperature difference, its closest nearby controls, and the next 24-hour weather forecast. It suggests what to investigate first; it does not guarantee an intervention outcome."><CircleHelp className="h-3.5 w-3.5 text-slate" /></span></div>
    <p className="mt-2 text-[12px] leading-relaxed text-slate">Build a practical plan for this place using its local heat signal and the weather expected next.</p>
    <button type="button" onClick={buildPlan} disabled={loading} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border py-2.5 text-[12px] font-bold disabled:cursor-wait disabled:opacity-60" style={{ borderColor: "var(--accent-border)", color: "var(--accent-strong)", background: "var(--accent-dim)" }}>{loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudSun className="h-3.5 w-3.5" />}{loading ? "Building a plan…" : forecast ? "Refresh action plan" : "Build an action plan"}</button>
    {forecast && <div className="mt-3" aria-live="polite"><div className="rounded-md border p-3" style={{ borderColor: "var(--accent-border)", background: "var(--surface)" }}><div className="flex items-center gap-2 text-[11px] font-semibold text-paper"><CheckCircle2 className="h-3.5 w-3.5 text-accent-strong" />Why this place is a priority</div><p className="mt-1 text-[11px] leading-relaxed text-slate">It is {formatSigned(anomaly, 2)}°F compared with nearby places and warmer than {warmerThan} of its {controls.length} closest comparisons. The forecast reaches {forecast.peakApparentF.toFixed(1)}°F when it feels hottest.</p></div><div className="mt-3 space-y-2">{actions.map((action, index) => <article key={action.title} className="rounded-lg border p-3.5" style={{ borderColor: index === 0 ? "var(--accent-border)" : "var(--border)", background: index === 0 ? "var(--accent-dim)" : "var(--surface)" }}><div className="flex items-start justify-between gap-3"><div><div className="font-mono text-[10px] tracking-wide text-accent-strong uppercase">{index === 0 ? "Start here" : "Next option"}</div><h3 className="mt-1 text-[13px] font-bold text-paper">{action.title}</h3></div><span className="rounded-full border px-2 py-1 font-mono text-[10px] text-accent-strong" style={{ borderColor: "var(--accent-border)" }}>{action.score}/100 fit</span></div><p className="mt-2 text-[11px] leading-relaxed text-ash">{action.reason}</p><div className="mt-2 border-t pt-2 text-[10px] leading-relaxed text-slate" style={{ borderColor: "var(--border)" }}><span className="text-ash">When:</span> {action.when}<br /><span className="text-ash">Expected benefit:</span> {action.outcome}</div></article>)}</div><details className="mt-3 rounded-md border px-3 py-2.5 text-[10px]" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}><summary className="cursor-pointer font-medium text-ash">Show how this plan was ranked</summary><p className="mt-2 leading-relaxed text-slate">The score weighs how much warmer this place is than its closest controls, tomorrow’s apparent heat, and forecast sunlight. It intentionally does not claim that trees, pavement, or shade caused the difference. Run imagery evidence before committing funds.</p></details></div>}
    {error && <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed" style={{ color: "#e36b5d" }}><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
  </section>;
}
