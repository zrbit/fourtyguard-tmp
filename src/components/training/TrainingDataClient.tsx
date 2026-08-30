"use client";

import dynamic from "next/dynamic";
import type { TrainingAoi } from "@/components/training/TrainingCoverageMap";
import type { AoiCellSummary, CellExample } from "@/lib/reasoning/cellAttribution";

// TrainingCoverageMap now renders a real MapLibre basemap (see ThermalMap.tsx
// for the same pattern): maplibre-gl touches `window` at import time, so it
// must never be reached during SSR, hence the dynamic/ssr:false boundary
// here rather than importing it directly from the server-component page.
const TrainingCoverageMap = dynamic(
  () => import("@/components/training/TrainingCoverageMap").then((mod) => mod.TrainingCoverageMap),
  { ssr: false },
);

export function TrainingDataClient({
  aois,
  cellAttribution,
}: {
  aois: TrainingAoi[];
  cellAttribution: Record<string, { summary: AoiCellSummary; examples: CellExample[] }>;
}) {
  return <TrainingCoverageMap aois={aois} cellAttribution={cellAttribution} />;
}
