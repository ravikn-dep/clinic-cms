import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { createExternalRequestSignature } from "./security";

const mockState = vi.hoisted(() => ({
  db: {
    createExternalApiAuditLog: vi.fn(),
    searchPatients: vi.fn(),
    getExternalIdempotencyRecord: vi.fn(),
    createExternalIdempotencyRecord: vi.fn(),
    completeExternalIdempotencyRecord: vi.fn(),
    deleteExternalIdempotencyReservation: vi.fn(),
    createEnquiry: vi.fn(),
    getActiveConsultants: vi.fn(),
    getUserById: vi.fn(),
    getAvailableSlots: vi.fn(),
    getPatientById: vi.fn(),
    createAppointmentSafely: vi.fn(),
    getAppointmentById: vi.fn(),
    linkEnquiryToAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    checkInAppointment: vi.fn(),
    updateAppointmentStatus: vi.fn(),
    updateEnquiryStageForAppointment: vi.fn(),
  },
  registration: vi.fn(),
}));

vi.mock("../db", () => mockState.db);
vi.mock("../services/patientRegistration", () => ({
  registerPatientWithTracking: mockState.registration,
}));

import { externalApiRouter } from "./router";

const TEST_SECRET = "test-external-api-secret-that-is-at-least-32-characters";
const ALL_SCOPES = [
  "health:read",
  "patients:read",
  "patients:write",
  "consultants:read",
  "appointments:read",
  "appointments:write",
  "appointments:complete",
];
const originalKeyring = process.env.EXTERNAL_API_HMAC_KEYS;

let server: Server;
let baseUrl = "";
let requestSequence = 0;

const baseAppointment = {
  appointmentId: "APT-TEST-001",
  patientId: "P-TEST-001",
  consultantId: 7,
  appointmentDate: "2026-08-13",
  appointmentTime: "10:00",
  duration: 30,
  status: "Scheduled",
  checkedInAt: null,
};

function configureKey(scopes = ALL_SCOPES, keyId = "test-key") {
  process.env.EXTERNAL_API_HMAC_KEYS = JSON.stringify({
    [keyId]: { secret: TEST_SECRET, scopes, active: true },
  });
}

function buildRequestId() {
  requestSequence += 1;
  return `api-test-${String(requestSequence).padStart(6, "0")}`;
}

async function signedRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  options: { keyId?: string; requestId?: string; timestamp?: string; signature?: string; headers?: Record<string, string> } = {},
) {
  const requestId = options.requestId ?? buildRequestId();
  const timestamp = options.timestamp ?? new Date().toISOString();
  const rawBody = JSON.stringify(body ?? {});
  const signature = options.signature ?? createExternalRequestSignature(
    TEST_SECRET,
    timestamp,
    requestId,
    method,
    `/api/external/v1${path.split("?")[0]}`,
    rawBody,
  );
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-external-key-id": options.keyId ?? "test-key",
      "x-external-timestamp": timestamp,
      "x-external-signature": signature,
      "x-request-id": requestId,
      ...options.headers,
    },
    body: body ? rawBody : undefined,
  });
  return { response, requestId };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json({ verify: (req, _res, buffer) => { (req as typeof req & { rawBody?: string }).rawBody = buffer.toString("utf8"); } }));
  app.use("/api/external/v1", externalApiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
  baseUrl = `http://127.0.0.1:${address.port}/api/external/v1`;
});

