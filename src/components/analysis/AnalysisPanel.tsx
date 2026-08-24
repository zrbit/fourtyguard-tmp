"use client";

import { useState } from "react";
import { GitCompare, X } from "lucide-react";
import { DistributionStrip } from "@/components/analysis/DistributionStrip";
import { InvestigationTimeline } from "@/components/analysis/InvestigationTimeline";
import { HypothesisList } from "@/components/analysis/HypothesisList";
import { CompareTable } from "@/components/analysis/CompareTable";
import { ChatDock } from "@/components/agent/ChatDock";
import { LiveInvestigation } from "@/components/analysis/LiveInvestigation";
import { ProvenanceTag } from "@/components/ui/ProvenanceTag";
import { analyzeBlock } from "@/lib/reasoning/analyze";
import { cn, formatSigned, thermalColor, thermalTone } from "@/lib/utils";
import type { BlockMetrics } from "@/types/thermal";

type Stage = "idle" | "investigating" | "explained";

export function AnalysisPanel({
  block,
  cityBlocks,
}: {
  block: BlockMetrics;
  cityBlocks: BlockMetrics[];
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [compareMode, setCompareMode] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);

  const analysis = analyzeBlock(block);

  // AnalysisPanel is remounted with key={block.id} by the parent whenever
  // the selected block changes, so stage/compare state resets for free —
  // no effect needed to synchronize it with the `block` prop.
  const otherBlocks = cityBlocks.filter((b) => b.id !== block.id);
  const compareBlock = compareId ? cityBlocks.find((b) => b.id === compareId) : undefined;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-start justify-between gap-3 border-b p-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="font-mono text-[11px] tracking-[0.08em] text-slate uppercase">
            Block {block.id.split("-")[1]}
          </div>
          <div className="mt-0.5 text-sm text-ash">{block.neighborhood}</div>
        </div>
        <button
          type="button"
          onClick={() => setCompareMode((v) => !v)}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-sans text-xs transition-colors duration-150"
          style={{
            borderColor: compareMode ? "var(--accent-border)" : "var(--border-strong)",
            color: compareMode ? "var(--accent-strong)" : "var(--text-secondary)",
            background: compareMode ? "var(--accent-dim)" : "transparent",
          }}
        >
          {compareMode ? <X className="h-3.5 w-3.5" /> : <GitCompare className="h-3.5 w-3.5" />}
          Compare
        </button>
      </div>

      {compareMode ? (
        <div className="flex flex-col gap-5 p-5">
          <div>
            <div className="mb-2 font-mono text-[10.5px] tracking-wider text-slate uppercase">
              Compare Block {block.id.split("-")[1]} against
            </div>
            <div className="flex flex-wrap gap-2">
              {otherBlocks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setCompareId(b.id)}
                  className="cursor-pointer rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors duration-150"
                  style={{
                    borderColor: b.id === compareId ? "var(--accent-border)" : "var(--border-strong)",
                    color: b.id === compareId ? "var(--accent-strong)" : "var(--text-secondary)",
                    background: b.id === compareId ? "var(--accent-dim)" : "transparent",
                  }}
                >
                  {b.id}
                </button>
              ))}
            </div>
          </div>

          {compareBlock ? (
            <>
              <CompareTable a={block} b={compareBlock} />
              <div className="rounded-md p-4 text-[13px] leading-relaxed" style={{ background: "var(--accent-dim)", color: "var(--text-primary)" }}>
                <span className="font-semibold" style={{ color: "var(--accent-strong)" }}>
                  Why does A differ from B?{" "}
                </span>
                Block {block.id.split("-")[1]} runs {formatSigned(block.temperature - compareBlock.temperature)}°F
                relative to Block {compareBlock.id.split("-")[1]}, tracking a{" "}
                {Math.abs(block.imperviousSurfacePct - compareBlock.imperviousSurfacePct)}pp difference in impervious
                coverage and a {Math.abs(block.treeCanopyPct - compareBlock.treeCanopyPct)}pp difference in tree
                canopy.
              </div>
            </>
          ) : (
            <p className="text-sm text-slate">Pick a second block to compare.</p>
          )}
        </div>
      ) : (
        <>
          <div className="p-5">
            <div className="flex items-end gap-2 font-mono">
              <span className="text-4xl leading-none font-semibold">{block.temperature}</span>
              <span className="pb-0.5 text-lg text-ash">°F</span>
            </div>
            <div
              className="mt-2.5 inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold"
              style={{ color: thermalColor(analysis.anomaly) }}
            >
              {thermalTone(analysis.anomaly) === "hot"
                ? "▲"
                : thermalTone(analysis.anomaly) === "cold"
                  ? "▼"
                  : "●"}{" "}
              {formatSigned(analysis.anomaly)}°F
            </div>
            <div className="mt-0.5 text-[11.5px] text-slate">
              vs. {block.nearbyBlockCount} nearby blocks · {analysis.percentile}th percentile
            </div>

            <DistributionStrip target={block.temperature} distribution={block.distribution} />

            {stage === "idle" && (
              <button
                type="button"
                onClick={() => setStage("investigating")}
                className="mt-5 w-full cursor-pointer rounded-lg py-2.5 text-[13.5px] font-bold tracking-wide transition-opacity duration-150 hover:opacity-90"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                Investigate
              </button>
            )}
          </div>

          {stage !== "idle" && (
            <div className="border-t p-5" style={{ borderColor: "var(--border)" }}>
              <InvestigationTimeline
                active={stage === "investigating"}
                nearbyBlockCount={block.nearbyBlockCount}
                onComplete={() => setStage("explained")}
              />
            </div>
          )}

          {stage === "explained" && (
            <>
              <div className="border-t p-5" style={{ borderColor: "var(--border)" }}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-[15px] font-bold">What makes this unusual?</h2>
                  <ProvenanceTag provenance={analysis.provenance} />
                </div>
                <HypothesisList hypotheses={analysis.hypotheses} evidence={analysis.evidence} />
              </div>

              <LiveInvestigation block={block} />

              <div className="border-t p-5" style={{ borderColor: "var(--border)" }}>
                <h2 className="mb-3 font-display text-[13px] font-bold text-ash uppercase tracking-wide">
                  Limitations
                </h2>
                <ul className={cn("flex flex-col gap-2")}>
                  {analysis.limitations.map((l) => (
                    <li key={l} className="relative pl-4 text-[12.5px] leading-relaxed text-slate">
                      <span
                        className="absolute top-[7px] left-0 h-[4px] w-[4px] rounded-full"
                        style={{ background: "var(--text-tertiary)" }}
                      />
                      {l}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t p-5" style={{ borderColor: "var(--border)" }}>
                <ChatDock analysis={analysis} blockLabel={`Block ${block.id.split("-")[1]}`} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
