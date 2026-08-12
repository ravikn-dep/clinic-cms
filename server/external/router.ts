import { Router, type NextFunction, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as db from "../db";
import { registerPatientWithTracking } from "../services/patientRegistration";
import {
  EXTERNAL_LANGUAGE_CODES,
  isValidDate,
  isValidTime,
  normalizeIndianMobile,
  requestHash,
} from "./validation";
import {
  createExternalRequestSignature,
  getExternalApiKeyring,
  signaturesMatch,
  type ExternalApiScope,
} from "./security";

type ExternalRequest = Request & {
  rawBody?: string;
  externalAuth?: { keyId: string; scopes: ExternalApiScope[] };
  requestId?: string;
};

type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "AUTH_STALE"
  | "SCOPE_FORBIDDEN"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "SLOT_UNAVAILABLE"
  | "IDEMPOTENCY_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "REPLAY_DETECTED"
  | "INTERNAL_ERROR";

const REQUEST_TOLERANCE_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const requestBuckets = new Map<string, { startedAt: number; count: number }>();

const channelSchema = z.enum([
  "VOICE", "WHATSAPP", "PHONE", "WALK_IN", "WEBSITE", "GOOGLE", "INSTAGRAM", "REFERRAL", "OTHER",
]);
const languageSchema = z.enum(EXTERNAL_LANGUAGE_CODES);
const patientInputSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  age: z.coerce.number().int().min(0).max(130).optional(),
  dateOfBirth: z.string().refine(isValidDate, "Use YYYY-MM-DD for dateOfBirth").optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  contactNumber: z.string().trim().min(10).max(20),
  email: z.string().email().max(255).optional(),
  address: z.string().trim().max(1000).optional(),
  enquiry: z.object({
    channel: channelSchema,
    sourceDetail: z.string().trim().max(255).optional(),
    preferredLanguage: languageSchema.default("mixed"),
  }).optional(),
});

const appointmentCreateSchema = z.object({
  patientId: z.string().trim().min(1).max(50),
  consultantId: z.coerce.number().int().positive(),
  appointmentDate: z.string().refine(isValidDate, "Use YYYY-MM-DD for appointmentDate"),
  appointmentTime: z.string().refine(isValidTime, "Use 24-hour HH:MM for appointmentTime"),
  duration: z.coerce.number().int().min(15).max(120).multipleOf(15).optional(),
  notes: z.string().trim().max(1000).optional(),
  enquiryId: z.string().trim().min(1).max(64).optional(),
});

const rescheduleSchema = z.object({
  appointmentDate: z.string().refine(isValidDate, "Use YYYY-MM-DD for appointmentDate"),
  appointmentTime: z.string().refine(isValidTime, "Use 24-hour HH:MM for appointmentTime"),
});

function getRequestId(req: ExternalRequest) {
  return req.requestId ?? `req_${nanoid(20)}`;
}

function apiError(
  res: Response,
  requestId: string,
  status: number,
  code: ApiErrorCode,
  message: string,
  retryable = false,
) {
  return res.status(status).json({ requestId, error: { code, message, retryable } });
}

