"use client";

import Link from "next/link";
import { ClipboardList, MapPinned, Satellite } from "lucide-react";
import { ArrowDownUp, Moon, Sun } from "lucide-react";
import { ThermometerIcon } from "@/components/icons/FactorIcons";
import { ProvenanceTag } from "@/components/ui/ProvenanceTag";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { City } from "@/types/thermal";

// Only Los Angeles has a real map/block implementation right now. NYC and
// Chicago keep their spot in the switcher (they have demo data already —
// see lib/mock-data/blocks.ts) but stay disabled until their own Phase 2
// pass lands, rather than pretending they're interactive.
const CITIES: { name: City; enabled: boolean }[] = [
  { name: "New York City", enabled: true },
  { name: "Chicago", enabled: true },
  { name: "Los Angeles", enabled: true },
];
export type HeatPeriod = "day" | "night" | "compare";

export function TopBar({
  city,
  onCityChange,
  period,
  onPeriodChange,
  comparisonAvailable,
}: {
  city: City;
  onCityChange: (c: City) => void;
  period: HeatPeriod;
  onPeriodChange: (period: HeatPeriod) => void;
  comparisonAvailable: boolean;
}) {
  return (
    <header
      className="flex h-14 flex-none items-center justify-between gap-4 border-b px-4 sm:px-6"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2.5">
        <ThermometerIcon className="h-4 w-4 text-accent" />
        <span className="font-display text-sm font-bold tracking-wide">
          HEAT LENS
        </span>
      </div>

      <div className="hidden items-center gap-1 sm:flex">
        {CITIES.map(({ name, enabled }) => (
          <button
            key={name}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onCityChange(name)}
            title={enabled ? undefined : `${name} — coming soon`}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-xs tracking-wide transition-colors duration-150 disabled:cursor-not-allowed"
            style={{
              color: name === city ? "var(--accent-strong)" : enabled ? "var(--text-secondary)" : "var(--text-tertiary)",
              background: name === city ? "var(--accent-dim)" : "transparent",
              opacity: enabled ? 1 : 0.55,
              cursor: enabled ? "pointer" : "not-allowed",
            }}
          >
            {name}
            {!enabled && (
              <span className="rounded-full border px-1.5 py-[1px] text-[9px] tracking-wider uppercase" style={{ borderColor: "var(--border-strong)" }}>
                Soon
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="hidden items-center gap-1 rounded-md border p-0.5 md:flex" style={{ borderColor: "var(--border)" }} aria-label="Thermal period">
        <button type="button" title="View the daytime thermal scan" onClick={() => onPeriodChange("day")} aria-pressed={period === "day"} className="flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[10px] transition-colors" style={{ background: period === "day" ? "var(--accent-dim)" : "transparent", color: period === "day" ? "var(--accent-strong)" : "var(--text-secondary)" }}><Sun className="h-3 w-3" />Daytime</button>
        <button type="button" title="View the nighttime thermal scan" onClick={() => onPeriodChange("night")} aria-pressed={period === "night"} className="flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[10px] transition-colors" style={{ background: period === "night" ? "var(--accent-dim)" : "transparent", color: period === "night" ? "var(--accent-strong)" : "var(--text-secondary)" }}><Moon className="h-3 w-3" />Nighttime</button>
        <button type="button" disabled={!comparisonAvailable} title={comparisonAvailable ? "Compare nighttime temperature with daytime temperature" : "Open both Daytime and Nighttime once to enable comparison"} onClick={() => onPeriodChange("compare")} aria-pressed={period === "compare"} className="flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-45" style={{ background: period === "compare" ? "var(--accent-dim)" : "transparent", color: period === "compare" ? "var(--accent-strong)" : "var(--text-secondary)" }}><ArrowDownUp className="h-3 w-3" />Compare</button>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="hidden items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs text-slate md:flex"
          style={{ borderColor: "var(--border)" }}
        >
          <MapPinned className="h-3.5 w-3.5" aria-hidden />
          <span>Viewing {city}</span>
        </div>
        <Link
          href="/training-data"
          className="hidden items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs tracking-wide text-slate transition-colors duration-150 hover:text-paper md:flex"
          style={{ borderColor: "var(--border)" }}
        >
          <Satellite className="h-3.5 w-3.5" aria-hidden />
          Training data
        </Link>
        <Link
          href="/action-plans"
          className="hidden items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs tracking-wide text-slate transition-colors duration-150 hover:text-paper md:flex"
          style={{ borderColor: "var(--border)" }}
        >
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          Action plans
        </Link>
        <ThemeToggle />
        <ProvenanceTag provenance="live" />
      </div>
    </header>
  );
}
