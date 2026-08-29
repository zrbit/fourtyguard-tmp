"use client";

import { useEffect, useState } from "react";
import { ThermalMap } from "@/components/map/ThermalMap";
import { MapLegend } from "@/components/map/MapLegend";
import { BlockList } from "@/components/map/BlockList";
import type { BlockMetrics } from "@/types/thermal";

export default function MapView({
  blocks,
  selectedId,
  onSelect,
}: {
  blocks: BlockMetrics[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const updateTheme = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const anomalyScale = Math.max(
    0.15,
    ...blocks.map(block => Math.abs(block.temperature - block.nearbyAverage)),
  );
  return (
    <div className="relative flex flex-1 flex-col" style={{ background: "var(--surface-sunken)" }}>
      <ThermalMap blocks={blocks} selectedId={selectedId} onSelect={onSelect} theme={theme} />
      <MapLegend scale={anomalyScale} theme={theme} />
      <BlockList blocks={blocks} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
