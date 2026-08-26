# Phase 4 Step 3 — Paper-First OP → Billing → Visit Closure V2

## Classification

The implementation is committed locally from canonical `main` at `55574b63c3b664e27eb57a24d3dfce94db6e652e` on branch `feature/phase4-paper-first-op-billing-v2`. The exact source is a new implementation, not a recovery or fidelity claim for the lost prior Step 3 work.

## Workflow and invariants

The implemented workflow is Scheduled → Checked-in → Generate OP → appointment-linked consultation → consultant-branded paper OP → physical consultation → Ready for Billing → encounter bill → appointment Completed → Patient Records visit chain. Consultation completion sets `consultations.isFinalized = 1` but does not complete the appointment. Only successful consultation-linked bill creation marks the appointment Completed.

`visits.generateOp` accepts only `appointmentId`, requires a Checked-in appointment, derives the existing appointment-linked consultation server-side, and returns the same consultation on retry. `visits.completeConsultation` permits the assigned consultant or an auditable admin override; staff and cross-consultant completion are rejected. `bills.createEncounter` derives the patient and appointment from the consultation, rejects mismatched context, requires finalization, and performs bill lines plus appointment closure in one transaction. A unique nullable `bills.consultationId` index prevents duplicate encounter bills while preserving multiple historical rows with `NULL` consultationId under MySQL semantics.

## Paper OP renderer

`generateConsultationOPHTML` retains the existing A4 layout, consultant identity on the left, MAX DIAGNOSTICS/Punjagutta on the right, patient details, consultant signature area, Times New Roman/Arial 12px typography, and a small optional QR image through the pre-existing registration renderer. The consultation OP sections are explicitly blank handwriting areas for chief complaints/history, examination/findings, investigations, diagnosis/assessment, treatment/prescription, and advice/follow-up. Existing digital clinical fields remain in the schema and are not rendered into these paper sections.

## Changed files

| Path | Purpose |
|---|---|
| `drizzle/schema.ts` | Declares nullable unique `bills.consultationId`. |
| `drizzle/0026_past_ironclad.sql` | Adds the minimal forward uniqueness constraint. Historical migrations 0000–0025 were not edited. |
| `drizzle/meta/0026_snapshot.json` and `drizzle/meta/_journal.json` | Drizzle metadata for migration 0026. |
| `drizzle/baseline/current_schema.sql` | Adds the corresponding fresh-baseline uniqueness statement. |
| `scripts/bootstrap_baseline.ts` | Asserts `bills_consultationId_unique` alongside existing schema invariants. |
| `server/db.ts` | Adds transaction-safe completion, encounter billing/closure, and patient visit-chain helpers. |
| `server/routers.ts` | Adds Generate OP, completion, visit-chain, consultation-derived encounter billing, and server-derived billing context. |
| `server/paperFirstWorkflow.ts` | Pure state and authority policy helpers. |
| `server/paperFirstWorkflow.test.ts` | 40 focused tests for state gates, authority, billing readiness, branding, blank sections, and non-printing digital content. |
| `client/src/lib/opFormGenerator.ts` | Makes branded consultation OP sections paper-first and blank. |
| `client/src/pages/Appointments.tsx` | Uses Generate OP & Print for checked-in visits and removes direct appointment completion actions. |
| `client/src/pages/PatientRecords.tsx` | Adds Ready for Billing and minimal visit-chain representation. |
| `client/src/pages/Billing.tsx` | Routes appointment-linked billing through the consultation-derived encounter procedure and blocks non-finalized encounters. |
| `todo.md` | Records Attachment 38 scope and validation ledger. |
| `ATTACHMENT_38_SUMMARY.md` | Records the read/summarize/verify findings. |

## RBAC, audit, and mutation boundaries

Consultants may operate on their own appointments and consultations. Admins may perform an explicit completion override. Staff remain eligible for existing appointment/billing permissions but cannot impersonate consultant completion. Completion and visit closure create audit entries. Generate OP, OP printing, consultation completion, and encounter billing do not reference or mutate `purchaseOrders`, `goodsReceipts`, `inventory`, `stockMovements`, `catalogItems`, `catalogItemAliases`, or `vendors`.

## Validation evidence

The canonical base is an ancestor of the implementation branch and the diff contains no ThreeUI, topology, or Three.js changes. `pnpm check` passed with zero TypeScript errors. Focused validation passed: `server/paperFirstWorkflow.test.ts` 40/40, together with Phase 4 Step 1/2 suites for 60/60 tests. The complete local suite passed **312/312 tests across 35 files**. `pnpm build` passed and `git diff --check` passed. The full test run emitted only the existing expected QR-code negative-case stderr and no test failures.

A fresh isolated MySQL bootstrap was not executed because this sandbox has the MySQL client but no local MySQL server (`mysqld`) or Docker runtime. The configured `DATABASE_URL` was deliberately not used, so no development or production database was touched. Fresh-bootstrap validation therefore remains an explicit pending gate rather than being claimed as passed.

## Commit and stop gate

The required local commit message is `feat(visits): add paper-first OP billing closure`. Per Attachment 38, after local commit and validation this work stops. No push, pull request, merge, tag, deployment, credentials change, or production database action is authorized or performed.

## Known limitations

The existing generic manual billing route remains available for non-encounter bills. The new encounter route intentionally does not redesign payments and leaves payment status `Pending` after visit closure. PDF generation and future digital/hybrid consultation workflows remain outside this paper-first implementation. The fresh isolated MySQL baseline replay must be run in an environment with an explicitly isolated MySQL 8 instance before a stronger validated classification is assigned.
