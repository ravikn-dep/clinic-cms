# Deepthis Ortho Clinic External API — Version 1

This document defines the server-to-server REST contract for an approved external multilingual Clinic Voice Assistant. The API is deliberately limited to **administrative patient and appointment operations**. It never returns consultation notes, prescriptions, diagnoses, treatment plans, clinical advice, audio transcripts, billing details, or uploaded files.

> **Production-use requirement.** The external service must keep its HMAC secret solely in its server-side secret store. It must never embed the secret in a web page, mobile application, voice client, log entry, prompt, or recording.

## Base URL and data handling

Use the clinic deployment origin followed by the versioned prefix:

```text
https://<clinic-domain>/api/external/v1
```

All dates use `YYYY-MM-DD`. Appointment times use a 24-hour `HH:MM` format and represent the clinic's `Asia/Kolkata` operating context. The API accepts patient contact numbers only after they can be normalized as a valid 10-digit Indian mobile number beginning with `6`, `7`, `8`, or `9`.

| Item | Contract |
|---|---|
| Content type | `application/json` for all bodies and responses |
| Request correlation | Include `x-request-id` with 8–64 URL-safe characters; otherwise the API creates one |
| Authentication | HMAC-SHA256 server-to-server signature described below |
| Replay resistance | A timestamp is accepted only within five minutes of server time |
| Rate limit | 120 authenticated requests per service key and source IP per minute |
| Safe response policy | The API exposes only operational metadata needed for patient intake and appointments |

## HMAC authentication

Every request requires these headers. The HMAC key identifier and secret are provisioned separately by the clinic administrator; this document intentionally contains no real key material.

```http
x-external-key-id: <provisioned-key-id>
x-external-timestamp: 2026-08-12T08:30:00.000Z
x-request-id: va-20260812-000001
x-external-signature: <lowercase-hex-hmac-sha256>
```

Create the signature from this exact dot-delimited string, where `rawBody` is the exact JSON string transmitted on the wire (use `{}` for a request without a body):

```text
timestamp.requestId.METHOD./api/external/v1/path.rawBody
```

For example, for a health request, sign:

```text
2026-08-12T08:30:00.000Z.va-20260812-000001.GET./api/external/v1/health.{}
```

The API compares the supplied and expected signature using constant-time comparison. Missing headers, unknown/inactive keys, malformed signatures, and stale timestamps are rejected without revealing key details.

| HTTP status | Error code | Meaning |
|---:|---|---|
| 401 | `AUTH_REQUIRED` | One or more authentication headers are absent |
| 401 | `AUTH_INVALID` | The key is inactive/unknown or the signature does not validate |
| 401 | `AUTH_STALE` | Timestamp is malformed or outside the five-minute window |
| 403 | `SCOPE_FORBIDDEN` | The service key lacks the route's required scope |
| 400 | `VALIDATION_ERROR` | A supplied field has an invalid operational format |
| 404 | `NOT_FOUND` | The requested patient, appointment, or consultant does not exist |
| 409 | `SLOT_UNAVAILABLE` | The appointment slot is already held or booked |
| 409 | `IDEMPOTENCY_CONFLICT` | An idempotency key is being reused for a different request |
| 429 | `RATE_LIMITED` | The configured per-minute request allowance was exceeded |

All errors use this redacted envelope:

```json
{
  "requestId": "va-20260812-000001",
  "error": {
    "code": "SCOPE_FORBIDDEN",
    "message": "The external service is not authorized for this operation.",
    "retryable": false
  }
}
```

## Scopes and endpoint matrix

Administrators grant scopes per external HMAC key. The completion route is deliberately isolated behind `appointments:complete`; a normal scheduling key must not receive that authority.

| # | Method and path | Required scope | Purpose |
|---:|---|---|---|
| 1 | `GET /health` | `health:read` | Verify availability of the versioned integration service |
| 2 | `GET /patients/search` | `patients:read` | Find a patient by normalized mobile number, patient ID, or name |
| 3 | `POST /patients` | `patients:write` | Register a patient and optionally record an enquiry source |
| 4 | `GET /consultants` | `consultants:read` | List active consultants only |
| 5 | `GET /consultants/:consultantId/slots` | `appointments:read` | Read available slots for an active consultant and date |
| 6 | `POST /appointments` | `appointments:write` | Create an appointment with idempotency and conflict protection |
| 7 | `GET /appointments/:appointmentId` | `appointments:read` | Read safe operational appointment state |
| 8 | `POST /appointments/:appointmentId/reschedule` | `appointments:write` | Move an appointment after conflict verification |
| 9 | `POST /appointments/:appointmentId/cancel` | `appointments:write` | Cancel an appointment and update its enquiry lifecycle |
| 10 | `POST /appointments/:appointmentId/check-in` | `appointments:write` | Record patient arrival/check-in |
| 11 | `POST /appointments/:appointmentId/complete` | `appointments:complete` | Record OP completion under separately authorized scope |
| 12 | `POST /appointments/:appointmentId/no-show` | `appointments:write` | Record a no-show and update enquiry lifecycle |

