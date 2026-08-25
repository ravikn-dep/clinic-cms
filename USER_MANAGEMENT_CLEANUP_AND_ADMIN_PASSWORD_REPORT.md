# User Management Cleanup and Admin Password Report

**Status:** Implementation present; development schema reconciled; full-suite completion gate blocked.

**Scope:** Development-only verification and repair. No production database, deployment, push, merge, tag, PR, or new User Management functionality was performed. The pre-ThreeUI stable UI was restored before this work and no ThreeUI files or imports remain in the active checkout.

## Executive result

The original User Management hardening remains implemented in the isolated `feature/user-management-cleanup` worktree, with focused security coverage observed at **10/10 tests passed** in the current test file. The connected development database had drifted behind the canonical appointment schema. The exact canonical forward changes from migrations 0021–0025 were applied to the development database only, in dependency order, without editing historical migration files.

The development schema repair succeeded and preserved business-row counts. `pnpm check`, the available focused authentication/RBAC tests, and `pnpm build` passed. The full Vitest suite did not complete: it stalled in the existing `server/featureAccess.test.ts` database transaction path while overwriting staff/consultant permissions. Because the attachment requires a green full suite, the final classification is **BLOCKED**, not `USER_MANAGEMENT_CLEANUP_IMPLEMENTED_LOCAL_VALIDATED`.

## 1. Schema drift root cause

The active restored stable checkout was based on the pre-0025 application state. Its local migration directory ended at `0020_glorious_thor.sql`, while the canonical GitHub ref `remotes/github/main` contains the Phase 4 Step 2 migration in commit `e0d7101`:

> `drizzle/0025_windy_blue_blade.sql` adds the checked-in status value, `appointments.appointmentSource`, `consultations.appointmentId`, and the unique consultation-to-appointment protection.

The development database already contained `appointments.checkedInAt` and `appointments.checkedInBy`, but it was missing the 0025 additions. Before repair, the appointment status enum was:

```text
enum('Scheduled','Completed','Cancelled','No-show','Rescheduled')
```

`appointments.appointmentSource`, `consultations.appointmentId`, and the `consultations_appointmentId_unique` index were absent. The database also lacked the canonical 0021–0024 catalog, vendor, extraction-review, posting-lock, and consultant-profile additions.

## 2. Migration/reconciliation performed

The following exact canonical forward migrations were retrieved from the repository’s `remotes/github/main` ref and applied to the connected **development database only**:

| Migration | Canonical source | Action |
|---|---|---|
| 0021 | `drizzle/0021_*.sql` from `remotes/github/main` | Created `purchaseOrderExtractionReviews` and its required indexes. |
| 0022 | `drizzle/0022_motionless_quicksilver.sql` | Created `catalogItems` and `catalogItemAliases`; added catalog review/item linkage and indexes. |
| 0023 | `drizzle/0023_previous_lady_ursula.sql` | Added consultant profile and branding fields to `users`. |
| 0024 | `drizzle/0024_soft_aqueduct.sql` | Created `procurementPostingLocks`; added vendor/catalog linkage and uniqueness/index protections. |
| 0025 | `drizzle/0025_windy_blue_blade.sql` | Added `Checked-in`, `appointmentSource`, `consultations.appointmentId`, and its unique index. |

No historical migration file was edited. No duplicate migration file was created. No fallback query, SQL-error suppression, `|| true`, production connection, or destructive data operation was used.

The development migration ledger contained a single baseline marker rather than a complete 0000–0025 forward history. Therefore, the repair used the exact canonical SQL statements in forward dependency order against the already-operational development schema. The active application source was not rewritten merely to hide the drift.

## 3. Post-repair schema evidence

The post-repair development queries returned the following evidence:

| Invariant | Result |
|---|---|
| `appointments.appointmentSource` | Present; `enum('MANUAL','WALK_IN','PHONE')`, `NOT NULL`, default `MANUAL`. |
| Checked-in lifecycle | Present; `appointments.status` now includes `Checked-in`. Existing `checkedInAt` and `checkedInBy` remain present. |
| `consultations.appointmentId` | Present as `varchar(50)`. |
| One-consultation-per-appointment protection | `consultations_appointmentId_unique` present and unique. |
| `purchaseOrderExtractionReviews` | Present. |
| `catalogItems` | Present. |
| `catalogItemAliases` | Present. |
| `procurementPostingLocks` | Present. |
| Catalog/batch/expiry uniqueness | `inventory_catalog_batch_expiry_unique` present. The metadata query returned three index rows because the composite index has three ordered columns. |
| Purchase-order vendor index | `purchaseOrders_vendorId_idx` present. |

## 4. Business-data zero-mutation evidence

Counts were captured before and after the development-only schema repair. The values were unchanged:

| Table | Before | After | Difference |
|---|---:|---:|---:|
| `patients` | 201 | 201 | 0 |
| `appointments` | 3,224 | 3,224 | 0 |
| `consultations` | 0 | 0 | 0 |
| `purchaseOrders` | 3 | 3 | 0 |
| `goodsReceipts` | 0 | 0 | 0 |
| `inventory` | 3 | 3 | 0 |
| `stockMovements` | 0 | 0 | 0 |
| `users` | 5,113 | 5,113 | 0 |

