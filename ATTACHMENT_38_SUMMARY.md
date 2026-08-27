# Attachment 38 Summary

Attachment 38 authorizes a **new clean implementation** of Phase 4 Step 3 from canonical GitHub `main` at `55574b63c3b664e27eb57a24d3dfce94db6e652e`, on branch `feature/phase4-paper-first-op-billing-v2`. It expressly says the prior Step 3 source is not recoverable and must not be represented as authoritative.

The required workflow is Scheduled → Checked-in → Generate OP → appointment-linked consultation → consultant-branded paper OP → physical consultation → consultation marked ready for billing → bill generated → appointment Completed → visit closed → longitudinal Patient Records linkage. The mandatory invariant is that consultation completion does not close the visit; only successful bill creation closes the linked appointment.

The implementation must preserve nullable digital consultation fields and avoid structured prescription tables or new digital diagnosis/treatment fields. Generate OP accepts only an appointment ID, derives patient and consultant server-side, and is idempotent. Printing is presentation-only and must not finalize, complete, bill, or mutate procurement/inventory. Paper OP output must have consultant identity on the left, MAX DIAGNOSTICS/Punjagutta on the right, patient/visit details, and blank handwriting sections for history, examination, investigations, diagnosis, treatment, advice/follow-up, and signature.

Completion is limited to the assigned active consultant or an auditable admin override; staff cannot impersonate consultant completion. Billing must derive encounter context from the consultation, reject patient substitution, require finalized consultation, enforce one bill per encounter through a minimal forward migration while keeping nullable historical `consultationId`, and mark the appointment Completed only after bill linkage succeeds. Payment remains separate and may stay Pending, Partial, or Paid.

Required validation includes focused lifecycle/RBAC/branding/blank-paper/idempotency/zero-procurement tests, existing Phase 4 Step 1 and Step 2 tests, User Management, billing, Patient Records, and Phase 3 procurement tests, followed by `pnpm check`, full `pnpm test --run`, `pnpm build`, `git diff --check`, and fresh isolated MySQL validation if schema changes. After local validation, commit as `feat(visits): add paper-first OP billing closure` and stop without push, PR, merge, tag, deployment, or production access.

## Current comparison

Canonical GitHub main already contains appointment-linked consultations, branded print data, consultant profile fields, and Step 2 idempotent consultation-start primitives. It did not contain the Step 3 completion/billing-handoff/visit-closure procedures or the one-bill-per-consultation uniqueness declaration. The clean branch now adds only the minimal forward migration and server/UI changes required for the paper-first workflow; no ThreeUI changes are being introduced.