afterAll(async () => {
  if (originalKeyring === undefined) delete process.env.EXTERNAL_API_HMAC_KEYS;
  else process.env.EXTERNAL_API_HMAC_KEYS = originalKeyring;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  requestSequence = 0;
  configureKey();
  mockState.db.getExternalIdempotencyRecord.mockResolvedValue(undefined);
  mockState.db.createExternalIdempotencyRecord.mockResolvedValue(undefined);
  mockState.db.completeExternalIdempotencyRecord.mockResolvedValue(undefined);
  mockState.db.deleteExternalIdempotencyReservation.mockResolvedValue(undefined);
  mockState.db.createExternalApiAuditLog.mockResolvedValue(undefined);
  mockState.db.getPatientById.mockResolvedValue({ patientId: "P-TEST-001" });
  mockState.db.getUserById.mockResolvedValue({ id: 7, role: "consultant", isActive: 1 });
  mockState.db.getAppointmentById.mockResolvedValue(baseAppointment);
  mockState.db.createAppointmentSafely.mockResolvedValue("APT-TEST-001");
  mockState.registration.mockResolvedValue({
    patientId: "P-TEST-001",
    patient: { firstName: "Anita", lastName: "Rao", contactNumber: "+919876543210" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("external API authentication and authorization", () => {
  it("rejects missing authentication headers and records a denied audit entry", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("AUTH_REQUIRED");
    expect(mockState.db.createExternalApiAuditLog).toHaveBeenCalledWith(expect.objectContaining({ result: "DENIED" }));
  });

  it("rejects invalid signatures and stale timestamps", async () => {
    const invalid = await signedRequest("GET", "/health", undefined, { signature: "0".repeat(64) });
    expect(invalid.response.status).toBe(401);
    expect((await invalid.response.json()).error.code).toBe("AUTH_INVALID");

    const stale = await signedRequest("GET", "/health", undefined, { timestamp: "2000-01-01T00:00:00.000Z" });
    expect(stale.response.status).toBe(401);
    expect((await stale.response.json()).error.code).toBe("AUTH_STALE");
  });

  it("enforces scopes, including a separately authorized completion scope", async () => {
    configureKey(["appointments:write"]);
    const forbidden = await signedRequest("GET", "/patients/search?query=Anita");
    expect(forbidden.response.status).toBe(403);
    expect((await forbidden.response.json()).error.code).toBe("SCOPE_FORBIDDEN");

    const complete = await signedRequest("POST", "/appointments/APT-TEST-001/complete", {});
    expect(complete.response.status).toBe(403);
    expect(mockState.db.updateAppointmentStatus).not.toHaveBeenCalled();
  });

  it("returns a rate-limit response once a service key exceeds its request bucket", async () => {
    configureKey(["health:read"], "rate-limit-key");
    const requests = Array.from({ length: 121 }, () => signedRequest("GET", "/health", undefined, { keyId: "rate-limit-key" }));
    const results = await Promise.all(requests);
    expect(results.filter(({ response }) => response.status === 429)).toHaveLength(1);
  });
});

describe("external API patient and availability flows", () => {
  it("searches patients by supported server-side query values", async () => {
    mockState.db.searchPatients.mockResolvedValue([{ patientId: "OP-001", firstName: "Anita", lastName: "Rao", contactNumber: "+919876543210", age: 42 }]);
    const request = await signedRequest("GET", "/patients/search?query=9876543210");
    expect(request.response.status).toBe(200);
    expect(mockState.db.searchPatients).toHaveBeenCalledWith("9876543210");
    expect((await request.response.json()).patients[0]).toMatchObject({ patientId: "OP-001", age: 42 });
  });

  it("creates a patient once and replays an identical idempotent request without a second registration", async () => {
    const body = { firstName: "Anita", lastName: "Rao", age: 42, gender: "Female", contactNumber: "9876543210", enquiry: { channel: "VOICE", preferredLanguage: "te-IN" } };
    const created = await signedRequest("POST", "/patients", body, { headers: { "idempotency-key": "patient-create-0001" } });
    expect(created.response.status).toBe(201);
    expect(mockState.registration).toHaveBeenCalledTimes(1);

    mockState.db.getExternalIdempotencyRecord.mockResolvedValue({
      operation: "patients.create", idempotencyKey: "patient-create-0001", requestHash: (await import("./validation")).requestHash(body), serviceKeyId: "test-key", responseStatus: 201, responseBody: { requestId: "previous", patient: { patientId: "P-TEST-001" } }, resourceType: "patient", resourceId: "P-TEST-001",
    });
    const replay = await signedRequest("POST", "/patients", body, { headers: { "idempotency-key": "patient-create-0001" } });
    expect(replay.response.status).toBe(201);
    expect(mockState.registration).toHaveBeenCalledTimes(1);
  });

  it("rejects reusing an idempotency key with a different payload", async () => {
    mockState.db.getExternalIdempotencyRecord.mockResolvedValue({ requestHash: "different", serviceKeyId: "test-key", responseStatus: 201, responseBody: {}, resourceType: "patient", resourceId: "P-OLD" });
    const response = await signedRequest("POST", "/patients", { firstName: "Anita", lastName: "Rao", contactNumber: "9876543210" }, { headers: { "idempotency-key": "patient-create-0002" } });
    expect(response.response.status).toBe(409);
    expect((await response.response.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("returns available consultant slots only for a valid active consultant", async () => {
    mockState.db.getAvailableSlots.mockResolvedValue(["09:00", "09:30"]);
    const response = await signedRequest("GET", "/consultants/7/slots?date=2026-08-13");
    expect(response.response.status).toBe(200);
    expect((await response.response.json()).slots).toEqual(["09:00", "09:30"]);

    const invalid = await signedRequest("GET", "/consultants/7/slots?date=13-08-2026");
    expect(invalid.response.status).toBe(400);
    expect((await invalid.response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("external API appointment flows", () => {
  const appointmentBody = { patientId: "P-TEST-001", consultantId: 7, appointmentDate: "2026-08-13", appointmentTime: "10:00", duration: 30 };

  it("creates appointments and prevents a simultaneous second booking for the same slot", async () => {
    mockState.db.createAppointmentSafely
      .mockResolvedValueOnce("APT-TEST-001")
      .mockRejectedValueOnce(new Error("Time slot already booked"));

    const [first, second] = await Promise.all([
      signedRequest("POST", "/appointments", appointmentBody, { headers: { "idempotency-key": "booking-000001" } }),
      signedRequest("POST", "/appointments", appointmentBody, { headers: { "idempotency-key": "booking-000002" } }),
    ]);
    expect([first.response.status, second.response.status].sort()).toEqual([201, 409]);
    expect(mockState.db.createAppointmentSafely).toHaveBeenCalledTimes(2);
  });

  it("reschedules and cancels an appointment", async () => {
    const reschedule = await signedRequest("POST", "/appointments/APT-TEST-001/reschedule", { appointmentDate: "2026-08-14", appointmentTime: "11:30" });
    expect(reschedule.response.status).toBe(200);
    expect(mockState.db.rescheduleAppointment).toHaveBeenCalledWith("APT-TEST-001", "2026-08-14", "11:30");

    const cancel = await signedRequest("POST", "/appointments/APT-TEST-001/cancel", {});
    expect(cancel.response.status).toBe(200);
    expect(mockState.db.cancelAppointment).toHaveBeenCalledWith("APT-TEST-001");
    expect(mockState.db.updateEnquiryStageForAppointment).toHaveBeenCalledWith("APT-TEST-001", "CANCELLED");
  });

  it("records check-in, separately scoped completion, and no-show updates", async () => {
    const checkIn = await signedRequest("POST", "/appointments/APT-TEST-001/check-in", {});
    expect(checkIn.response.status).toBe(200);
    expect(mockState.db.checkInAppointment).toHaveBeenCalledWith("APT-TEST-001", "external:test-key");

    const complete = await signedRequest("POST", "/appointments/APT-TEST-001/complete", {});
    expect(complete.response.status).toBe(200);
    expect(mockState.db.updateAppointmentStatus).toHaveBeenCalledWith("APT-TEST-001", "Completed");
    expect(mockState.db.updateEnquiryStageForAppointment).toHaveBeenCalledWith("APT-TEST-001", "OP_COMPLETED");

    const noShow = await signedRequest("POST", "/appointments/APT-TEST-001/no-show", {});
    expect(noShow.response.status).toBe(200);
    expect(mockState.db.updateAppointmentStatus).toHaveBeenCalledWith("APT-TEST-001", "No-show");
  });

  it("rejects invalid appointment date and time input and creates audit records for successful actions", async () => {
    const invalid = await signedRequest("POST", "/appointments", { ...appointmentBody, appointmentDate: "2026-99-99", appointmentTime: "25:90" }, { headers: { "idempotency-key": "invalid-000001" } });
    expect(invalid.response.status).toBe(400);
    expect((await invalid.response.json()).error.code).toBe("VALIDATION_ERROR");

    const read = await signedRequest("GET", "/appointments/APT-TEST-001");
    expect(read.response.status).toBe(200);
    expect(mockState.db.createExternalApiAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "appointments.read", result: "SUCCESS" }));
  });
});
