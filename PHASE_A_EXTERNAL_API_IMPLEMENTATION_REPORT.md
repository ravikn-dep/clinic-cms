# Phase A External API Implementation Report

**Project:** Deepthis Ortho Clinic CMS  
**Implementation status:** Complete and validated; **not deployed by this task**  
**Report date:** 12 August 2026

## 1. Executive summary

Phase A introduces a versioned, server-to-server external API at `/api/external/v1/*` for a future multilingual Clinic Voice Assistant. The implementation enables administrative patient intake, consultant availability lookup, appointment booking, appointment updates, enquiry-source tracking, and operational status updates. It is intentionally designed so that the external service cannot receive or modify consultation notes, prescriptions, diagnoses, treatment plans, clinical advice, billing content, or uploaded clinical artifacts.

The API uses HMAC-SHA256 request signing, scope-based authorization, request correlation, replay protection, rate limiting, idempotency protection, transactional appointment conflict controls, and external audit logging. Existing CMS registration is reused through a shared domain service, avoiding duplicate patient-ID, barcode/QR, audit, and notification logic.

| Outcome | Result |
|---|---|
| Versioned external API | Implemented at `/api/external/v1` |
| Secrets exposed | No |
| Automatic deployment | No |
| Full regression suite | **168/168 tests passed** |
| Production build | Passed |
| Development diagnostics | Running; TypeScript and language-service checks report no errors |

## 2. Implemented files and responsibilities

| File | Purpose |
|---|---|
| `server/external/router.ts` | Express router containing all 12 versioned external endpoints, HMAC middleware, scope checks, rate limiting, idempotency flow, and safe errors |
| `server/external/security.ts` | HMAC keyring parsing, supported scope types, HMAC generation, and constant-time signature comparison |
| `server/external/validation.ts` | Indian mobile normalization, strict date/time validation, accepted language values, canonical request hashing, and Kolkata date utility |
| `server/external/api.test.ts` | 12 API-level automated tests using a real Express instance with mocked database/service boundaries |
| `server/external/security.test.ts` | Validates the configured HMAC keyring shape |
| `server/external/API_DOCS.md` | Redacted integration contract with request/response examples for every endpoint |
| `server/services/patientRegistration.ts` | Shared patient-registration domain service used by both internal tRPC and external REST flows |
| `server/_core/index.ts` | Captures raw request bytes and mounts the external router at `/api/external/v1` |
| `server/db.ts` | External audit, enquiry, idempotency, booking-lock, search, check-in, reschedule, and appointment safety helpers |
| `drizzle/schema.ts` | External-integration tables, added patient/appointment fields, and type exports |
| `drizzle/0015_yummy_prodigy.sql` | Main Phase A schema migration; applied |
| `drizzle/0016_black_shaman.sql` | Timestamp-default alignment migration; applied |

Supporting regression improvements were also made to `vitest.config.ts`, `server/appointments.test.ts`, and `server/featureAccess.test.ts`. They serialize database-backed test files, allow an appropriate cold-database timeout, isolate appointment identifiers, restore feature-permission state after tests, and make bulk permission replacement transactional.

## 3. Database schema and applied migrations

The schema change preserves existing patient and appointment data while adding only the operational fields required by the external integration.

| Database object | Change | Purpose |
|---|---|---|
| `patients` | Added optional `age` and `normalizedContactNumber`; unique patient ID index | Supports accurate registration and lookup by normalized Indian mobile number, patient ID, or name |
| `appointments` | Added `checkedInAt` and `checkedInBy`; unique appointment ID index | Records an arrival/check-in event without granting access to clinical content |
| `enquiries` | New table | Stores source channel, optional source detail, preferred language, lifecycle state, patient/appointment links |
| `externalApiAuditLogs` | New table | Stores safe external-operation audit evidence without credentials or clinical content |
| `externalIdempotencyKeys` | New table | Stores idempotency reservations and completed redacted responses for 24-hour replay safety |
| `appointmentBookingLocks` | New table with unique consultant/date lock | Serializes booking and rescheduling conflict checks by consultant and clinic date |

Migration `0015_yummy_prodigy.sql` was applied before this final validation. Migration `0016_black_shaman.sql` was then applied successfully to align defaults for `externalApiAuditLogs.timestamp` and `externalIdempotencyKeys.createdAt` with the TypeScript schema.

