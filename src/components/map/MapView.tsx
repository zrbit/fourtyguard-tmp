"use client";

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
  const anomalyScale = Math.max(
    0.15,
    ...blocks.map(block => Math.abs(block.temperature - block.nearbyAverage)),
  );
  return (
    <div className="relative flex flex-1 flex-col" style={{ background: "var(--surface-sunken)" }}>
      <ThermalMap blocks={blocks} selectedId={selectedId} onSelect={onSelect} />
      <MapLegend scale={anomalyScale} />
      <BlockList blocks={blocks} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
