import { ArrowDown, CheckCircle2, CircleHelp, MapPin } from "lucide-react";
import type { BlockMetrics } from "@/types/thermal";
import { formatSigned } from "@/lib/utils";

type Candidate = BlockMetrics & { anomaly: number };

export function ActionBrief({ block, allBlocks, onSelect }: { block: BlockMetrics; allBlocks: BlockMetrics[]; onSelect: (id: string) => void }) {
  const shortlist = [...allBlocks].map(candidate => ({ ...candidate, anomaly: candidate.temperature - candidate.nearbyAverage })).sort((a, b) => b.anomaly - a.anomaly).slice(0, 5);
  const selectedRank = shortlist.findIndex(candidate => candidate.id === block.id) + 1;
  const primary = shortlist.slice(0, 3); const remaining = shortlist.slice(3);
  const jumpToDuration = () => document.getElementById("heat-duration-check")?.scrollIntoView({ behavior: "smooth", block: "center" });
  const placeRow = (candidate: Candidate, index: number) => {
    const active = candidate.id === block.id;
    return <button key={candidate.id} type="button" onClick={() => onSelect(candidate.id)} aria-pressed={active} className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors" style={{ borderColor: active ? "var(--accent-border)" : "var(--border)", background: active ? "var(--accent-dim)" : "var(--surface-sunken)" }}><span className="flex min-w-0 items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[9px] text-accent-strong" style={{ background: "rgba(53, 198, 178, 0.12)" }}>{index + 1}</span><span className="text-[11px] font-semibold text-paper">{active ? "Looking at this place" : "Show this place"}</span></span><span className="shrink-0 font-mono text-[10px] text-ash">{formatSigned(candidate.anomaly, 2)}°F warmer</span></button>;
  };

  return <section className="border-b pb-5" style={{ borderColor: "var(--border)" }}>
    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-accent-strong" /><h2 className="text-sm font-bold text-ash">Where should I look first?</h2><span title="This list looks for tiny areas warmer than the places right next to them. It helps decide where to investigate first; it is not a danger or health-risk rating."><CircleHelp className="h-3.5 w-3.5 text-slate" /></span></div>
    <p className="mt-2 text-[12px] leading-relaxed text-slate">These places are warmer than their nearby surroundings. Pick one to see why it may deserve a closer look.</p>
    {selectedRank > 0 && <div className="mt-3 rounded-md border p-3" style={{ borderColor: "var(--accent-border)", background: "var(--accent-dim)" }}><div className="flex items-center gap-2 text-[11px] font-semibold text-paper"><CheckCircle2 className="h-3.5 w-3.5 text-accent-strong" />You are looking at place #{selectedRank}</div><p className="mt-1 text-[10px] leading-relaxed text-slate">Next, check whether this heat lasted for hours or was only a short spike.</p><button type="button" onClick={jumpToDuration} className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-accent-strong">Check heat duration <ArrowDown className="h-3.5 w-3.5" /></button></div>}
    <div className="mt-3 space-y-1.5">{primary.map(placeRow)}</div>
    {remaining.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[11px] font-medium text-accent-strong">Show two more places</summary><div className="mt-2 space-y-1.5">{remaining.map((candidate, index) => placeRow(candidate, index + primary.length))}</div></details>}
    <p className="mt-3 text-[10px] leading-relaxed text-slate">“Warmer” compares each place with its closest neighbours, not with the whole city.</p>
  </section>;
}
