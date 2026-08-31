# Attachment 70 — Billing, Appointment Visibility, and OP Rendering Verification

## Completed Scope

The Appointments workspace now treats a booked date as an explicit, timezone-safe local-calendar value. Valid scheduled and checked-in records appear in both list and calendar views for their booked date, while malformed native-date input retains the last valid selection rather than crashing the page.

Billing candidates and mutable bill rows now use deterministic identities. The exact generated or selected bill can be focused in Billing through its canonical `billId`, and the existing protected View PDF action remains available from that context.

The sole Master OP renderer now parses stored MySQL UTC timestamps explicitly and renders them in `Asia/Kolkata`. A valid consultation stored at `2026-08-29 12:55:47` rendered as `29 Aug 2026, 06:25 PM`, the corresponding India time. Configured managed-storage logo paths resolve against the opener origin in the print popup, image completion is checked after listener registration, and printing waits for configured images to load/decode or returns a controlled retry error. The logo is centered within the top-right brand zone and constrained to approximately half of the header height.

## Runtime Evidence

| Area | Result |
| --- | --- |
| Appointment list and calendar | A booked 29 August appointment appeared in list view and its August calendar day contained both valid records. |
| Generate OP with configured logo | `visits.generateOp` and `consultations.getBrandedPrintData` returned HTTP 200; the native print dialog opened and the source control returned to idle after dismissal. |
| OP output | One-page A4 output displayed the actual configured logo top-right, the stored India timestamp, patient block, handwriting area, signature line, location, grouped availability, and validity text. |
| Exact bill handoff | The selected bill row resolved its canonical ID and exposed an enabled View PDF control. |

## Validation and Boundaries

`pnpm check`, `pnpm test --run`, `pnpm build`, and `git diff --check` passed. The full suite reported **385/385 tests across 52 files**. No schema, migration, production data, deployment, credentials, authentication, RBAC, procurement, inventory, OCR, or external integration was changed.
