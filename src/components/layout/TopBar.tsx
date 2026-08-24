"use client";

import { Search } from "lucide-react";
import { ThermometerIcon } from "@/components/icons/FactorIcons";
import { ProvenanceTag } from "@/components/ui/ProvenanceTag";
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

export function TopBar({
  city,
  onCityChange,
}: {
  city: City;
  onCityChange: (c: City) => void;
}) {
  return (
    <header
      className="flex h-14 flex-none items-center justify-between gap-4 border-b px-4 sm:px-6"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2.5">
        <ThermometerIcon className="h-4 w-4 text-accent" />
        <span className="font-display text-sm font-bold tracking-wide">
          THERMAL
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

      <div className="flex items-center gap-3">
        <div
          className="hidden items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs text-slate md:flex"
          style={{ borderColor: "var(--border)" }}
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <span>Search {city}…</span>
        </div>
        <ProvenanceTag provenance="live" />
      </div>
    </header>
  );
}