## Endpoint examples

The examples omit repeated HMAC headers for readability. Substitute the headers described above on every request and do not copy the redacted identifiers into production.

### 1. Health check

```http
GET /api/external/v1/health
```

```json
{
  "requestId": "va-20260812-000001",
  "service": "clinic-external-api",
  "version": "v1",
  "status": "ok"
}
```

### 2. Patient search

Search supports a normalized Indian mobile number, clinic patient ID, or patient name.

```http
GET /api/external/v1/patients/search?query=9876543210
```

```json
{
  "requestId": "va-20260812-000002",
  "patients": [
    {
      "patientId": "DOCM-REDACTED-OP001",
      "firstName": "Anita",
      "lastName": "R.",
      "contactNumber": "+91••••••3210",
      "age": 42
    }
  ]
}
```

### 3. Create patient and optionally record enquiry source

This request requires `Idempotency-Key`, a unique caller-generated value retained for at least 24 hours. The same key with an identical request safely replays the original response; the same key with a different request returns `409 IDEMPOTENCY_CONFLICT`.

```http
POST /api/external/v1/patients
Idempotency-Key: patient-intake-20260812-0001

{
  "firstName": "Anita",
  "lastName": "Rao",
  "age": 42,
  "gender": "Female",
  "contactNumber": "9876543210",
  "email": "anita@example.invalid",
  "address": "Redacted locality, Hyderabad",
  "enquiry": {
    "channel": "VOICE",
    "sourceDetail": "multilingual-voice-assistant",
    "preferredLanguage": "te-IN"
  }
}
```

```json
{
  "requestId": "va-20260812-000003",
  "patient": {
    "patientId": "DOCM-REDACTED-OP001",
    "firstName": "Anita",
    "lastName": "Rao",
    "contactNumber": "+91••••••3210"
  },
  "enquiryId": "ENQ-REDACTED"
}
```

Accepted enquiry channels are `VOICE`, `WHATSAPP`, `PHONE`, `WALK_IN`, `WEBSITE`, `GOOGLE`, `INSTAGRAM`, `REFERRAL`, and `OTHER`. Accepted preferred-language values are `en-IN`, `hi-IN`, `te-IN`, and `mixed`.

### 4. List active consultants

```http
GET /api/external/v1/consultants
```

```json
{
  "requestId": "va-20260812-000004",
  "consultants": [
    {
      "id": 7,
      "name": "Dr. R.••••••",
      "role": "consultant"
    }
  ]
}
```

### 5. Read consultant availability

```http
GET /api/external/v1/consultants/7/slots?date=2026-08-13
```

```json
{
  "requestId": "va-20260812-000005",
  "consultantId": 7,
  "date": "2026-08-13",
  "timezone": "Asia/Kolkata",
  "slots": ["09:00", "09:30", "10:30"]
}
```

### 6. Create appointment

This request requires `Idempotency-Key`. The server atomically protects the requested consultant/date slot; callers must treat `409 SLOT_UNAVAILABLE` as a prompt to read current availability again.

```http
POST /api/external/v1/appointments
Idempotency-Key: appointment-20260812-0001

{
  "patientId": "DOCM-REDACTED-OP001",
  "consultantId": 7,
  "appointmentDate": "2026-08-13",
  "appointmentTime": "10:00",
  "duration": 30,
  "notes": "Administrative booking request only",
  "enquiryId": "ENQ-REDACTED"
}
```

```json
{
  "requestId": "va-20260812-000006",
  "appointment": {
    "appointmentId": "APT-REDACTED",
    "patientId": "DOCM-REDACTED-OP001",
    "consultantId": 7,
    "appointmentDate": "2026-08-13",
    "appointmentTime": "10:00",
    "duration": 30,
    "status": "Scheduled",
    "checkedInAt": null
  }
}
```

### 7. Read appointment status

