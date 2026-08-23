import type {
  BlockMetrics,
  Evidence,
  EvidenceCategory,
  Hypothesis,
  Strength,
  ThermalAnalysis,
} from "@/types/thermal";
import { round } from "@/lib/utils";

/**
 * Deterministic, rules-based reasoning layer (Phase 4/5 precursor).
 *
 * This is intentionally NOT an LLM call. It exists so the full
 * Detect → Investigate → Explain loop works end to end on demo data
 * before any agent tool-loop is wired up (§23, Phase 1–4 of the build
 * order). The agent introduced in Phase 5 replaces the ranking/critic
 * logic below, not the underlying Evidence/Hypothesis contract.
 */

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

function strengthFromMagnitude(
  abs: number,
  high: number,
  medium: number,
): Strength {
  if (abs >= high) return "high";
  if (abs >= medium) return "medium";
  return "low";
}

function direction(diff: number, biggerIsWarmer: boolean, anomaly: number) {
  // Does this metric's sign agree with the direction we'd expect given the
  // overall anomaly? Returns false when the evidence contradicts the theory.
  const expected = biggerIsWarmer ? sign(anomaly) : -sign(anomaly);
  return sign(diff) === 0 || sign(diff) === expected;
}

function comparativePhrase(diff: number, risingLabel: string, fallingLabel: string) {
  return diff >= 0 ? risingLabel : fallingLabel;
}

