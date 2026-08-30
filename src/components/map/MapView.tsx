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
  legendLabel,
  comparison = false,
}: {
  blocks: BlockMetrics[];
  selectedId: string;
  onSelect: (id: string) => void;
  legendLabel?: string;
  comparison?: boolean;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const updateTheme = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const minTemperature = Math.min(...blocks.map(block => block.temperature));
  const maxTemperature = Math.max(...blocks.map(block => block.temperature));
  return (
    <div className="relative flex flex-1 flex-col" style={{ background: "var(--surface-sunken)" }}>
      <ThermalMap blocks={blocks} selectedId={selectedId} onSelect={onSelect} theme={theme} />
      <MapLegend minTemperature={minTemperature} maxTemperature={maxTemperature} label={legendLabel} theme={theme} />
      <BlockList blocks={blocks} selectedId={selectedId} onSelect={onSelect} comparison={comparison} />
    </div>
  );
}
