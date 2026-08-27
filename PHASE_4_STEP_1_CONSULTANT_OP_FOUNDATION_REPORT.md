# Phase 4 Step 1 — Consultant-Specific OP and Prescription Foundation

**Local status:** Implemented and locally validated on `feature/phase4-consultant-op-foundation` from canonical baseline `535a0d0`. This report describes only committed-worktree source paths and validation commands. No production database, production credential, deployment, tag, merge, or force push was used.

## Architecture decision

The existing `users` table remains the sole identity model. A separate consultant-profile table was intentionally not introduced because the system already represents consultants as `users.role = "consultant"`, uses the numeric `users.id` for appointments and consultations, and stores existing professional fields on that record. The implementation adds only six nullable consultant-specific fields to `users`: qualifications, specialization, designation, prescription header text, consultant logo key, and signature key.

| Concern | Phase 4 Step 1 decision |
| --- | --- |
| Clinic tenancy | **Single clinic only.** `shared/clinicBranding.ts` defines fixed `MAX DIAGNOSTICS`, `Punjagutta` identity. No tenant, clinic selector, location switcher, or clinic table was added. |
| Consultant identity | Existing `users` rows with role `consultant`; existing `name`, phone, department, council, and registration fields are reused. |
| Consultant profile fields | Additive `users` fields only; no existing user, appointment, consultation, patient, billing, pharmacy, PO, Goods Receipt, inventory, or stock column is removed or reinterpreted. |
| Appointment attribution | Existing `appointments.consultantId` is retained. The server validates that new bookings target an active consultant and derives the consultant’s own ID from the authenticated session. |
| Consultation attribution | Existing nullable `consultations.consultantId` is retained for history. All new consultations require an active consultant; consultant callers are assigned their authenticated ID and cannot supply another consultant ID. |
| OP document source | A consultation-specific, audited server route resolves the consultation, patient, and consultant together. The browser does not submit a consultant identity or storage key for printing. |

## Schema, migration, and baseline

Migration `drizzle/0023_previous_lady_ursula.sql` is additive and contains six `ALTER TABLE users ADD` statements only. Drizzle generated `drizzle/meta/0023_snapshot.json` and updated `drizzle/meta/_journal.json`. The deterministic `drizzle/baseline/current_schema.sql` received the same six additive fields, and `scripts/bootstrap_baseline.ts` now fail-closes if any consultant-profile column is absent.

No migration was applied to a project or production database. The migration is supplied for existing installations; the deterministic baseline supports new empty MySQL 8 databases.

| New `users` field | Purpose | Sensitive data policy |
| --- | --- | --- |
| `qualifications`, `specialization`, `designation` | Consultant identity and OP display | Reference text only. |
| `prescriptionHeaderText` | Consultant-authored OP header line | Display text only; no patient data. |
| `consultantLogoKey`, `signatureKey` | Application-managed storage references | Database stores keys only; no image bytes, local paths, signed URLs, or credentials are persisted. |

## Authority model

Consultant profile creation, update, activation/deactivation, and image upload are **admin-only**. Consultants and staff cannot call these write routes. This is deliberate Step 1 governance: the administrator owns consultant identity, registration, and branding configuration. Each profile change produces a server-attributed `auditLogs` event; the authenticated admin ID is supplied by server context and is never accepted from the client.

The shared dashboard remains role-based. The existing User Management navigation remains admin-only, and it now contains the consultant-detail controls rather than creating a parallel consultant-profile module. The dashboard facility identity was updated to **MAX DIAGNOSTICS / Punjagutta** without introducing a facility settings or multi-clinic feature.

## Secure image storage

`server/consultantAssets.ts` validates a client-selected image server-side. It permits only PNG or JPEG data URLs, requires matching PNG/JPEG file signatures, rejects empty and malformed payloads, enforces a 1.5 MiB raw-byte ceiling, ignores client filenames, and stores the result through the existing application storage helper. Logo and signature objects receive server-generated keys beneath a consultant-scoped prefix.

The print route resolves any stored image key into a safe temporary application URL only for an authorized OP response and strips both raw storage keys from that response. The OP renderer omits an image element entirely when an optional logo or signature does not exist, avoiding broken-image output.

## Appointments, consultations, and OP output

`appointments.create` now checks staff access, validates the target consultant is active, uses conflict-safe appointment creation, and rejects a consultant who submits another consultant’s ID. Appointment list, cancel, reschedule, no-show, and completion routes enforce consultant ownership for consultant callers. The booking UI no longer uses placeholder consultant IDs; it lists active consultants for admin/staff and states that consultant users are assigned to their own account.

New consultations are server-attributed to an active consultant. Consultation list and detail access are scoped for consultant callers. The new `consultations.getBrandedPrintData` mutation resolves print data by `consultationId`, enforces consultation ownership, creates a `CONSULTATION_OP_PRINT_VIEWED` audit event, and returns fixed facility identity plus optional safe image URLs.

The printable document is generated by `generateConsultationOPHTML`. It uses an A4 layout, 12px Arial/Times-compatible text, consultant identity on the left, **MAX DIAGNOSTICS / Punjagutta** on the right, patient and visit context, clinical history, complaints, investigations, treatment/prescription, advice/follow-up, registration identity, and optional signature. The patient-level generic **Print OP Form** control was removed; OP printing is now launched from a specific consultation card.

## Business-boundary confirmation

This step does not create or alter patient identities, billing, pharmacy records, purchase orders, extraction evidence, catalog matches, Goods Receipts, inventory, or stock movements. It does not add LLM prescription generation, external drug data, multi-clinic support, appointment allocation optimization, hard-deletion of historical consultant records, or automatic consultant/alias learning. Historical consultation/appointment records remain intact.

## Validation evidence

| Command | Result |
| --- | --- |
| `pnpm check` | Passed with zero TypeScript errors. |
| `pnpm test --run server/consultantOp.test.ts` | Passed: **9/9** focused Phase 4 tests. |
| Required OCR/parser/review/evidence/catalog plus Phase 4 suites | Passed: **58/58** tests across 7 files. |
| `pnpm test --run` | Passed: **236/236** tests across 28 files. |
| `pnpm build` | Passed. Only the existing non-failing Vite large-chunk advisory was emitted. |
| `git diff --check` | Passed with no whitespace errors. |
| Fresh MySQL 8 `pnpm db:bootstrap` | Passed against a new isolated local database; the baseline executed **142 statements** with zero SQL errors, verified all 28 tables, primary keys, unique/index invariants, and all six consultant-profile columns. |

The focused suite covers admin-only profile writes, server-derived audit actor identity, PNG/JPEG content validation, malformed image rejection, active consultant enforcement, staff selection of an active consultant, consultant-ID tampering rejection, new consultation attribution, cross-consultant consultation/appointment denial, storage-key omission from print responses, consultant-left/facility-right output, missing-image fallback, and zero PO/receipt/inventory mutation assertions.

## Known limitations and next gate

This Step 1 foundation does not yet provide medication-line authoring, a drug catalog, prescription PDFs, digital signing, external transmission, or automated clinical recommendation. It also does not claim that existing historical rows with null `consultantId` have been backfilled; historical data was intentionally left unchanged.

The next gate is to commit the scope-limited implementation, push `feature/phase4-consultant-op-foundation`, open a pull request to protected `main`, and wait for a green `CI Validation / validate` run. The branch must not be merged, tagged, deployed, or used for a production database migration during this task.
