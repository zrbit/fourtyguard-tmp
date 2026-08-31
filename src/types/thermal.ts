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
  /**
   * Whether this evidence's difference, as measured, pushes the block
   * warmer or cooler — NOT the raw sign of `difference`. More tree canopy
   * is a positive difference but a cooling effect; the UI must color by
   * this field, never by re-deriving from the sign, or the thermal hue
   * ends up backwards for every metric where "more" doesn't mean "hotter."
   */
  warmingEffect?: "warmer" | "cooler" | "neutral";
  unit?: string;
  source: string;
  provenance: Provenance;
  strength: Strength;
  /** Signed SHAP contribution when this evidence came from the model. */
  shapValue?: number;
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
  nearbyAverage: number; // °F, mean of the 8 nearest cells (fine local-outlier signal)
  scanAverage?: number; // °F, mean of every cell in the current live scan (broad hot-zone
  // signal — same box the map is currently showing, not literally all of LA). Optional:
  // hand-authored demo data (lib/mock-data/blocks.ts) predates this field.
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
