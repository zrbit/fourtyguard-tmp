import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Job = { activityId: string; createdAt: number; result?: unknown };
const STORE_PATH = join(process.cwd(), ".next", "cache", "fortyguard-jobs.json");
const MAX_AGE_MS = 30 * 60 * 1000;

// Pure best-effort dedup cache for local dev (a single, long-lived `next
// dev`/`next start` process) -- NOT load-bearing for correctness anywhere.
// The actual polling flow never depends on this: the client holds
// `activityId` in localStorage across the whole submit -> poll -> render
// flow, and FortyGuard's own /status endpoint is the real source of truth.
// This store only exists to avoid submitting a duplicate paid job when two
// requests race for the same jobKey.
//
// On a serverless host (Vercel etc.) the deployed filesystem is read-only
// and never shared/persistent across invocations, so every read/write here
// silently misses -- by design, not by accident. Swallow failures instead
// of letting a write throw and take down a real request; the worst case
// there is an occasional duplicate submission, not a broken feature.
function readJobs(): Record<string, Job> { try { return JSON.parse(readFileSync(STORE_PATH, "utf8")); } catch { return {}; } }
function writeJobs(jobs: Record<string, Job>) { try { mkdirSync(dirname(STORE_PATH), { recursive: true }); writeFileSync(STORE_PATH, JSON.stringify(jobs), "utf8"); } catch { /* read-only or ephemeral filesystem (e.g. Vercel) -- best-effort only, see module comment */ } }

export function activeJob(city: string) {
  const jobs = readJobs(); const job = jobs[city];
  if (!job || Date.now() - job.createdAt > MAX_AGE_MS) { delete jobs[city]; writeJobs(jobs); return undefined; }
  return job;
}
export function saveJob(city: string, activityId: string) { const jobs = readJobs(); jobs[city] = { activityId, createdAt: Date.now() }; writeJobs(jobs); }
export function saveResult(activityId: string, result: unknown) { const jobs = readJobs(); for (const job of Object.values(jobs)) if (job.activityId === activityId) job.result = result; writeJobs(jobs); }
export function removeJob(activityId: string) { const jobs = readJobs(); for (const [city, job] of Object.entries(jobs)) if (job.activityId === activityId) delete jobs[city]; writeJobs(jobs); }
