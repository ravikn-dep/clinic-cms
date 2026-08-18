import { beforeEach, describe, expect, it, vi } from "vitest";

const createPool = vi.fn(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  default: { createPool },
}));

const db = await import("./db");

describe("Database connection resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "mysql://clinic-test:clinic-test@127.0.0.1/clinic_test";
  });

  it("creates a managed pool for user and inventory queries instead of a single long-lived connection", async () => {
    const database = await db.getDb();

    expect(database).toBeDefined();
    expect(createPool).toHaveBeenCalledTimes(1);
    expect(createPool).toHaveBeenCalledWith(expect.objectContaining({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
    }));
  });
});
