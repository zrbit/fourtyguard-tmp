/**
 * Core data model for the Thermal Reasoning Agent.
 * Mirrors the shape defined in the build spec (§19) with the additions
 * needed to drive the UI: provenance labeling and raw block metrics.
 */

/** How a piece of data was obtained. Must be shown on anything derived from it. */
export type Provenance = "live" | "demo" | "modelled";

export type EvidenceCategory =
  | "temperature"
  | "vegetation"
  | "surface"
  | "weather"
  | "urban_form"
  | "history";

export type Strength = "low" | "medium" | "high";

export type Evidence = {
  id: string;
  category: EvidenceCategory;
  metric: string;
  targetValue: number | string;
  comparisonValue?: number | string;
  difference?: number;
  unit?: string;
  source: string;
  provenance: Provenance;
  strength: Strength;
  explanation: string;
};

export type Hypothesis = {
  id: string;
  title: string;
  confidence: Strength;
  evidenceIds: string[];
  explanation: string;
  counterEvidence?: string[];
};

export type ThermalAnalysis = {
  temperature: number;
  nearbyAverage: number;
  anomaly: number;
  percentile: number;
  hypotheses: Hypothesis[];
  evidence: Evidence[];
  limitations: string[];
  provenance: Provenance;
};

/** City covered in the prototype. */
export type City = "New York City" | "Chicago" | "Los Angeles";

/**
 * Raw per-block metrics. This is the shape demo data (and, later, the
 * FortyGuard-backed evidence builder) must populate before anything is
 * handed to the reasoning layer.
 */
export type BlockMetrics = {
  id: string;
  city: City;
  neighborhood: string;
  lat: number;
  lng: number;

  temperature: number; // °F
  nearbyAverage: number; // °F, mean of comparison set
  surfaceTemperature: number; // °F, target
  nearbySurfaceTemperature: number; // °F, comparison set mean

  treeCanopyPct: number; // target %
  nearbyTreeCanopyPct: number;

  imperviousSurfacePct: number; // target %
  nearbyImperviousSurfacePct: number;

  buildingDensity: number; // 0–1, target
  nearbyBuildingDensity: number;

  windMph: number; // target
  nearbyWindMph: number;

  historicalAnomaly: number; // °F, typical anomaly at comparable times
  nearbyBlockCount: number; // size of comparison set

  distribution: number[]; // sample of nearby block temperatures, for the spread chart
};