```http
GET /api/external/v1/appointments/APT-REDACTED
```

```json
{
  "requestId": "va-20260812-000007",
  "appointment": {
    "appointmentId": "APT-REDACTED",
    "patientId": "DOCM-REDACTED-OP001",
    "consultantId": 7,
    "appointmentDate": "2026-08-13",
    "appointmentTime": "10:00",
    "duration": 30,
    "status": "Scheduled",
    "checkedInAt": null
  }
}
```

### 8. Reschedule appointment

```http
POST /api/external/v1/appointments/APT-REDACTED/reschedule

{
  "appointmentDate": "2026-08-14",
  "appointmentTime": "11:30"
}
```

```json
{
  "requestId": "va-20260812-000008",
  "appointment": {
    "appointmentId": "APT-REDACTED",
    "appointmentDate": "2026-08-14",
    "appointmentTime": "11:30",
    "status": "Rescheduled"
  }
}
```

### 9. Cancel appointment

```http
POST /api/external/v1/appointments/APT-REDACTED/cancel
{}
```

```json
{
  "requestId": "va-20260812-000009",
  "appointmentId": "APT-REDACTED",
  "status": "Cancelled"
}
```

### 10. Record check-in

```http
POST /api/external/v1/appointments/APT-REDACTED/check-in
{}
```

```json
{
  "requestId": "va-20260812-000010",
  "appointment": {
    "appointmentId": "APT-REDACTED",
    "status": "Scheduled",
    "checkedInAt": "2026-08-13T04:35:00.000Z"
  }
}
```

### 11. Record OP completion

Only a key explicitly granted `appointments:complete` may call this route. Scheduling keys without this scope receive `403 SCOPE_FORBIDDEN`.

```http
POST /api/external/v1/appointments/APT-REDACTED/complete
{}
```

```json
{
  "requestId": "va-20260812-000011",
  "appointmentId": "APT-REDACTED",
  "status": "Completed"
}
```

### 12. Record no-show

```http
POST /api/external/v1/appointments/APT-REDACTED/no-show
{}
```

```json
{
  "requestId": "va-20260812-000012",
  "appointmentId": "APT-REDACTED",
  "status": "No-show"
}
```

## Idempotency, auditing, and operational boundaries

The API records an external audit entry for successful, denied, failed, and idempotent replay outcomes. The audit record contains an external request identifier, service key identifier, resource/action metadata, result, and safe metadata only. It does not store an HMAC secret, raw signature, clinical note, transcript, prescription, or treatment-plan content.

Patient creation and appointment creation reserve an idempotency record before performing the mutation. The reservation is completed with the redacted response after success and removed on failure, allowing a genuine retry. Appointment booking uses a transactional consultant/date lock plus conflict verification so two simultaneous callers cannot both secure the same slot.

| Allowed | Explicitly excluded |
|---|---|
| Patient lookup, patient registration, consultant availability, appointment booking/status updates, enquiry source/lifecycle | Consultation notes, clinical history, diagnoses, prescriptions, investigations, treatment plans, follow-up instructions, billing, uploaded records, messages, phone calls, and patient-facing notifications |

## Environment configuration

Populate real values only through the deployment secret-management interface. The external integration requires `EXTERNAL_API_HMAC_KEYS` as a JSON keyring with active keys, sufficiently long secrets, and the least-privilege scope list assigned by a clinic administrator. The secret itself must never be committed or documented.

| Variable name | Purpose |
|---|---|
| `DATABASE_URL` | Database connection managed by the deployment environment |
| `JWT_SECRET` | Server-side session signing secret |
| `VITE_APP_ID` | Client application identifier |
| `OAUTH_SERVER_URL` | Platform OAuth service URL |
| `OWNER_OPEN_ID` | Project owner identity reference |
| `BUILT_IN_FORGE_API_URL` | Server-side platform services base URL |
| `BUILT_IN_FORGE_API_KEY` | Server-side platform services credential |
| `EXTERNAL_API_HMAC_KEYS` | External voice-assistant HMAC keyring |

Example **shape only** — the values below are placeholders and must not be deployed:

```json
{
  "voice-assistant-key": {
    "secret": "<server-side-secret-at-least-32-characters>",
    "active": true,
    "scopes": [
      "health:read",
      "patients:read",
      "patients:write",
      "consultants:read",
      "appointments:read",
      "appointments:write"
    ]
  }
}
```

Grant `appointments:complete` only when the external service has been separately approved to record OP completion. Do not make it a default scheduling scope.