The schema repair performed no inserts, updates, or deletes against business records. User password-management tests also assert that patient, procurement, receipt, inventory, and stock-movement helpers are not invoked by password operations.

## 5. Development user classification

The connected development `users` table is operational-looking and contains **5,113 active records**. Aggregate inspection returned 3,061 active `user` records, 2,049 active `admin` records, one active `consultant`, and two active `staff` records. No inactive users were present in the aggregate result, and no individual record met a defensible safe-deletion criterion.

No password hashes were selected, printed, or included in this report.

| Scope | User ID / login-name detail | Role | Active | Reference summary | Classification | Recommended action |
|---|---|---|---:|---|---|---|
| Development users, aggregate inspection | Individual identities were intentionally not dumped because no stale/inactive candidate was identified. | `user` | 3,061 | Operational population; no inactive candidates in aggregate result. | KEEP | No action. |
| Development users, aggregate inspection | Individual identities were intentionally not dumped because no stale/inactive candidate was identified. | `admin` | 2,049 | Operational administrator population; active-admin guard remains satisfied. | KEEP | Preserve all; do not reduce administrator count based on aggregate age alone. |
| Development users, aggregate inspection | One active consultant; identity details not exposed in this report. | `consultant` | 1 | Active consultant population; no stale candidate identified. | KEEP | Preserve and validate through normal RBAC workflow. |
| Development users, aggregate inspection | Two active staff records; identities not exposed in this report. | `staff` | 2 | Active staff population; no inactive candidate identified. | KEEP | Preserve and validate through normal RBAC workflow. |

**Exact users deleted:** None.

**Exact users deactivated:** None.

**Reason:** The database contains meaningful operational data, all observed users are active, and no record was safely classifiable as `SAFE_TO_DELETE`. Referenced historical users must not be hard-deleted; no user status was changed.

**Active administrators preserved:** Yes. The post-repair aggregate query returned **2,049 active administrators**.

## 6. Admin password-management acceptance

The isolated `feature/user-management-cleanup` worktree contains the focused `server/userManagement.test.ts`. Its current observed result was **10/10 tests passed**:

| Acceptance/security control | Evidence |
|---|---|
| Admin can create a consultant/staff-style account | Test exercises admin-only creation path. |
| Password is server-hashed | Test verifies the password helper receives a hash and the response contains no secret. |
| Duplicate identity protection | Duplicate email creation is rejected. |
| Admin reset | Test verifies the target password helper receives a bcrypt-compatible hash and not plaintext. |
| Inactive-login rejection | Alternate credential login rejects inactive users. |
| Non-admin reset denial | Reset is rejected before the password-update helper is touched. |
| Referenced-user deletion safety | Historical references block destructive deletion. |
| Last-active-admin protection | Deleting the last active administrator is rejected. |
| Unreferenced non-admin deletion path | Test permits only the safe, unreferenced path and audits it. |
| Zero business mutation | Password/reset paths do not invoke clinical, procurement, receipt, or inventory mutations. |

The current restored stable checkout does not contain that isolated worktree’s `server/userManagement.test.ts`; this is documented rather than silently counted as part of the active checkout’s full-suite result.

## 7. Consultant regression status

The available active-checkout RBAC and consultant regression coverage passed where executed. The schema repair did not change consultant identities, appointment rows, consultation rows, OP data, billing, or branding records. A complete end-to-end consultant acceptance pass was not claimed because the full suite did not finish and no synthetic consultant mutation was performed against the operational development population.

## 8. Validation results

| Command | Result |
|---|---|
| `pnpm check` | PASS; zero TypeScript errors. |
| `pnpm test --run server/rbac.test.ts` | PASS; 11/11 tests. |
| `pnpm test --run server/auth.logout.test.ts` | PASS; 1/1 test. |
| `pnpm test --run server/auth.login.test.ts` | PASS; 1/1 test. |
| `pnpm test --run server/userManagement.test.ts` in isolated User Management worktree | PASS; 10/10 tests. |
| `pnpm test --run server/featureAccess.test.ts` | BLOCKED; reproduced a database-backed stall while overwriting permissions. |
| `pnpm test --run` | BLOCKED; the full run stalled in `server/featureAccess.test.ts` and was terminated after the bounded retry. No green full-suite count is claimed. |
| `pnpm build` | PASS; Vite and server bundle completed. A pre-existing large-chunk warning remains. |
| `git diff --check` | PASS for the active source diff before the report-only ledger additions. |

The earlier inherited figure of 250/272 was not reused as current evidence because it came from a different worktree/state before this repair. The attachment’s required final classification is therefore not satisfied.

A narrow validation-only attempt batched the permission inserts inside the existing transaction. It did not resolve the reproduced stall and was reverted; the final application source retains the stable pre-existing implementation. No ineffective workaround or semantic RBAC change remains in the delivered checkpoint.

## 9. Final classification

> **BLOCKED — full Vitest suite is not green.**

The development schema repair is complete and business-row counts are unchanged. User cleanup performed no deletions or deactivations. The remaining blocker is the existing database-backed `featureAccess` test stall, plus the fact that the active restored stable checkout does not contain the isolated User Management test file. No publication or production action was taken.
