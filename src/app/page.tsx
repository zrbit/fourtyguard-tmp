"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronUp } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { AnalysisPanel } from "@/components/analysis/AnalysisPanel";
import { blocksForCity, DEMO_BLOCKS } from "@/lib/mock-data/blocks";
import type { City } from "@/types/thermal";

// maplibre-gl touches `window` at module scope — it can only ever run in
// the browser, so it's excluded from the server render entirely.
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center" style={{ background: "var(--surface-sunken)" }}>
      <span className="font-mono text-xs tracking-wider text-slate uppercase">Loading map…</span>
    </div>
  ),
});

const DEFAULT_CITY: City = "Los Angeles";
const DEFAULT_BLOCK_ID = "la-029";

export default function Home() {
  const [city, setCity] = useState<City>(DEFAULT_CITY);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_BLOCK_ID);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const cityBlocks = useMemo(() => blocksForCity(city), [city]);
  const block = useMemo(
    () => DEMO_BLOCKS.find((b) => b.id === selectedId) ?? cityBlocks[0],
    [selectedId, cityBlocks],
  );

  function handleCityChange(next: City) {
    setCity(next);
    const first = blocksForCity(next)[0];
    if (first) setSelectedId(first.id);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setSheetExpanded(true);
  }

  return (
    <div className="flex h-dvh flex-col">
      <TopBar city={city} onCityChange={handleCityChange} />

      <main className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <MapView blocks={cityBlocks} selectedId={block.id} onSelect={handleSelect} />

        {/* Desktop: docked panel */}
        <div
          className="hidden w-[400px] flex-none border-l lg:block xl:w-[420px]"
          style={{ borderColor: "var(--border)", background: "var(--ground)" }}
        >
          <AnalysisPanel key={block.id} block={block} cityBlocks={cityBlocks} />
        </div>

        {/* Mobile / tablet: bottom sheet */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-lg border-t transition-[max-height] duration-200 ease-out lg:hidden"
          style={{
            borderColor: "var(--border)",
            background: "var(--ground)",
            maxHeight: sheetExpanded ? "82dvh" : "42dvh",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <button
            type="button"
            onClick={() => setSheetExpanded((v) => !v)}
            className="flex flex-none cursor-pointer items-center justify-center gap-1.5 py-2.5"
            aria-expanded={sheetExpanded}
            aria-label={sheetExpanded ? "Collapse panel" : "Expand panel"}
          >
            <span className="h-1 w-9 rounded-full" style={{ background: "var(--border-strong)" }} />
            <ChevronUp
              className="h-3 w-3 text-slate transition-transform duration-200"
              style={{ transform: sheetExpanded ? "rotate(180deg)" : "none" }}
            />
          </button>
          <div className="min-h-0 flex-1">
            <AnalysisPanel key={block.id} block={block} cityBlocks={cityBlocks} />
          </div>
        </div>
      </main>
    </div>
  );
}
