# Integration Report: External Multilingual Clinic Voice Assistant for Deepthis Ortho Clinic

This integration report provides a comprehensive technical blueprint for connecting an external multilingual Clinic Voice Assistant (supporting English, Hindi, Telugu, and code-mixed speech) to the existing Clinic Management System (CMS) for Deepthis Ortho Clinic. 

Per instructions, **no code, database schemas, deployment configurations, or environment variables have been altered or exposed**. All findings are based strictly on static inspection of the codebase.

---

## 1. Frontend Framework and Version
- **Framework**: React 19 (`react: ^19.2.1`, `react-dom: ^19.2.1`) [1]
- **Routing**: Wouter 3 (`wouter: ^3.3.5`) [1]
- **State Management & API Client**: tRPC 11 client (`@trpc/client`, `@trpc/react-query`) with TanStack React Query (`@tanstack/react-query: ^5.90.2`) [1]
- **UI Styling**: Tailwind CSS 4 (`tailwindcss: ^4.1.14`) with Radix UI primitives [1]

## 2. Backend Framework
- **Runtime**: Node.js 22 with ES Modules (`"type": "module"`) [1]
- **Server Framework**: Express 4 (`express: ^4.21.2`) [1]
- **API Architecture**: tRPC 11 server (`@trpc/server`) mounted under `/api/trpc` with Superjson serialization [1]
- **Authentication/Session**: Custom credential-based authentication (`bcrypt`, `jose`) combined with Manus SDK session cookies (`JWT_SECRET`) [1]

## 3. Database Provider
- **Database**: MySQL / TiDB accessed via Drizzle ORM (`drizzle-orm: ^0.44.5`, `mysql2: ^3.15.0`) [1]
- **Connection**: Managed via `DATABASE_URL` environment variable [1]

## 4. Authentication System
- **Internal CMS Users**: Credential-based login (email/username + password hashed with `bcrypt`) supporting roles: `admin`, `consultant`, `staff`, `user` [1]
- **Session Handling**: JWT-signed session cookies managed via `sdk.createSessionToken()` and `getSessionCookieOptions()` [1]
- **External Assistant Security**: Because internal tRPC procedures rely on cookie-based session contexts (`ctx.user`), an external voice assistant service cannot directly authenticate via browser cookies without a dedicated API gateway token or API key authentication middleware [1].

## 5. Patient Table / Schema (`patients`)
Defined in `drizzle/schema.ts` [1]:
- `patientId`: `varchar(50)` (Primary identifier, e.g., daily sequence-based OP ID)
- `firstName`: `varchar(100)` (Not null)
- `lastName`: `varchar(100)` (Not null)
- `dateOfBirth`: `varchar(10)` (Nullable)
- `gender`: `varchar(20)` (Nullable)
- `contactNumber`: `varchar(20)` (Not null)
- `email`: `varchar(255)` (Nullable)
- `address`: `text()` (Nullable)
- `barcodeData`: `varchar(255)` (Indexed for barcode/QR tracking)
- `barcodeImageUrl`, `barcodeImageKey`: Cloud storage references
- `qrcodeImageUrl`, `qrcodeImageKey`: Cloud storage references
- `createdAt`, `updatedAt`: Timestamps

## 6. Appointment Table / Schema (`appointments`)
Defined in `drizzle/schema.ts` [1]:
- `appointmentId`: `varchar(50)` (Not null)
- `patientId`: `varchar(50)` (Not null)
- `consultantId`: `int()` (Not null, referencing doctors/users)
- `appointmentDate`: `varchar(10)` (Format: `YYYY-MM-DD`)
- `appointmentTime`: `varchar(5)` (Format: `HH:MM`)
- `duration`: `int()` (Default: 30 minutes)
- `status`: `mysqlEnum` (`'Scheduled'`, `'Completed'`, `'Cancelled'`, `'No-show'`, `'Rescheduled'`)
- `notes`: `text()` (Nullable)
- `reminderSent`, `reminderSentAt`, `notificationMethod`
- `createdAt`, `updatedAt`: Timestamps

## 7. Doctor Availability Table / Schema (`consultantAvailability`)
Defined in `drizzle/schema.ts` [1]:
- `availabilityId`: `varchar(50)` (Not null)
- `consultantId`: `int()` (Not null)
- `dayOfWeek`: `int()` (0 = Sunday, 1 = Monday, etc.)
- `startTime`: `varchar(5)` (Format: `HH:MM`)
- `endTime`: `varchar(5)` (Format: `HH:MM`)
- `slotDuration`: `int()` (Default: 30 minutes)
- `maxAppointmentsPerDay`: `int()` (Default: 10)
- `isActive`: `tinyint(1)` (Default: 1)
- `createdAt`, `updatedAt`: Timestamps

## 8. Follow-up and OP-Status Fields
- **Follow-up Instructions**: Stored within the `consultations` table (`treatmentPlan`, `advisedInvestigations`, `clinicalHistory`, `presentComplaints`, `isFinalized`) [1]. There is no separate structured follow-up scheduling table; instructions are embedded in consultation notes.
- **OP Status / Appointment Status**: Stored in `appointments.status` (`'Scheduled'`, `'Completed'`, `'Cancelled'`, `'No-show'`, `'Rescheduled'`) [1]. **Note:** There is currently no distinct `'Arrived'` or `'Checked-in'` status enum value in `appointments.status`.

