# Deepthis Ortho Clinic CMS — Phase A External API Final Report

**Status:** Complete and validated. **No deployment was performed. No external service was connected. No secrets are exposed.**  
**Checkpoint:** `f6e45a2a`  
**Repository/schema conflict check:** No material conflict with the earlier integration report was found. One database compatibility issue occurred during the added purchase-order history migration: a string timestamp default was rejected and was corrected to `DEFAULT (now())` before successful application.

## 1. Files changed

| File or area | Change |
|---|---|
| `server/external/router.ts` | Added the versioned Express router, HMAC middleware, scope checks, rate limiting, idempotency, audit logging, and safe operational responses. |
| `server/external/security.ts` | Added HMAC keyring parsing, scope definitions, HMAC-SHA256 signing, and constant-time signature comparison. |
| `server/external/validation.ts` | Added Indian mobile normalization, strict date/time validation, language-code validation, canonical request hashing, and Asia/Kolkata utilities. |
| `server/external/api.test.ts` | Added 12 API tests for authentication, authorization, rate limiting, patients, idempotency, availability, booking conflicts, appointment lifecycle, validation, and audit logging. |
| `server/external/security.test.ts` | Added keyring configuration validation. |
| `server/external/API_DOCS.md` | Added redacted API documentation and examples for all endpoints. |
| `server/services/patientRegistration.ts` | Added shared patient-registration logic used by internal CMS and external API flows. |
| `server/_core/index.ts` | Mounted `/api/external/v1` and captured the raw body for HMAC verification. |
| `server/db.ts` | Added external API database helpers, patient search improvements, enquiries, audit/idempotency helpers, booking locks, safe appointment creation, check-in, rescheduling, and purchase-order history helpers. |
| `server/routers.ts` | Reused the shared registration service and added protected purchase-order history query/event procedures. |
| `drizzle/schema.ts` | Added external API fields/tables and `purchaseOrderHistory`. |
| `drizzle/0015_yummy_prodigy.sql` | Main Phase A migration. |
| `drizzle/0016_black_shaman.sql` | External timestamp-default alignment migration. |
| `drizzle/0017_soft_the_hand.sql` | Purchase-order history migration, applied in corrected form. |
| `drizzle/0018_uneven_callisto.sql` | Generated follow-up migration; empty after the corrected schema was applied. |
| `server/poHistory.test.ts` | Added purchase-order history persistence coverage. |
| `client/src/pages/PurchaseOrders.tsx` | Added purchase-order history timeline UI and OCR correction-review persistence. |
| `vitest.config.ts`, `server/appointments.test.ts`, `server/featureAccess.test.ts` | Improved database-backed test serialization and isolation. |
| `todo.md` | Marked all tracked tasks complete. |

Earlier CMS work remains in the repository, including dashboard UX, role-based feature access, custom staff/consultant authentication, billing, pharmacy, PO scanning, and appointment scheduling.

## 2. Schema changes

| Table/object | Change | Purpose |
|---|---|---|
| `patients` | Added optional `age` and `normalizedContactNumber`; added patient-ID and normalized-contact indexes. | Search by normalized Indian mobile number, patient ID, or name. |
| `appointments` | Added `checkedInAt` and `checkedInBy`; added a unique appointment-ID index. | Record patient arrival/check-in without clinical content. |
| `enquiries` | New table for source channel, source detail, preferred language, lifecycle stage, patient, and appointment links. | Record administrative enquiry origin and lifecycle. |
| `externalApiAuditLogs` | New table for request, service-key, action, resource, result, safe metadata, and timestamp. | Record external API security/mutation evidence. |
| `externalIdempotencyKeys` | New table for operation, caller key, request hash, service key, response, resource, and expiry. | Prevent duplicate patient/appointment mutations. |
| `appointmentBookingLocks` | New table with a unique consultant/date key. | Serialize booking and rescheduling conflict checks. |
| `purchaseOrderHistory` | New table for PO event type, actor, summary, details, and timestamp. | Record PO creation, approval, rejection, payment updates, and OCR correction review. |

The external API response model does not expose consultation notes, prescriptions, treatment plans, diagnoses, clinical advice, billing, uploaded files, audio, or transcripts.

## 3. Migration generated

| Migration | Status |
|---|---|
| `0015_yummy_prodigy.sql` | Generated and applied. Added the Phase A external API schema. |
| `0016_black_shaman.sql` | Generated and applied. Aligned external audit/idempotency timestamp defaults. |
| `0017_soft_the_hand.sql` | Generated and applied in corrected form. Created `purchaseOrderHistory` and its lookup index. The generated string timestamp default was changed to `DEFAULT (now())` after the database rejected the original default. |
| `0018_uneven_callisto.sql` | Generated but empty; no additional SQL was required after the corrected `0017` migration. |

