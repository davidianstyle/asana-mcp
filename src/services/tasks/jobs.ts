// Polling helper for Asana's async Job resource (JobsApi.getJob — see
// node_modules/asana/src/api/JobsApi.d.ts). `TasksApi.duplicateTask` (and other
// async endpoints) return a Job immediately and finish the actual work in the
// background; the caller has to poll `GET /jobs/{job_gid}` until the job's
// `status` reaches a terminal value.
//
// Job.status is documented as one of "not_started", "in_progress", "succeeded",
// or "failed" (the SDK's generated types don't model the Job resource's fields
// at all — `getJob` returns `any` — so this is taken from Asana's public API
// reference for the Job resource, not invented).

/** The subset of a Job resource this module cares about. */
export interface JobLike {
  gid: string;
  status?: string;
  [key: string]: unknown;
}

/** True once a job has reached a terminal state (succeeded or failed). */
export function isJobTerminal(job: JobLike): boolean {
  return job.status === "succeeded" || job.status === "failed";
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface PollJobOptions {
  /** Total time budget, in ms, before giving up and reporting "still running". Default 30000 (~30s). */
  timeoutMs?: number;
  /** Delay before the first re-check, in ms. Default 500. */
  initialDelayMs?: number;
  /** Cap on the per-check delay, in ms (backoff doubles up to this). Default 5000. */
  maxDelayMs?: number;
  /** Injectable sleep, for tests. Defaults to a real `setTimeout`-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock (ms since epoch), for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface PollJobResult {
  /** The last-seen job record. */
  job: JobLike;
  /** True if `timeoutMs` elapsed before the job reached a terminal state. */
  timedOut: boolean;
}

/**
 * Polls `getJob` with doubling backoff (capped at `maxDelayMs`) until the job
 * reaches a terminal state (`succeeded`/`failed`) or `timeoutMs` elapses.
 *
 * Never throws on a timeout: the job keeps running server-side regardless of
 * whether we're still watching it, so giving up on our end just means
 * returning the last-seen job with `timedOut: true` — the caller reports it
 * as "still running" (with the job gid to check later) rather than failing
 * the tool call outright.
 */
export async function pollJob(
  getJob: () => Promise<JobLike>,
  options: PollJobOptions = {}
): Promise<PollJobResult> {
  const {
    timeoutMs = 30_000,
    initialDelayMs = 500,
    maxDelayMs = 5_000,
    sleep = defaultSleep,
    now = Date.now,
  } = options;

  const deadline = now() + timeoutMs;
  let delay = initialDelayMs;
  let job = await getJob();

  while (!isJobTerminal(job)) {
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(delay, maxDelayMs, remaining));
    delay = Math.min(delay * 2, maxDelayMs);
    job = await getJob();
  }

  return { job, timedOut: !isJobTerminal(job) };
}