## 4. Versioned endpoint inventory

| # | Method and path | Scope | Operation |
|---:|---|---|---|
| 1 | `GET /api/external/v1/health` | `health:read` | External service health check |
| 2 | `GET /api/external/v1/patients/search?query=` | `patients:read` | Search by normalized mobile number, patient ID, or name |
| 3 | `POST /api/external/v1/patients` | `patients:write` | Register a patient; optionally record an enquiry source |
| 4 | `GET /api/external/v1/consultants` | `consultants:read` | List active consultants |
| 5 | `GET /api/external/v1/consultants/:consultantId/slots?date=` | `appointments:read` | Read consultant slot availability |
| 6 | `POST /api/external/v1/appointments` | `appointments:write` | Create an appointment with idempotency and conflict protection |
| 7 | `GET /api/external/v1/appointments/:appointmentId` | `appointments:read` | Read a safe operational appointment view |
| 8 | `POST /api/external/v1/appointments/:appointmentId/reschedule` | `appointments:write` | Move an appointment after a protected conflict check |
| 9 | `POST /api/external/v1/appointments/:appointmentId/cancel` | `appointments:write` | Cancel an appointment and update linked enquiry lifecycle |
| 10 | `POST /api/external/v1/appointments/:appointmentId/check-in` | `appointments:write` | Record arrival/check-in attribution and time |
| 11 | `POST /api/external/v1/appointments/:appointmentId/complete` | `appointments:complete` | Mark OP completion under a separately authorized scope |
| 12 | `POST /api/external/v1/appointments/:appointmentId/no-show` | `appointments:write` | Mark no-show and update linked enquiry lifecycle |

Complete redacted request and response examples, including HMAC-signing instructions, are available in [`server/external/API_DOCS.md`](server/external/API_DOCS.md).

## 5. Authentication and authorization design

Every external request must send an HMAC key identifier, ISO timestamp, request ID, and HMAC-SHA256 signature. The signed payload binds the timestamp, request ID, upper-case HTTP method, request path, and exact raw JSON body. The server rejects missing credentials, unknown/inactive keys, invalid signatures, malformed/stale timestamps, and rate-limit breaches without disclosing whether a specific secret is valid.

| Control | Implementation |
|---|---|
| Key management | `EXTERNAL_API_HMAC_KEYS` JSON keyring with `active`, `secret`, and `scopes` fields per key |
| Signature verification | HMAC-SHA256 with `timingSafeEqual` constant-time comparison |
| Replay resistance | Five-minute timestamp tolerance and caller/server request ID correlation |
| Least privilege | Explicit per-key scopes; no default grant for completion |
| Rate limiting | In-memory allowance of 120 requests per service key/source IP per minute |
| Error handling | Uniform redacted errors with stable error codes and retryability signal |

The `appointments:complete` scope is deliberately distinct from ordinary appointment read/write scopes. A voice assistant cannot mark OP completion unless an administrator separately grants that permission to its HMAC key.

## 6. Audit logging, idempotency, and concurrency protection

External audit entries are created for successful actions, denied authentication/authorization attempts, idempotent replays, and unhandled errors. Each record stores a request identifier, service-key identifier, action, resource type/identifier, result, timestamp, and safe metadata. HMAC secrets, signatures, raw clinical content, notes, and transcripts are never recorded in the external audit table.

`POST /patients` and `POST /appointments` require an `Idempotency-Key`. The system first reserves the key, performs the operation, then records the redacted response for replay. Reuse with a different payload or service key returns `409 IDEMPOTENCY_CONFLICT`; an in-progress reservation returns a retryable `409 IDEMPOTENCY_IN_PROGRESS`.

Appointment creation and rescheduling protect active `Scheduled`/`Rescheduled` rows in a database transaction after acquiring a unique consultant/date booking lock. This prevents two concurrent external calls from both confirming overlapping appointment slots.

## 7. Automated test coverage

The new API test suite contains 12 focused cases and verifies the required security and workflow paths.

