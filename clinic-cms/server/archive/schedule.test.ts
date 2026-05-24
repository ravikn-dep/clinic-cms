import { describe, expect, it } from "vitest";
import { MS_PER_WEEK, shouldRunArchive } from "./schedule";

describe("shouldRunArchive", () => {
  const now = new Date("2026-05-24T12:00:00Z");

  it("runs when there is no prior finished run", () => {
    expect(shouldRunArchive(null, now, 6)).toBe(true);
    expect(shouldRunArchive(undefined, now, 6)).toBe(true);
  });

  it("does not run before the interval has elapsed", () => {
    const lastFinished = new Date(now.getTime() - 5 * MS_PER_WEEK);
    expect(shouldRunArchive(lastFinished, now, 6)).toBe(false);
  });

  it("runs when exactly 6 weeks have elapsed", () => {
    const lastFinished = new Date(now.getTime() - 6 * MS_PER_WEEK);
    expect(shouldRunArchive(lastFinished, now, 6)).toBe(true);
  });

  it("runs when more than 6 weeks have elapsed", () => {
    const lastFinished = new Date(now.getTime() - 7 * MS_PER_WEEK);
    expect(shouldRunArchive(lastFinished, now, 6)).toBe(true);
  });

  it("respects a custom interval in weeks", () => {
    const lastFinished = new Date(now.getTime() - 2 * MS_PER_WEEK);
    expect(shouldRunArchive(lastFinished, now, 2)).toBe(true);
    expect(shouldRunArchive(lastFinished, now, 3)).toBe(false);
  });
});
