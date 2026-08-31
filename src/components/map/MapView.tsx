"use client";

import { useEffect, useState } from "react";
import { ThermalMap } from "@/components/map/ThermalMap";
import { MapLegend } from "@/components/map/MapLegend";
import { BlockList } from "@/components/map/BlockList";
import { AddressSearch } from "@/components/map/AddressSearch";
import type { BlockMetrics } from "@/types/thermal";

export default function MapView({
  blocks,
  selectedId,
  onSelect,
  legendLabel,
  comparison = false,
  areaLabel = null,
  onAreaSearch,
}: {
  blocks: BlockMetrics[];
  selectedId: string;
  onSelect: (id: string) => void;
  legendLabel?: string;
  comparison?: boolean;
  /** Label of the currently-active user-searched area, if any (vs. one of
   * the three fixed named cities). Shown by AddressSearch as confirmation. */
  areaLabel?: string | null;
  /** Requests a brand-new live scan of a user-picked address + size,
   * replacing `blocks` entirely -- distinct from `onSelect`, which just
   * picks an existing cell. Omit to disable area search (defensive; page.tsx
   * always provides it today). */
  onAreaSearch?: (area: { bbox: [number, number, number, number]; bboxKey: string; label: string; center: [number, number] }) => void;
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
      <AddressSearch areaLabel={areaLabel} onAreaSearch={onAreaSearch} />
      <MapLegend minTemperature={minTemperature} maxTemperature={maxTemperature} label={legendLabel} theme={theme} />
      <BlockList blocks={blocks} selectedId={selectedId} onSelect={onSelect} comparison={comparison} />
    </div>
  );
}
