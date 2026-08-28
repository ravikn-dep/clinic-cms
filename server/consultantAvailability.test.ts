import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { validateConsultantAvailability } from "./db";

const baseUser = {
  id: 11,
  openId: "availability-admin",
  name: "Availability Admin",
  email: "admin@example.test",
  loginMethod: "local",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  isActive: 1,
};

const context = (role: "admin" | "staff"): TrpcContext => ({
  user: { ...baseUser, role },
  req: {} as any,
  res: {} as any,
});

const sundaySplit = [
  { dayOfWeek: 0, startTime: "10:00", endTime: "12:00", active: true },
  { dayOfWeek: 0, startTime: "15:00", endTime: "17:00", active: true },
];

describe("consultant availability", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows empty days and multiple non-overlapping intervals on one day", () => {
    expect(validateConsultantAvailability([])).toEqual([]);
    expect(validateConsultantAvailability(sundaySplit)).toEqual(sundaySplit);
  });

  it("rejects invalid day and time ranges", () => {
    expect(() => validateConsultantAvailability([{ dayOfWeek: 7, startTime: "10:00", endTime: "11:00" }])).toThrow("day");
    expect(() => validateConsultantAvailability([{ dayOfWeek: 1, startTime: "9:00", endTime: "11:00" }])).toThrow("HH:MM");
    expect(() => validateConsultantAvailability([{ dayOfWeek: 1, startTime: "12:00", endTime: "12:00" }])).toThrow("before");
  });

  it("rejects duplicate and overlapping active intervals but allows adjacent sessions", () => {
    expect(() => validateConsultantAvailability([
      { dayOfWeek: 0, startTime: "10:00", endTime: "12:00" },
      { dayOfWeek: 0, startTime: "10:00", endTime: "12:00", active: false },
    ])).toThrow("Duplicate");
    expect(() => validateConsultantAvailability([
      { dayOfWeek: 0, startTime: "10:00", endTime: "14:00" },
      { dayOfWeek: 0, startTime: "12:00", endTime: "17:00" },
    ])).toThrow("overlap");
    expect(validateConsultantAvailability([
      { dayOfWeek: 0, startTime: "10:00", endTime: "12:00" },
      { dayOfWeek: 0, startTime: "12:00", endTime: "14:00" },
    ])).toHaveLength(2);
  });

  it("allows an administrator to read availability and atomically delegate the complete schedule update", async () => {
    vi.spyOn(db, "getConsultantProfileById").mockResolvedValue({ id: 4260027, role: "consultant" } as any);
    const existing = [{ availabilityId: "AVL-1", consultantId: 4260027, dayOfWeek: 1, startTime: "17:30", endTime: "20:30", isActive: 1 }];
    vi.spyOn(db, "getConsultantAvailability").mockResolvedValue(existing as any);
    const replace = vi.spyOn(db, "replaceConsultantAvailabilityWithAudit").mockResolvedValue(sundaySplit as any);

    await expect(appRouter.createCaller(context("admin")).consultants.getAvailability({ consultantId: 4260027 })).resolves.toEqual(existing);
    await expect(appRouter.createCaller(context("admin")).consultants.updateAvailability({ consultantId: 4260027, availability: sundaySplit })).resolves.toMatchObject({ success: true, availability: sundaySplit });
    expect(replace).toHaveBeenCalledWith(4260027, sundaySplit, "11");
  });

  it("enforces admin-only writes before touching availability persistence", async () => {
    const replace = vi.spyOn(db, "replaceConsultantAvailabilityWithAudit");
    await expect(appRouter.createCaller(context("staff")).consultants.updateAvailability({ consultantId: 4260027, availability: sundaySplit })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(replace).not.toHaveBeenCalled();
  });
});