## 9. Existing API Routes
- **Protocol**: tRPC endpoints under `/api/trpc` (e.g., `patients.search`, `patients.register`, `appointments.list`, `appointments.create`, `appointments.reschedule`, `appointments.cancel`, `appointments.complete`, `appointments.markNoShow`, `appointments.getAvailableSlots`, `consultants.getAll`) [1].
- **REST Endpoints**: None exposed out of the box for public or external programmatic integration; all routing goes through tRPC context handlers [1].

## 10. Existing Webhook Support
- **Webhooks**: There are **no inbound webhook receivers** or subscription webhook dispatchers in the codebase. Notifications are sent internally via `notifyOwner()` (Telegram/system notifier) [1].

---

## 11. Secure Methods for External Application Operations

To enable the external voice assistant to perform clinic operations securely, standard RESTful API endpoints protected by an `x-api-key` header (or dedicated JWT Bearer token) should be added to Express. Below is how each required operation maps:

1. **Search for a Patient**:
   - *Current tRPC*: `patients.search({ query })` [1]
   - *Secure REST equivalent*: `GET /api/external/patients?search=<phone_or_name>`
2. **Create a Patient**:
   - *Current tRPC*: `patients.register({ firstName, lastName, age, gender, contactNumber, email, address, consultantName })` [1]
   - *Secure REST equivalent*: `POST /api/external/patients`
3. **Read Available Slots**:
   - *Current tRPC*: `appointments.getAvailableSlots({ consultantId, date })` [1]
   - *Secure REST equivalent*: `GET /api/external/consultants/{consultantId}/slots?date=YYYY-MM-DD`
4. **Create an Appointment**:
   - *Current tRPC*: `appointments.create({ patientId, consultantId, appointmentDate, appointmentTime, notes })` [1]
   - *Secure REST equivalent*: `POST /api/external/appointments`
5. **Reschedule or Cancel an Appointment**:
   - *Current tRPC*: `appointments.reschedule({ appointmentId, newDate, newTime })` / `appointments.cancel({ appointmentId, reason })` [1]
   - *Secure REST equivalent*: `PUT /api/external/appointments/{appointmentId}/reschedule` and `PUT /api/external/appointments/{appointmentId}/cancel`
6. **Update Arrived, No-Show, and OP-Completed Status**:
   - *Current tRPC*: `appointments.complete`, `appointments.markNoShow` [1]
   - *Secure REST equivalent*: `PUT /api/external/appointments/{appointmentId}/status` (accepting body `{ status: "Arrived" | "No-show" | "Completed" }`)
7. **Save the Enquiry Source**:
   - *Current Gap*: No enquiry source column exists in schema.
   - *Secure REST equivalent*: `POST /api/external/enquiries` (once schema is updated)
8. **Read Doctor-Approved Follow-up Instructions**:
   - *Current tRPC*: `consultations.getByPatientId` or custom query [1]
   - *Secure REST equivalent*: `GET /api/external/patients/{patientId}/followups`

## 12. Hosting and Deployment Platform
- **Hosting**: Built-in Manus Autoscale/Reserved hosting infrastructure (Cloud / PaaS environment with automated container deployments) [1].
- **Custom Domain Bindings**: Configured on Manus domains (`clinic-cms-47itftjn.manus.space`, `docm-clinic-cms.manus.space`) [1].

## 13. Required Environment-Variable Names (Secret Values Omitted)
- `DATABASE_URL`: Connection string for MySQL / TiDB database [1]
- `JWT_SECRET`: Secret key for session signing and token verification [1]
- `VITE_APP_ID`: Application client ID [1]
- `OAUTH_SERVER_URL`: OAuth portal base URL [1]
- `OWNER_OPEN_ID`: System owner identifier [1]
- `BUILT_IN_FORGE_API_URL`: Manus built-in platform services URL [1]
- `BUILT_IN_FORGE_API_KEY`: Server-side API key for platform services [1]
- **Recommended New Variable**: `EXTERNAL_API_KEY` (Secret token for authenticating external voice assistant HTTP requests) [1]

## 14. Recommended Integration Architecture for the Voice Assistant
```
[ Multilingual Voice AI Gateway (English / Hindi / Telugu / Code-mixed) ]
                           │
                           │  HTTPS + x-api-key Authentication
                           ▼
          [ New Express External REST Bridge ] (mounted at /api/external/*)
                           │
                           │  Internal DB helpers & Drizzle ORM
                           ▼
                 [ MySQL / TiDB Database ]
                           │
                           │  WebSocket / Polling / Dashboard State
                           ▼
             [ Doctor & Staff Web Dashboard ] (Real-time UI updates)
```

## 15. Missing Fields or APIs That Must Be Added
1. **API Gateway / REST Endpoints**: Add a dedicated Express router (`/api/external/...`) secured by API key authentication, as tRPC cookie sessions are ill-suited for third-party server-to-server integrations.
2. **Enquiry Source Tracking**: Add an `enquirySource` column (or table) linked to patient intake to record where the patient came from (e.g., Voice Assistant, Phone, WhatsApp, Walk-in).
3. **Arrived / Checked-in Status**: Extend the `appointments.status` MySQL enum to include `'Arrived'` alongside `'Scheduled'`, `'Completed'`, `'Cancelled'`, `'No-show'`, and `'Rescheduled'`.
4. **Structured Follow-up Endpoint**: Create a dedicated API route to fetch finalized treatment plans and follow-up dates directly by patient ID, avoiding raw audio transcription dumps.

---
References:
- [1] Deepthis Ortho Clinic CMS Codebase (`/home/ubuntu/clinic-cms/package.json`, `drizzle/schema.ts`, `server/routers.ts`, `server/db.ts`)
