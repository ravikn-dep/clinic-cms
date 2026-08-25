# Phase 4 Step 2 — Unified Consultant Visit / Appointment Workflow

**Classification:** `PHASE4_STEP2_UNIFIED_CONSULTANT_VISIT_IMPLEMENTED_LOCAL_VALIDATED`

This report records the local, isolated implementation and validation of a consultant-centric front-desk workflow. The worktree began at canonical `github/main` commit `a679dd189b6df826b03bc35a6acf56d12e8342ef` on branch `feature/phase4-unified-consultant-visit`. No commit, push, pull request, merge, tag, deployment, production database connection, or external integration was performed.

## Scope and source changes

The implementation establishes one primary **New Visit / Appointment** route: an authorized user selects an active consultant, deterministically finds or registers a patient, makes an explicit booking with a controlled source, checks the patient in, and starts a single appointment-linked consultation. The existing consultant-specific OP implementation is reused rather than reimplemented.[1] [2]

| Area | Files | Delivered behavior |
|---|---|---|
| Schema and migration | `drizzle/schema.ts`, `drizzle/0025_windy_blue_blade.sql`, `drizzle/meta/0025_snapshot.json`, `drizzle/meta/_journal.json` | Adds `Checked-in`, controlled appointment source, nullable consultation appointment linkage, and unique one-consultation-per-appointment protection. |
| Deterministic bootstrap | `drizzle/baseline/current_schema.sql`, `scripts/bootstrap_baseline.ts` | Represents and asserts the Step 2 schema objects in fail-closed fresh-database initialization. |
| Server workflow | `server/visitWorkflow.ts`, `server/db.ts`, `server/routers.ts` | Provides deterministic matching, mobile duplicate protection, transaction-backed booking/check-in/start, audit events, and server-side authority. |
| Frontend workflow | `client/src/pages/NewVisit.tsx`, `client/src/pages/Appointments.tsx`, `client/src/App.tsx`, `client/src/components/DashboardLayout.tsx`, `client/src/pages/Home.tsx` | Adds the unified route, replaces the primary front-desk entry, makes bookings visible to authorized administration/staff, and supplies state-aware check-in / start-and-print OP actions. |
| Test coverage | `server/visitWorkflow.test.ts`, `server/visitDb.test.ts`, `server/phase4Visit.test.ts` | Covers pure matching/lifecycle policy, database transactions and retry idempotency, router authorization, duplicate handling, OP scope, and zero procurement/inventory writes. |

## Schema, lifecycle, and idempotency

The additive migration `0025_windy_blue_blade.sql` modifies the appointment status enum to include `Checked-in`, adds non-null `appointments.appointmentSource` with the allowed values `MANUAL`, `WALK_IN`, and `PHONE`, and adds nullable `consultations.appointmentId` guarded by a unique constraint. The schema design permits legacy consultations without an appointment while ensuring that a workflow appointment can create at most one linked consultation.[1]

| Transition or rule | Server-authoritative control | Audit / retry result |
|---|---|---|
| Candidate search | The server ranks returned patients in a deterministic order: exact patient ID, exact normalized mobile, exact full name, then partial name. | A PHI access event stores result count only; it does not store the raw search input. |
| New registration | A normalized Indian mobile is checked against existing normalized mobile records before reusing the established registration boundary. | A strong match returns conflict candidates for explicit human resolution; no automatic merge or demographic overwrite occurs. |
| Appointment booking | The server checks patient existence, active consultant status, consultant self-scope, controlled source, and booking conflict lock in one transaction. | `APPOINTMENT_CREATED` is attributed to the authenticated actor. |
| Check-in | The server resolves appointment access before permitting a `Scheduled` appointment to become `Checked-in`. | `APPOINTMENT_CHECKED_IN` stores the authoritative transition and actor. |
| Consultation start | Patient and consultant IDs are derived from the stored appointment, never from a client-supplied OP identity. | The first call creates `CONSULTATION_STARTED`; retry returns the existing appointment-linked consultation without a duplicate row or audit start event. |

## Access control and branded OP reuse