async function recordAudit(
  req: ExternalRequest,
  action: string,
  resourceType: string,
  result: "SUCCESS" | "DENIED" | "ERROR" | "IDEMPOTENT_REPLAY",
  resourceId?: string,
  safeMetadata?: Record<string, unknown>,
) {
  try {
    await db.createExternalApiAuditLog({
      auditId: `eal_${nanoid(20)}`,
      requestId: getRequestId(req),
      serviceKeyId: req.externalAuth?.keyId ?? req.header("x-external-key-id")?.slice(0, 100) ?? null,
      action,
      resourceType,
      resourceId: resourceId ?? null,
      result,
      safeMetadata: safeMetadata ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Logging failures must not leak sensitive details or turn an auth error into a 500.
  }
}

function checkRateLimit(keyId: string, ip: string) {
  const now = Date.now();
  const bucketKey = `${keyId}:${ip}`;
  const current = requestBuckets.get(bucketKey);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestBuckets.set(bucketKey, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function hasScope(req: ExternalRequest, scope: ExternalApiScope) {
  return req.externalAuth?.scopes.includes(scope) ?? false;
}

function requireScope(scope: ExternalApiScope) {
  return async (req: ExternalRequest, res: Response, next: NextFunction) => {
    if (hasScope(req, scope)) return next();
    await recordAudit(req, "authorization", "external_api", "DENIED", undefined, { requiredScope: scope });
    return apiError(res, getRequestId(req), 403, "SCOPE_FORBIDDEN", "The external service is not authorized for this operation.");
  };
}

async function authenticateExternalRequest(req: ExternalRequest, res: Response, next: NextFunction) {
  const suppliedRequestId = req.header("x-request-id")?.trim();
  const requestId = suppliedRequestId && /^[A-Za-z0-9_-]{8,64}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : `req_${nanoid(20)}`;
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const keyId = req.header("x-external-key-id");
  const timestamp = req.header("x-external-timestamp");
  const signature = req.header("x-external-signature");
  if (!keyId || !timestamp || !signature) {
    await recordAudit(req, "authentication", "external_api", "DENIED", undefined, { reason: "missing_headers" });
    return apiError(res, requestId, 401, "AUTH_REQUIRED", "Authentication headers are required.");
  }

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > REQUEST_TOLERANCE_MS) {
    await recordAudit(req, "authentication", "external_api", "DENIED", undefined, { reason: "stale_timestamp" });
    return apiError(res, requestId, 401, "AUTH_STALE", "Request timestamp is invalid or outside the allowed window.");
  }

  const key = getExternalApiKeyring()[keyId];
  if (!key || !key.active || !checkRateLimit(keyId, req.ip || "unknown")) {
    const reason = !key || !key.active ? "unknown_or_inactive_key" : "rate_limited";
    await recordAudit(req, "authentication", "external_api", "DENIED", undefined, { reason });
    return apiError(
      res,
      requestId,
      reason === "rate_limited" ? 429 : 401,
      reason === "rate_limited" ? "RATE_LIMITED" : "AUTH_INVALID",
      reason === "rate_limited" ? "Request limit exceeded. Try again later." : "Authentication could not be verified.",
      reason === "rate_limited",
    );
  }

  const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
  const path = req.originalUrl.split("?")[0];
  const expectedSignature = createExternalRequestSignature(key.secret, timestamp, requestId, req.method, path, rawBody);
  if (!signaturesMatch(expectedSignature, signature)) {
    await recordAudit(req, "authentication", "external_api", "DENIED", undefined, { reason: "signature_mismatch" });
    return apiError(res, requestId, 401, "AUTH_INVALID", "Authentication could not be verified.");
  }

  try {
    await db.recordExternalRequestReplay({
      replayId: `rep_${nanoid(20)}`,
      serviceKeyId: keyId,
      requestId,
      endpoint: path,
    });
  } catch {
    await recordAudit(req, "authentication", "external_api", "DENIED", undefined, { reason: "replay_detected" });
    return apiError(res, requestId, 409, "REPLAY_DETECTED", "Duplicate request ID detected for this service key.", true);
  }

  req.externalAuth = { keyId, scopes: key.scopes };
  return next();
}

async function requireIdempotency(
  req: ExternalRequest,
  res: Response,
  operation: string,
  handler: () => Promise<{ status: number; resourceType: string; resourceId: string; body: Record<string, unknown> }>,
) {
  const idempotencyKey = req.header("idempotency-key")?.trim();
  const requestId = getRequestId(req);
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return apiError(res, requestId, 400, "IDEMPOTENCY_REQUIRED", "A valid Idempotency-Key header is required.");
  }

  const payloadHash = requestHash(req.body ?? {});
  const existing = await db.getExternalIdempotencyRecord(operation, idempotencyKey);
  if (existing) {
    if (existing.requestHash !== payloadHash || existing.serviceKeyId !== req.externalAuth!.keyId) {
      return apiError(res, requestId, 409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request.");
    }
    if (existing.responseStatus === 202) {
      return apiError(res, requestId, 409, "IDEMPOTENCY_IN_PROGRESS", "The matching request is still being processed.", true);
    }
    await recordAudit(req, operation, existing.resourceType ?? "external_resource", "IDEMPOTENT_REPLAY", existing.resourceId ?? undefined);
    return res.status(existing.responseStatus).json(existing.responseBody);
  }

  try {
    await db.createExternalIdempotencyRecord({
      idempotencyId: `idem_${nanoid(20)}`,
      operation,
      idempotencyKey,
      requestHash: payloadHash,
      serviceKeyId: req.externalAuth!.keyId,
      responseStatus: 202,
      responseBody: { requestId, status: "processing" },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch {
    const concurrent = await db.getExternalIdempotencyRecord(operation, idempotencyKey);
    if (concurrent) {
      if (concurrent.requestHash !== payloadHash || concurrent.serviceKeyId !== req.externalAuth!.keyId) {
        return apiError(res, requestId, 409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request.");
      }
      return apiError(res, requestId, 409, "IDEMPOTENCY_IN_PROGRESS", "The matching request is still being processed.", true);
    }
    return apiError(res, requestId, 500, "INTERNAL_ERROR", "Unable to reserve the idempotency key.", true);
  }

  try {
    const result = await handler();
    const responseBody = { requestId, ...result.body };
    await db.completeExternalIdempotencyRecord(operation, idempotencyKey, result.status, responseBody, result.resourceType, result.resourceId);
    await recordAudit(req, operation, result.resourceType, "SUCCESS", result.resourceId);
    return res.status(result.status).json(responseBody);
  } catch (error) {
    await db.deleteExternalIdempotencyReservation(operation, idempotencyKey);
    throw error;
  }
}

function toSafeAppointment(appointment: NonNullable<Awaited<ReturnType<typeof db.getAppointmentById>>>) {
  return {
    appointmentId: appointment.appointmentId,
    patientId: appointment.patientId,
    consultantId: appointment.consultantId,
    appointmentDate: appointment.appointmentDate,
    appointmentTime: appointment.appointmentTime,
    duration: appointment.duration,
    status: appointment.status,
    checkedInAt: appointment.checkedInAt,
  };
}

export const externalApiRouter = Router();
externalApiRouter.use(authenticateExternalRequest);

externalApiRouter.get("/health", requireScope("health:read"), async (req: ExternalRequest, res) => {
  await recordAudit(req, "health.read", "external_api", "SUCCESS");
  res.status(200).json({ requestId: getRequestId(req), service: "clinic-external-api", version: "v1", status: "ok" });
});

externalApiRouter.get("/patients/search", requireScope("patients:read"), async (req: ExternalRequest, res, next) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query : "";
    if (!query.trim()) return apiError(res, getRequestId(req), 400, "VALIDATION_ERROR", "A query parameter is required.");
    const patients = await db.searchPatients(query);
    await recordAudit(req, "patients.search", "patient", "SUCCESS", undefined, { resultCount: patients.length });
    return res.status(200).json({
      requestId: getRequestId(req),
      patients: patients.map((patient) => ({
        patientId: patient.patientId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        contactNumber: patient.contactNumber,
        age: patient.age,
      })),
    });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.post("/patients", requireScope("patients:write"), async (req: ExternalRequest, res, next) => {
  try {
    const input = patientInputSchema.safeParse(req.body);
    if (!input.success) return apiError(res, getRequestId(req), 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid patient data.");
    if (!normalizeIndianMobile(input.data.contactNumber)) {
      return apiError(res, getRequestId(req), 400, "VALIDATION_ERROR", "A valid Indian mobile number is required.");
    }

    return await requireIdempotency(req, res, "patients.create", async () => {
      const registration = await registerPatientWithTracking(input.data, {
        auditActorId: `external:${req.externalAuth!.keyId}`,
        source: "external",
      });
      let enquiryId: string | undefined;
      if (input.data.enquiry) {
        enquiryId = `ENQ-${nanoid(16).toUpperCase()}`;
        await db.createEnquiry({
          enquiryId,
          patientId: registration.patientId,
          channel: input.data.enquiry.channel,
          sourceDetail: input.data.enquiry.sourceDetail ?? null,
          preferredLanguage: input.data.enquiry.preferredLanguage,
          lifecycleStage: "DETAILS_COLLECTED",
        });
      }
      return {
        status: 201,
        resourceType: "patient",
        resourceId: registration.patientId,
        body: { patient: { patientId: registration.patientId, firstName: registration.patient.firstName, lastName: registration.patient.lastName, contactNumber: registration.patient.contactNumber }, enquiryId },
      };
    });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.get("/consultants", requireScope("consultants:read"), async (req: ExternalRequest, res, next) => {
  try {
    const consultants = await db.getActiveConsultants();
    await recordAudit(req, "consultants.list", "consultant", "SUCCESS", undefined, { resultCount: consultants.length });
    return res.status(200).json({ requestId: getRequestId(req), consultants });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.get("/consultants/:consultantId/slots", requireScope("appointments:read"), async (req: ExternalRequest, res, next) => {
  try {
    const consultantId = Number(req.params.consultantId);
    const date = typeof req.query.date === "string" ? req.query.date : "";
    if (!Number.isInteger(consultantId) || consultantId <= 0 || !isValidDate(date)) {
      return apiError(res, getRequestId(req), 400, "VALIDATION_ERROR", "Valid consultantId and YYYY-MM-DD date are required.");
    }
    const consultant = await db.getUserById(consultantId);
    if (!consultant || consultant.role !== "consultant" || consultant.isActive !== 1) {
      return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Consultant not found.");
    }
    const slots = await db.getAvailableSlots(consultantId, date);
    await recordAudit(req, "consultants.slots", "consultant", "SUCCESS", String(consultantId), { date, slotCount: slots.length });
    return res.status(200).json({ requestId: getRequestId(req), consultantId, date, timezone: "Asia/Kolkata", slots });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.post("/appointments", requireScope("appointments:write"), async (req: ExternalRequest, res, next) => {
  try {
    const input = appointmentCreateSchema.safeParse(req.body);
    if (!input.success) return apiError(res, getRequestId(req), 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid appointment data.");
    const [patient, consultant] = await Promise.all([db.getPatientById(input.data.patientId), db.getUserById(input.data.consultantId)]);
    if (!patient) return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Patient not found.");
    if (!consultant || consultant.role !== "consultant" || consultant.isActive !== 1) {
      return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Consultant not found.");
    }

    return await requireIdempotency(req, res, "appointments.create", async () => {
      let appointmentId: string;
      try {
        appointmentId = await db.createAppointmentSafely(input.data);
      } catch (error) {
        if (error instanceof Error && error.message === "Time slot already booked") {
          const availabilityError = new Error("SLOT_UNAVAILABLE");
          throw availabilityError;
        }
        throw error;
      }
      if (input.data.enquiryId) await db.linkEnquiryToAppointment(input.data.enquiryId, appointmentId);
      const appointment = await db.getAppointmentById(appointmentId);
      return { status: 201, resourceType: "appointment", resourceId: appointmentId, body: { appointment: toSafeAppointment(appointment!) } };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SLOT_UNAVAILABLE") {
      await recordAudit(req, "appointments.create", "appointment", "ERROR", undefined, { reason: "slot_unavailable" });
      return apiError(res, getRequestId(req), 409, "SLOT_UNAVAILABLE", "The requested slot is no longer available.", true);
    }
    next(error);
  }
});

externalApiRouter.post("/appointments/:appointmentId/reschedule", requireScope("appointments:write"), async (req: ExternalRequest, res, next) => {
  try {
    const input = rescheduleSchema.safeParse(req.body);
    if (!input.success) return apiError(res, getRequestId(req), 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid appointment data.");
    const appointment = await db.getAppointmentById(req.params.appointmentId);
    if (!appointment) return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Appointment not found.");
    try {
      await db.rescheduleAppointment(appointment.appointmentId, input.data.appointmentDate, input.data.appointmentTime);
    } catch (error) {
      if (error instanceof Error && error.message.includes("booked")) {
        return apiError(res, getRequestId(req), 409, "SLOT_UNAVAILABLE", "The requested slot is no longer available.", true);
      }
      throw error;
    }
    const updated = await db.getAppointmentById(appointment.appointmentId);
    await recordAudit(req, "appointments.reschedule", "appointment", "SUCCESS", appointment.appointmentId);
    return res.status(200).json({ requestId: getRequestId(req), appointment: toSafeAppointment(updated!) });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.post("/appointments/:appointmentId/cancel", requireScope("appointments:write"), async (req: ExternalRequest, res, next) => {
  try {
    const appointment = await db.getAppointmentById(req.params.appointmentId);
    if (!appointment) return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Appointment not found.");
    await db.cancelAppointment(appointment.appointmentId);
    await db.updateEnquiryStageForAppointment(appointment.appointmentId, "CANCELLED");
    await recordAudit(req, "appointments.cancel", "appointment", "SUCCESS", appointment.appointmentId);
    return res.status(200).json({ requestId: getRequestId(req), appointmentId: appointment.appointmentId, status: "Cancelled" });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.post("/appointments/:appointmentId/check-in", requireScope("appointments:write"), async (req: ExternalRequest, res, next) => {
  try {
    const appointment = await db.getAppointmentById(req.params.appointmentId);
    if (!appointment) return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Appointment not found.");
    await db.checkInAppointment(appointment.appointmentId, `external:${req.externalAuth!.keyId}`);
    await db.updateEnquiryStageForAppointment(appointment.appointmentId, "CHECKED_IN");
    const updated = await db.getAppointmentById(appointment.appointmentId);
    await recordAudit(req, "appointments.check_in", "appointment", "SUCCESS", appointment.appointmentId);
    return res.status(200).json({ requestId: getRequestId(req), appointment: toSafeAppointment(updated!) });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.post("/appointments/:appointmentId/complete", requireScope("appointments:complete"), async (req: ExternalRequest, res, next) => {
  try {
    const appointment = await db.getAppointmentById(req.params.appointmentId);
    if (!appointment) return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Appointment not found.");
    await db.updateAppointmentStatus(appointment.appointmentId, "Completed");
    await db.updateEnquiryStageForAppointment(appointment.appointmentId, "OP_COMPLETED");
    await recordAudit(req, "appointments.complete", "appointment", "SUCCESS", appointment.appointmentId);
    return res.status(200).json({ requestId: getRequestId(req), appointmentId: appointment.appointmentId, status: "Completed" });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.post("/appointments/:appointmentId/no-show", requireScope("appointments:write"), async (req: ExternalRequest, res, next) => {
  try {
    const appointment = await db.getAppointmentById(req.params.appointmentId);
    if (!appointment) return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Appointment not found.");
    await db.updateAppointmentStatus(appointment.appointmentId, "No-show");
    await db.updateEnquiryStageForAppointment(appointment.appointmentId, "NO_SHOW");
    await recordAudit(req, "appointments.no_show", "appointment", "SUCCESS", appointment.appointmentId);
    return res.status(200).json({ requestId: getRequestId(req), appointmentId: appointment.appointmentId, status: "No-show" });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.get("/appointments/:appointmentId", requireScope("appointments:read"), async (req: ExternalRequest, res, next) => {
  try {
    const appointment = await db.getAppointmentById(req.params.appointmentId);
    if (!appointment) return apiError(res, getRequestId(req), 404, "NOT_FOUND", "Appointment not found.");
    await recordAudit(req, "appointments.read", "appointment", "SUCCESS", appointment.appointmentId);
    return res.status(200).json({ requestId: getRequestId(req), appointment: toSafeAppointment(appointment) });
  } catch (error) {
    next(error);
  }
});

externalApiRouter.use(async (error: unknown, req: ExternalRequest, res: Response, _next: NextFunction) => {
  await recordAudit(req, "external.error", "external_api", "ERROR", undefined, { errorType: error instanceof Error ? error.name : "unknown" });
  return apiError(res, getRequestId(req), 500, "INTERNAL_ERROR", "The request could not be completed.", true);
});
