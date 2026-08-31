import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TrainingAoi } from "@/components/training/TrainingCoverageMap";

/**
 * Reads the static JSON produced by ml/src/serve/export_training_coverage.py
 * -- every candidate AOI (aoi_sampling.AOIS + NIGHT_AOIS) with its real
 * collection status. Same server-only-file-read pattern as
 * lib/reasoning/mlExplain.ts: no live Python, no network, at app runtime.
 */

const COVERAGE_PATH = join(process.cwd(), "src", "lib", "mock-data", "training-coverage.json");

export function getTrainingCoverage(): TrainingAoi[] {
  try {
    return JSON.parse(readFileSync(COVERAGE_PATH, "utf8")) as TrainingAoi[];
  } catch {
    return [];
  }
}