export function analyzeBlock(m: BlockMetrics): ThermalAnalysis {
  const anomaly = round(m.temperature - m.nearbyAverage, 1);
  const below = m.distribution.filter((v) => v < m.temperature).length;
  const percentile = Math.round((below / m.distribution.length) * 100);

  const imperviousDiff = round(m.imperviousSurfacePct - m.nearbyImperviousSurfacePct, 0);
  const canopyDiff = round(m.treeCanopyPct - m.nearbyTreeCanopyPct, 0);
  const windDiff = round(m.windMph - m.nearbyWindMph, 1);
  const densityDiff = round((m.buildingDensity - m.nearbyBuildingDensity) * 100, 0);
  const surfaceDiff = round(m.surfaceTemperature - m.nearbySurfaceTemperature, 0);
  const historyGap = round(Math.abs(m.historicalAnomaly - anomaly), 1);
  const historySameSign = sign(m.historicalAnomaly) === sign(anomaly) || anomaly === 0;

  const evidence: Evidence[] = [
    {
      id: "e-surface",
      category: "temperature",
      metric: "Surface (skin) temperature",
      targetValue: m.surfaceTemperature,
      comparisonValue: m.nearbySurfaceTemperature,
      difference: surfaceDiff,
      unit: "°F",
      source: "Satellite thermal band (simulated)",
      provenance: "demo",
      strength: strengthFromMagnitude(Math.abs(surfaceDiff), 15, 8),
      explanation:
        "Remotely-sensed surface temperature runs hotter here than the comparison set, consistent with the air-temperature anomaly rather than contradicting it.",
    },
    {
      id: "e-impervious",
      category: "surface",
      metric: "Impervious surface coverage",
      targetValue: m.imperviousSurfacePct,
      comparisonValue: m.nearbyImperviousSurfacePct,
      difference: imperviousDiff,
      unit: "%",
      source: "Land-cover classification (demo)",
      provenance: "demo",
      strength: strengthFromMagnitude(Math.abs(imperviousDiff), 20, 10),
      explanation:
        "Asphalt, concrete, and rooftop absorb and re-radiate solar heat far more readily than vegetated or permeable ground.",
    },
    {
      id: "e-canopy",
      category: "vegetation",
      metric: "Tree canopy coverage",
      targetValue: m.treeCanopyPct,
      comparisonValue: m.nearbyTreeCanopyPct,
      difference: canopyDiff,
      unit: "%",
      source: "Land-cover classification (demo)",
      provenance: "demo",
      strength: strengthFromMagnitude(Math.abs(canopyDiff), 12, 6),
      explanation:
        "Tree canopy shades surfaces directly and cools the air through evapotranspiration; less canopy removes both effects.",
    },
    {
      id: "e-wind",
      category: "weather",
      metric: "Local wind speed",
      targetValue: m.windMph,
      comparisonValue: m.nearbyWindMph,
      difference: windDiff,
      unit: "mph",
      source: "Environmental parameters (demo)",
      provenance: "demo",
      strength: strengthFromMagnitude(Math.abs(windDiff), 2.5, 1.2),
      explanation:
        "Lower wind speed reduces convective heat loss, letting hot surfaces stay hot instead of mixing with cooler surrounding air.",
    },
    {
      id: "e-density",
      category: "urban_form",
      metric: "Building density",
      targetValue: round(m.buildingDensity * 100, 0),
      comparisonValue: round(m.nearbyBuildingDensity * 100, 0),
      difference: densityDiff,
      unit: "% lot coverage",
      source: "Building footprint model (demo)",
      provenance: "demo",
      strength: strengthFromMagnitude(Math.abs(densityDiff), 8, 4),
      explanation:
        "Denser massing narrows sky-view factor and traps re-radiated heat between surfaces overnight (urban-canyon effect).",
    },
    {
      id: "e-history",
      category: "history",
      metric: "Historical anomaly at comparable conditions",
      targetValue: m.historicalAnomaly,
      comparisonValue: anomaly,
      difference: historyGap,
      unit: "°F",
      source: "Historical persistence model (demo)",
      provenance: "modelled",
      strength: historySameSign
        ? strengthFromMagnitude(2.5 - historyGap, 1.3, 0.5)
        : "low",
      explanation: historySameSign
        ? "This block has shown a similar anomaly under comparable historical conditions, suggesting a persistent pattern rather than a one-off reading."
        : "Today's anomaly does not clearly match this block's historical pattern — treat persistence as unconfirmed.",
    },
  ];

  const byId = (id: string) => evidence.find((e) => e.id === id)!;

  const candidates: {
    id: string;
    title: string;
    evidenceIds: string[];
    diff: number;
    biggerIsWarmer: boolean;
    high: number;
    medium: number;
    /** Relative domain weight — surface cover is the dominant, best-evidenced
     *  UHI driver in the literature; wind/ventilation is real but secondary. */
    weight: number;
  }[] = [
    {
      id: "h-impervious",
      title: comparativePhrase(imperviousDiff, "High impervious surface", "Low impervious surface"),
      evidenceIds: ["e-impervious", "e-surface"],
      diff: imperviousDiff,
      biggerIsWarmer: true,
      high: 20,
      medium: 10,
      weight: 1.2,
    },
    {
      id: "h-canopy",
      title: comparativePhrase(canopyDiff, "High tree canopy", "Low tree canopy"),
      evidenceIds: ["e-canopy", "e-surface"],
      diff: canopyDiff,
      biggerIsWarmer: false,
      high: 12,
      medium: 6,
      weight: 1.15,
    },
    {
      id: "h-wind",
      title: comparativePhrase(windDiff, "Strong local wind", "Weak local wind"),
      evidenceIds: ["e-wind"],
      diff: windDiff,
      biggerIsWarmer: false,
      high: 2.5,
      medium: 1.2,
      weight: 0.85,
    },
    {
      id: "h-density",
      title: comparativePhrase(densityDiff, "Dense urban form / low sky exposure", "Open urban form / high sky exposure"),
      evidenceIds: ["e-density"],
      diff: densityDiff,
      biggerIsWarmer: true,
      high: 8,
      medium: 4,
      weight: 0.95,
    },
  ];

  const ranked = candidates.map((c) => {
    const abs = Math.abs(c.diff);
    const consistent = direction(c.diff, c.biggerIsWarmer, anomaly);
    const magnitude = strengthFromMagnitude(abs, c.high, c.medium);
    const confidence: Strength = consistent ? magnitude : "low";
    const primary = byId(c.evidenceIds[0]);

    const hypothesis: Hypothesis = {
      id: c.id,
      title: c.title,
      confidence,
      evidenceIds: c.evidenceIds,
      explanation: primary.explanation,
      counterEvidence: consistent
        ? undefined
        : [
            `${primary.metric} moved in the direction that would argue against this explanation (${c.diff > 0 ? "+" : ""}${c.diff}${primary.unit ?? ""} vs. nearby).`,
          ],
    };
    const score = (consistent ? 1 : 0.15) * (abs / c.high) * c.weight;
    return { hypothesis, confidence, score };
  });

  const rank: Record<Strength, number> = { high: 2, medium: 1, low: 0 };
  ranked.sort((a, b) => {
    if (rank[a.confidence] !== rank[b.confidence]) {
      return rank[b.confidence] - rank[a.confidence];
    }
    return b.score - a.score;
  });
  const hypotheses: Hypothesis[] = ranked.map((r) => r.hypothesis);

  const limitations = [
    "This is an evidence-supported explanation, not a controlled causal experiment — variables are correlated, not isolated.",
    `The comparison set includes ${m.nearbyBlockCount} nearby blocks; a small sample can shift the local median.`,
    "Wind, humidity, and cloud cover reflect a single measurement snapshot and may not hold for the full day.",
  ];
  if (hypotheses.some((h) => h.counterEvidence)) {
    limitations.push(
      "At least one factor moved against its expected direction here — see the flagged hypothesis before treating it as settled.",
    );
  }

  return {
    temperature: m.temperature,
    nearbyAverage: m.nearbyAverage,
    anomaly,
    percentile,
    hypotheses,
    evidence,
    limitations,
    provenance: "demo",
  };
}

export function evidenceCategoryLabel(c: EvidenceCategory): string {
  switch (c) {
    case "temperature":
      return "Temperature";
    case "vegetation":
      return "Vegetation";
    case "surface":
      return "Surface";
    case "weather":
      return "Weather";
    case "urban_form":
      return "Urban form";
    case "history":
      return "History";
  }
}