| Coverage area | Verified outcome |
|---|---|
| Authentication | Missing headers, invalid signature, and stale timestamp return secure `401` responses |
| Authorization | Missing scopes return `403`; completion remains blocked without `appointments:complete` |
| Rate limit | Exceeding the key/IP request allowance returns `429` |
| Patient lookup | Server-side patient search query is used for supported identifiers |
| Patient creation | Valid registration and idempotent replay run only one registration mutation |
| Idempotency safety | Same key with a different payload returns conflict |
| Availability | Active consultant availability returns slots; invalid date format is rejected |
| Booking race | Concurrent booking requests produce one success and one `SLOT_UNAVAILABLE` response |
| Lifecycle updates | Reschedule, cancellation, check-in, completion, and no-show are covered |
| Validation and audit | Invalid date/time is rejected and successful actions produce an external audit call |

Validation results were:

```text
pnpm vitest run server/external/api.test.ts
12 passed / 12 total

pnpm test
168 passed / 168 total across 19 test files

pnpm build
Passed
```

The production build completed successfully. Vite emitted a non-blocking bundle-size advisory for the existing client bundle; it did not affect build success or API behavior.

## 8. Environment-variable names and secret handling

No secret values are included in this report, API examples, tests, source code, or task output. The external API documentation provides a name-only configuration reference for:

| Variable | Use |
|---|---|
| `DATABASE_URL` | Database connection |
| `JWT_SECRET` | Server session signing |
| `VITE_APP_ID` | Client application identifier |
| `OAUTH_SERVER_URL` | OAuth service URL |
| `OWNER_OPEN_ID` | Owner identity reference |
| `BUILT_IN_FORGE_API_URL` | Server-side platform service URL |
| `BUILT_IN_FORGE_API_KEY` | Server-side platform service credential |
| `EXTERNAL_API_HMAC_KEYS` | External HMAC keyring |

The requested name-only environment reference is included in `server/external/API_DOCS.md`. A root `.env.example` file was not added because this managed project treats environment configuration as platform-managed secret data; actual values must be set through the project secrets interface rather than committed to source control.

## 9. Operational onboarding and known limitations

The existing configured HMAC key must be reviewed by an administrator before an external assistant is activated. In particular, add `health:read` if the integration needs health checks and `consultants:read` if it needs to list active consultants. Grant only the minimum required scope set, and do not grant `appointments:complete` unless OP-completion updates are explicitly approved.

This Phase A implementation intentionally has the following boundaries:

| Boundary | Current behavior |
|---|---|
| Follow-up instructions | Not exposed; returning clinical instructions would violate the non-clinical API boundary |
| Messages/calls | Not implemented; the API neither sends messages nor initiates calls |
| Rate-limit storage | In-memory per process; for multi-instance scaling, move counters to a shared store such as Redis |
| Key rotation | Supported operationally through multiple active keyring entries; no self-service rotation UI is included |
| External assistant connection | Not connected or deployed by this task |
| Clinical data | Explicitly excluded from routes, safe DTOs, audit metadata, and documentation examples |

## 10. Rollback procedure

No deployment was performed. If rollback is needed before publishing, use the project management version history to restore the checkpoint created for this implementation. That restores source code and project configuration to the selected checkpoint.

The schema migration is additive and preserves existing records. A database rollback should not be performed casually because removing the new tables/columns can delete integration audit and idempotency history. If a schema rollback is required, first export or archive relevant external audit and idempotency records, disable all external keys, and perform a reviewed database migration in a maintenance window.

## 11. Git working-tree summary

The tracked Phase A diff includes the external API router/middleware integration, database helpers/schema, migration journal, shared patient-registration service usage, test coverage, and test stability updates. The tracked diff summary recorded **431 insertions and 147 deletions across 14 tracked files**, with additional new untracked migration, snapshot, external API, service, and documentation files ready to be included in the checkpoint.

The working tree also contains earlier CMS changes unrelated to this Phase A work, including dashboard navigation, billing type alignment, OAuth/SDK timestamp typing, and daily export fixes. The checkpoint captures the complete current working state, so the precise file version can be reviewed and restored from project version history.

## 12. Deployment status

This task **did not publish or deploy** the application. The development server remains running and healthy for review. Publishing, custom-domain changes, and production activation remain user-controlled actions in the project management interface.
