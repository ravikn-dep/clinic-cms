import { describe, it, expect } from "vitest";
import { toMysqlDateTime } from "./utils";

describe("toMysqlDateTime — UTC-preserving MySQL DATETIME contract", () => {
  it("converts an ISO-8601 Z instant to a MySQL UTC datetime string", () => {
    expect(toMysqlDateTime("2026-09-01T09:12:58.326Z")).toBe("2026-09-01 09:12:58");
  });

  it("accepts a Date and preserves the SAME UTC instant (no local shift)", () => {
    const s = toMysqlDateTime(new Date("2026-09-01T09:12:58.326Z"));
    expect(s).toBe("2026-09-01 09:12:58");
    expect(new Date(s + "Z").toISOString()).toBe("2026-09-01T09:12:58.000Z");
  });

  it("emits valid MySQL DATETIME syntax with no 'T' or 'Z'", () => {
    const s = toMysqlDateTime();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(s).not.toContain("T");
    expect(s).not.toContain("Z");
  });
});
