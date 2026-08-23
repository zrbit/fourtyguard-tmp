"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { HYPOTHESIS_ICON, ThermometerIcon } from "@/components/icons/FactorIcons";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { formatSigned } from "@/lib/utils";
import type { Evidence, Hypothesis } from "@/types/thermal";

export function HypothesisList({
  hypotheses,
  evidence,
}: {
  hypotheses: Hypothesis[];
  evidence: Evidence[];
}) {
  const byId = (id: string) => evidence.find((e) => e.id === id);

  return (
    <Accordion.Root type="single" collapsible defaultValue={hypotheses[0]?.id} className="flex flex-col gap-2.5">
      {hypotheses.map((h, i) => {
        const Icon = HYPOTHESIS_ICON[h.id] ?? ThermometerIcon;
        const primary = byId(h.evidenceIds[0]);

        return (
          <Accordion.Item
            key={h.id}
            value={h.id}
            className="overflow-hidden rounded-md border"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left">
                <span className="font-mono text-[11px] text-slate">{i + 1}</span>
                <span
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-sm border"
                  style={{ background: "var(--surface-raised)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-paper">{h.title}</span>
                  {primary && (
                    <span className="mt-0.5 block truncate font-mono text-[12px] text-slate">
                      {primary.targetValue}
                      {primary.unit} target · {primary.comparisonValue}
                      {primary.unit} nearby
                    </span>
                  )}
                </span>
                <ConfidenceMeter level={h.confidence} />
                <ChevronDown className="h-4 w-4 flex-none text-slate transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden data-[state=open]:animate-[accordion-down_200ms_ease-out] data-[state=closed]:animate-[accordion-up_200ms_ease-out]">
              <div
                className="flex flex-wrap gap-7 border-t px-4 py-4 pl-[58px]"
                style={{ borderColor: "var(--border)" }}
              >
                {h.evidenceIds.map((eid) => {
                  const e = byId(eid);
                  if (!e) return null;
                  return (
                    <div key={eid} className="flex gap-6">
                      <Stat label="Target" value={`${e.targetValue}${e.unit ?? ""}`} />
                      {e.comparisonValue !== undefined && (
                        <Stat label="Nearby" value={`${e.comparisonValue}${e.unit ?? ""}`} />
                      )}
                      {e.difference !== undefined && (
                        <Stat
                          label="Difference"
                          value={`${formatSigned(e.difference, 0)}${e.unit ?? ""}`}
                          tone={
                            e.warmingEffect === "warmer"
                              ? "hot"
                              : e.warmingEffect === "cooler"
                                ? "cold"
                                : "neutral"
                          }
                        />
                      )}
                    </div>
                  );
                })}
                <div className="min-w-[220px] flex-1 text-[12.5px] leading-relaxed text-ash">
                  <p className="m-0">{h.explanation}</p>
                  {h.counterEvidence?.map((c) => (
                    <p key={c} className="m-0 mt-2 text-[12px]" style={{ color: "var(--thermal-hot)" }}>
                      ⚠ {c}
                    </p>
                  ))}
                  <p className="m-0 mt-2.5 font-mono text-[10.5px] text-slate">
                    Source: {primary?.source}
                  </p>
                </div>
              </div>
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "hot" | "cold" | "neutral";
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-wider text-slate uppercase">{label}</div>
      <div
        className="mt-0.5 font-mono text-lg font-semibold"
        style={{
          color:
            tone === "hot" ? "var(--thermal-hot)" : tone === "cold" ? "var(--thermal-cold)" : "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