All schema changes are additive. No existing patient or appointment data was intentionally deleted.

## 4. Endpoints added

All routes are mounted under `/api/external/v1`.

| Method and path | Required scope | Purpose |
|---|---|---|
| `GET /health` | `health:read` | Health check. |
| `GET /patients/search?query=` | `patients:read` | Search by normalized mobile number, patient ID, or name. |
| `POST /patients` | `patients:write` | Register a patient and optionally save enquiry source/language; requires idempotency. |
| `GET /consultants` | `consultants:read` | List active consultants. |
| `GET /consultants/:consultantId/slots?date=` | `appointments:read` | Read available slots. |
| `POST /appointments` | `appointments:write` | Create an appointment with idempotency and conflict protection. |
| `GET /appointments/:appointmentId` | `appointments:read` | Read a safe operational appointment view. |
| `POST /appointments/:appointmentId/reschedule` | `appointments:write` | Reschedule after conflict verification. |
| `POST /appointments/:appointmentId/cancel` | `appointments:write` | Cancel an appointment and update enquiry lifecycle. |
| `POST /appointments/:appointmentId/check-in` | `appointments:write` | Record arrival/check-in. |
| `POST /appointments/:appointmentId/complete` | `appointments:complete` | Mark OP completion under a separately authorized scope. |
| `POST /appointments/:appointmentId/no-show` | `appointments:write` | Mark no-show and update enquiry lifecycle. |

The external API does not expose clinical notes, prescriptions, treatment plans, clinical advice, billing, files, audio, or transcripts. It does not send messages or initiate calls.

## 5. Authentication design

The API uses server-to-server HMAC-SHA256 authentication. Each request requires:

```text
x-external-key-id
x-external-timestamp
x-request-id
x-external-signature
```

The signature is calculated over the exact payload:

```text
timestamp.requestId.METHOD.path.rawBody
```

`METHOD` is uppercase, `path` is the versioned external path, and `rawBody` is the exact JSON sent over the wire; bodyless requests use `{}`. The server captures the raw request body before JSON parsing.

Security controls include a JSON HMAC keyring, constant-time signature comparison, five-minute timestamp tolerance, request correlation, inactive/unknown-key rejection, redacted errors, and a rate limit of 120 requests per service key/source IP per minute in the current implementation.

## 6. Authorization scopes

| Scope | Permitted operations |
|---|---|
| `health:read` | Health check. |
| `patients:read` | Patient search. |
| `patients:write` | Patient creation and enquiry capture. |
| `consultants:read` | Active consultant listing. |
| `appointments:read` | Slot availability and safe appointment retrieval. |
| `appointments:write` | Appointment creation, rescheduling, cancellation, check-in, and no-show. |
| `appointments:complete` | OP-completion status only. |

`appointments:complete` is deliberately separate from `appointments:write`. A scheduling key cannot mark an appointment complete unless an administrator separately grants that scope. The configured keyring should be reviewed before activation to ensure it includes `health:read` and `consultants:read` when those operations are required.

## 7. Audit and idempotency design

External audit records are created for successful operations, denied authentication/authorization attempts, idempotent replays, and unhandled errors. Records contain request ID, service-key ID, action, resource metadata, result, timestamp, and safe metadata only. Secrets, signatures, clinical content, notes, prescriptions, treatment plans, and transcripts are not stored in external audit records.

`POST /patients` and `POST /appointments` require `Idempotency-Key`. The server stores a request hash and service-key ID before mutation. An identical retry returns the stored redacted response. Reuse with a different body or service key returns `409 IDEMPOTENCY_CONFLICT`; a matching request still processing returns retryable `409 IDEMPOTENCY_IN_PROGRESS`.

Appointment creation and rescheduling use a unique consultant/date lock and transaction-safe active-slot conflict checking, preventing simultaneous callers from both booking an overlapping slot.

The internal `purchaseOrderHistory` table separately records PO creation, approval, rejection, payment-status changes, and OCR correction review. Its protected query is internal to the CMS and is not exposed through the external voice-assistant API.

## 8. Test results

| Validation | Result |
|---|---|
| External API suite | 12/12 passed. |
| External security test | Passed. |
| Purchase-order history persistence test | 1/1 passed. |
| Full regression: `pnpm test` | **169/169 tests passed across 20 test files.** |
| TypeScript: `pnpm check` | Passed with no TypeScript errors. |
| Development health check | Server running; dependencies OK; LSP and TypeScript report no errors. |

