import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Job = { activityId: string; createdAt: number; result?: unknown };
const STORE_PATH = join(process.cwd(), ".next", "cache", "fortyguard-jobs.json");
const MAX_AGE_MS = 30 * 60 * 1000;

function readJobs(): Record<string, Job> { try { return JSON.parse(readFileSync(STORE_PATH, "utf8")); } catch { return {}; } }
function writeJobs(jobs: Record<string, Job>) { mkdirSync(dirname(STORE_PATH), { recursive: true }); writeFileSync(STORE_PATH, JSON.stringify(jobs), "utf8"); }

export function activeJob(city: string) {
  const jobs = readJobs(); const job = jobs[city];
  if (!job || Date.now() - job.createdAt > MAX_AGE_MS) { delete jobs[city]; writeJobs(jobs); return undefined; }
  return job;
}
export function saveJob(city: string, activityId: string) { const jobs = readJobs(); jobs[city] = { activityId, createdAt: Date.now() }; writeJobs(jobs); }
export function saveResult(activityId: string, result: unknown) { const jobs = readJobs(); for (const job of Object.values(jobs)) if (job.activityId === activityId) job.result = result; writeJobs(jobs); }
export function removeJob(activityId: string) { const jobs = readJobs(); for (const [city, job] of Object.entries(jobs)) if (job.activityId === activityId) delete jobs[city]; writeJobs(jobs); }
