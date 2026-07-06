import { describe, it, expect, vi } from "vitest";
import { isJobTerminal, pollJob, JobLike } from "../../../src/services/tasks/jobs.js";

describe("isJobTerminal", () => {
  it("treats succeeded and failed as terminal", () => {
    expect(isJobTerminal({ gid: "1", status: "succeeded" })).toBe(true);
    expect(isJobTerminal({ gid: "1", status: "failed" })).toBe(true);
  });

  it("treats not_started and in_progress as non-terminal", () => {
    expect(isJobTerminal({ gid: "1", status: "not_started" })).toBe(false);
    expect(isJobTerminal({ gid: "1", status: "in_progress" })).toBe(false);
  });

  it("treats a missing status as non-terminal", () => {
    expect(isJobTerminal({ gid: "1" })).toBe(false);
  });
});

describe("pollJob", () => {
  // A controllable fake clock: `now()` reads the counter, `sleep(ms)` advances
  // it by `ms` instead of actually waiting — keeps the whole test suite fast
  // and deterministic while still exercising the real backoff/timeout math.
  function fakeClock(start = 0) {
    let time = start;
    return {
      now: () => time,
      sleep: vi.fn(async (ms: number) => {
        time += ms;
      }),
    };
  }

  it("returns immediately, with no sleep, when the job is already terminal", async () => {
    const clock = fakeClock();
    const getJob = vi.fn().mockResolvedValue({ gid: "j1", status: "succeeded" } as JobLike);

    const result = await pollJob(getJob, { now: clock.now, sleep: clock.sleep });

    expect(result).toEqual({ job: { gid: "j1", status: "succeeded" }, timedOut: false });
    expect(getJob).toHaveBeenCalledTimes(1);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("polls again after sleeping when the job is still in progress, then returns once terminal", async () => {
    const clock = fakeClock();
    const getJob = vi
      .fn()
      .mockResolvedValueOnce({ gid: "j1", status: "in_progress" } as JobLike)
      .mockResolvedValueOnce({ gid: "j1", status: "in_progress" } as JobLike)
      .mockResolvedValueOnce({ gid: "j1", status: "succeeded" } as JobLike);

    const result = await pollJob(getJob, { now: clock.now, sleep: clock.sleep });

    expect(result).toEqual({ job: { gid: "j1", status: "succeeded" }, timedOut: false });
    expect(getJob).toHaveBeenCalledTimes(3);
    expect(clock.sleep).toHaveBeenCalledTimes(2);
  });

  it("treats a failed job as terminal (caller decides how to report it)", async () => {
    const clock = fakeClock();
    const getJob = vi.fn().mockResolvedValue({ gid: "j1", status: "failed" } as JobLike);

    const result = await pollJob(getJob, { now: clock.now, sleep: clock.sleep });

    expect(result).toEqual({ job: { gid: "j1", status: "failed" }, timedOut: false });
  });

  it("backs off with growing delays, capped at maxDelayMs", async () => {
    const clock = fakeClock();
    const getJob = vi
      .fn()
      .mockResolvedValueOnce({ gid: "j1", status: "in_progress" } as JobLike)
      .mockResolvedValueOnce({ gid: "j1", status: "in_progress" } as JobLike)
      .mockResolvedValueOnce({ gid: "j1", status: "in_progress" } as JobLike)
      .mockResolvedValueOnce({ gid: "j1", status: "succeeded" } as JobLike);

    await pollJob(getJob, {
      now: clock.now,
      sleep: clock.sleep,
      initialDelayMs: 500,
      maxDelayMs: 1500,
      timeoutMs: 60_000,
    });

    expect(clock.sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000, 1500]);
  });

  it("stops polling and reports timedOut once the deadline elapses, without throwing", async () => {
    const clock = fakeClock();
    const getJob = vi.fn().mockResolvedValue({ gid: "j1", status: "in_progress" } as JobLike);

    const result = await pollJob(getJob, {
      now: clock.now,
      sleep: clock.sleep,
      initialDelayMs: 1000,
      maxDelayMs: 1000,
      timeoutMs: 3000,
    });

    expect(result.timedOut).toBe(true);
    expect(result.job).toEqual({ gid: "j1", status: "in_progress" });
    // Never throws — the job keeps running server-side; caller reports "still running".
  });

  it("never sleeps past the deadline (clamps the final wait to the remaining budget)", async () => {
    const clock = fakeClock();
    const getJob = vi.fn().mockResolvedValue({ gid: "j1", status: "in_progress" } as JobLike);

    await pollJob(getJob, {
      now: clock.now,
      sleep: clock.sleep,
      initialDelayMs: 5000,
      maxDelayMs: 5000,
      timeoutMs: 3000,
    });

    // Only one sleep call happens, clamped to the 3000ms budget rather than the 5000ms delay.
    expect(clock.sleep).toHaveBeenCalledTimes(1);
    expect(clock.sleep).toHaveBeenCalledWith(3000);
  });

  it("uses a real setTimeout-based sleep and Date.now by default", async () => {
    const getJob = vi.fn().mockResolvedValue({ gid: "j1", status: "succeeded" } as JobLike);
    const result = await pollJob(getJob);
    expect(result).toEqual({ job: { gid: "j1", status: "succeeded" }, timedOut: false });
  });
});