Coverage includes missing/invalid authentication, stale timestamps, authorization scopes, rate limiting, patient search, patient idempotency, slot retrieval, appointment creation, simultaneous double-booking prevention, rescheduling, cancellation, check-in, completion authorization, no-show, invalid date/time, external audit creation, and PO history persistence.

## 9. Build result

`pnpm build` passed successfully. Both the Vite client build and server esbuild bundle completed without errors.

The build emitted a non-blocking warning that some client chunks exceed 500 kB after minification. This is an optimization warning, not a build failure.

## 10. Known limitations

| Limitation | Current behavior |
|---|---|
| Follow-up instructions | Not exposed because they may contain clinical guidance. |
| Clinical data | Notes, prescriptions, diagnoses, treatment plans, advice, audio, transcripts, billing, and files are excluded. |
| Messages/calls | Not implemented; the API neither sends messages nor initiates calls. |
| Rate-limit storage | Process-local in memory; a shared store is recommended for multi-instance hosting. |
| Key rotation UI | Multiple active key entries are supported, but there is no self-service rotation interface. |
| External connection | No voice assistant, webhook, third-party API, or connector was connected. |
| Deployment | No automatic deployment or publishing was performed. |
| PO history backfill | Existing PO approval actions before this migration were not backfilled; new events are recorded going forward. |
| Migration `0018` | Empty because the corrected `0017` migration was applied successfully. |

The repository and schema did not materially conflict with the earlier integration report. The earlier report’s recommendations for a secured REST layer, enquiry tracking, check-in support, and a controlled external boundary were implemented.

## 11. Required environment-variable names, without values

| Variable name | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/TiDB database connection. |
| `JWT_SECRET` | Server-side session signing secret. |
| `VITE_APP_ID` | Application identifier. |
| `OAUTH_SERVER_URL` | OAuth service URL. |
| `OWNER_OPEN_ID` | Project owner identity reference. |
| `BUILT_IN_FORGE_API_URL` | Server-side platform services URL. |
| `BUILT_IN_FORGE_API_KEY` | Server-side platform services credential. |
| `EXTERNAL_API_HMAC_KEYS` | External HMAC keyring containing key IDs, secrets, active flags, and scopes. |

Only variable names are included. Actual values remain in managed secret configuration and are not exposed.

## 12. Rollback procedure

No deployment was performed. For source/configuration rollback, restore checkpoint `f6e45a2a` through project version history. The previous Phase A-only checkpoint is `0082e9ac`.

For a database rollback:

1. Disable external HMAC keys through managed secret configuration.
2. Stop external callers from using `/api/external/v1`.
3. Export or archive `externalApiAuditLogs`, `externalIdempotencyKeys`, `enquiries`, `appointmentBookingLocks`, and `purchaseOrderHistory` if retention is required.
4. Review reverse-migration dependencies and data-loss risk.
5. Apply a reviewed reverse migration during a maintenance window; do not drop integration tables casually.
6. Re-run `pnpm check`, `pnpm test`, and `pnpm build` after rollback.

Because the application was not published, no live production rollback is required for this task.

## 13. Git diff summary

The repository contains the external API implementation, migration metadata, purchase-order history enhancement, documentation, tests, and earlier CMS changes.

The Phase A implementation diff was recorded as **431 insertions and 147 deletions across 14 tracked files**, with additional new external API, service, migration, and documentation files. The final state additionally includes the `purchaseOrderHistory` schema/migration, PO history database helpers, router procedures, Purchase Orders timeline UI, and `poHistory.test.ts`.

| Category | Summary |
|---|---|
| External API | Versioned router, HMAC security, validation, scopes, idempotency, rate limiting, and tests. |
| Database | Enquiries, external audit/idempotency records, booking locks, patient/appointment fields, and PO history. |
| Internal workflows | Shared registration, safe booking/rescheduling, check-in, PO event recording, and protected history retrieval. |
| UI | Purchase-order history timeline and OCR correction-review recording. |
| Quality | 169/169 tests passed, TypeScript check passed, and production build passed. |
| Security | No secret values, external connectors, or external service integrations added. |

**No deployment was performed automatically.**

### Repository references

[1]: server/external/router.ts "External API router"
[2]: server/external/security.ts "External API security"
[3]: server/external/validation.ts "External API validation"
[4]: drizzle/schema.ts "Database schema"
[5]: server/external/API_DOCS.md "External API documentation"
[6]: server/poHistory.test.ts "Purchase-order history test"