Admins and permitted staff can select an active consultant. A consultant can see and act only on their own appointment context; attempts to use another consultant’s ID or appointment are rejected before booking, check-in, consultation start, or OP access. The staff access gate reuses the existing `patient_records` feature permission, while the existing appointment workflow authorization is retained.[2]

The appointment action now invokes the existing `consultations.getBrandedPrintData` endpoint and `generateConsultationOPHTML` generator. It therefore prints the Phase 4 Step 1 layout with the consultation-linked consultant on the left and **MAX DIAGNOSTICS / Punjagutta** on the right, retaining its safe optional-logo/signature behavior. The print-data endpoint remains consultant-scoped and audits each OP view.[3] [4]

## Isolated validation evidence

All database actions below used isolated MySQL 8 schemas on the local sandbox. No managed development or production database was repaired, migrated, reset, or queried.

| Check | Result |
|---|---|
| Fresh deterministic bootstrap | **PASS** — 157 fail-closed SQL statements; 29 required tables; exact PK, index, required-column, and unique-constraint assertions passed. |
| Canonical baseline plus forward migration | **PASS** — the canonical pre-Step-2 baseline at `a679dd1` plus `0025_windy_blue_blade.sql` created `appointmentSource`, `Checked-in`, `consultations.appointmentId`, and `consultations_appointmentId_unique` exactly once. |
| TypeScript | **PASS** — `pnpm check` completed with zero errors. |
| Focused tests | **PASS** — 49 tests across 5 files: appointment, Step 1 OP, Step 2 router, Step 2 transaction, and pure workflow policies. |
| Full test suite | **PASS** — 262 tests across 33 files against the separate freshly bootstrapped validation database. |
| Production build | **PASS** — `pnpm build` completed. The existing large-chunk advisory remained a warning only. |
| Diff hygiene | **PASS** — `git diff --check` completed with no whitespace errors. |

## Disposable browser acceptance

Browser acceptance used only temporary synthetic users, active consultants, patients, and appointments in the isolated acceptance database. It demonstrated two active consultant choices, deterministic exact-mobile candidate results, in-flow patient registration, explicit patient selection, and bookings with `MANUAL` and `PHONE` sources. The server records confirmed appointment-to-patient-to-consultant linkage and `APPOINTMENT_CREATED` audit events.

For the first synthetic visit, the browser performed the complete lifecycle through **Scheduled → Checked-in → Start Consultation**. A repeated start returned the same consultation: the database showed one appointment-linked consultation, one consultation-start audit, one check-in audit, and a branded-OP view audit. The OP action reused the existing print data route and generator. A second synthetic consultant booking also showed active selection and an independently linked `PHONE` appointment.

> Procurement and inventory boundary evidence remained unchanged throughout acceptance: `purchaseOrders = 0`, `goodsReceipts = 0`, `inventory = 0`, and `stockMovements = 0` in the isolated acceptance database.

During acceptance, an existing admin/staff appointment list gap was found: the list path returned no appointments when neither consultant nor patient filter was supplied. The implementation now uses the narrowly scoped `getAllAppointments` read helper for authorized admin/staff users only; consultant self-scoping is unchanged. A second UI-state correction retains a freshly registered patient locally as the explicit selection until candidate-query results are available. The authenticated registration endpoint returned a successful synthetic response after this correction; interaction tooling did not reliably reflect the post-mutation React state on every click, so the correction is additionally protected by type checking and the server-side workflow tests.

## Preserved boundaries and known limits

The Phase 3 procurement, inventory, PO, Goods Receipt, stock movement, catalog, OCR, and external-integration behavior was not changed. Historical migrations `0000`–`0024` were not edited. The Step 2 migration was generated as a new forward-only artifact, and only disposable databases were used for validation.

Protected GitHub CI, publication, merge, deployment, and production migration were intentionally not performed because they were outside this instruction’s local-validation stop gate. The uncompleted ledger item for protected CI is deliberately retained as pending.

## References

[1]: ./drizzle/schema.ts "Current schema definitions"
[2]: ./server/routers.ts "Workflow routes and authorization boundaries"
[3]: ./server/db.ts "Transaction-backed appointment and consultation helpers"
[4]: ./client/src/lib/opFormGenerator.ts "Existing consultant-branded OP renderer"
