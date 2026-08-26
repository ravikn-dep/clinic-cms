# Attachment 35 Review Summary

## Requested workflow

Attachment 35 replaces the previous mandatory-digital Phase 4 Step 3 approach with a paper-first visit lifecycle: check-in, Generate OP, consultant-branded A4 paper OP printing, handwritten consultation, consultant-owned Consultation Completed, Ready for Billing, bill generation, and only then appointment completion/visit closure. Patient Records remains the longitudinal hub.

## Explicit boundaries

The replacement must start from the current protected canonical `main`, not the obsolete local digital Step 3 branch. It must preserve separate patient, appointment, consultation, and bill identities; reuse nullable future digital consultation fields without requiring or fabricating clinical content; avoid structured prescription lines, AI clinical documentation, new digital clinical fields, document upload, procurement changes, and billing/payment redesign. Generate OP and print are presentation/audit events only and must not finalize consultations, complete appointments, create bills, or mutate procurement/inventory tables.

## Canonical audit findings

Canonical GitHub main is `55574b63c3b664e27eb57a24d3dfce94db6e652e`, with `phase4-step2-stable` at `25f0aae1b73af54ec741c8736dd5964977be6a86` as its relevant predecessor. The replacement worktree is `feature/phase4-paper-op-billing-closure` at the current canonical main.

The canonical schema already contains `appointments.status` with `Scheduled`, `Checked-in`, and `Completed`, plus `appointmentSource`, `patientId`, and `consultantId`. `consultations` already contains nullable clinical/digital fields, `isFinalized`, `consultantId`, and a unique nullable `appointmentId` index. `bills` already contains nullable `consultationId`, but the canonical schema audit must determine whether a unique nullable consultation index is present before deciding on a minimal forward migration. Existing visit helpers already implement server-side appointment lookup, check-in, and idempotent one-consultation-per-appointment creation.

The existing `generateConsultationOPHTML` renderer already provides the required consultant-left / MAX DIAGNOSTICS Punjagutta-right branding, patient demographics, consultant qualifications, registration data, optional logo, and signature. Its paper-first adaptation must replace digital clinical/default text with generous blank writing sections while preserving the renderer and server-authoritative print-data flow.

Existing billing creation is generic and accepts browser-supplied patient and optional consultation IDs. The replacement must add a server-authoritative consultation-linked billing handoff and idempotent bill reuse, then mark the linked appointment `Completed` only after the bill exists. Existing Patient Records already exposes consultation, Generate Bill, Print OP, and linked bill actions and should remain the longitudinal entry point.

## Verification and publication constraints

Required validation includes focused replacement tests, Phase 4 Step 1/2 regression tests, relevant billing/patient-record/auth/RBAC/procurement tests, full Vitest, type-check, build, diff hygiene, and fresh MySQL/bootstrap only if a schema migration is necessary. Interactive acceptance must use synthetic data only and prove no procurement/inventory mutations. This task stops after local validation: no push, PR, merge, tag, deployment, or production database action.
