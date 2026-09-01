# Attachment 71 / 72 — Development Migration and Runtime Verification

## Migration and Configuration Decision

The repository already contains `drizzle/0028_messy_puff_adder.sql` for the nullable `users.consultantLocation` field. The connected development database already has `consultantLocation TEXT NULL`, and the current TypeScript schema agrees. The earlier requested `0027_consultant_location.sql` does not exist because `0027` is already assigned to the encounter and daily patient-ID migration. Under the explicit Attachment 72 authority, `0028_messy_puff_adder.sql` was accepted as the compatible migration state.

No SQL migration, migration-history manipulation, migration rename, migration renumbering, historical-migration rewrite, or duplicate migration was performed.

The active Dr. Deepthi development consultant was already active and configured through the existing User Management path with the approved location, a stored logo reference, and split availability. No credential, storage-provider, or role change was required.

## Runtime Verification

| Workflow | Development result |
| --- | --- |
| Cold Appointments OP print | A valid checked-in appointment completed `visits.generateOp` and `consultations.getBrandedPrintData` successfully. The configured managed-storage logo was requested through the active preview origin, then the native browser print dialog took focus as expected. |
| Warm Appointments OP print | The same valid workflow again completed successfully with the configured logo and native print handoff. |
| Patient Records Print OP | A valid existing consultation completed branded print-data retrieval successfully through the shared print path. |
| Master OP timestamp and logo | The sole renderer formats stored MySQL UTC timestamps in `Asia/Kolkata`; the configured logo is enlarged, centered in the top-right header zone, aspect-ratio-safe, and readiness-checked before printing. |
| Direct-encounter Billing | Patient Records opened the historical direct encounter in Billing using query-string context. `Consultation Fee` and `Test Procedure` were submitted as a confirmed development-only test invoice. The server returned HTTP 200 and created one bill for ₹1,000.00. |

The new bill is `BIL-1788182041199-dRS_md`, linked to the intended direct encounter and consultation. The post-create state is `Closed` for the encounter, `isFinalized = 1` for the consultation, and `Pending` for payment. The Billing screen highlighted the exact bill and exposed its protected invoice action. No payment was collected or changed.

## Validation and Boundaries

Final checks passed:

| Gate | Result |
| --- | --- |
| `pnpm check` | Passed |
| `pnpm test --run` | **390/390 passed** across 54 files |
| `pnpm build` | Passed; only the existing bundle-size advisory was emitted |
| `git diff --check` | Passed |

The work did not change production data, deployment, domains, credentials, authentication, RBAC, schema design, migrations, inventory, procurement, OCR, or any external integration.
