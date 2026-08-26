# User Management Completion — Attachment 33 Report

## Classification

> **USER_MANAGEMENT_HARDENING_LOCAL_VALIDATED**

Attachment 33 was completed as a validation-only investigation. No User Management features were added, RBAC semantics were changed, users were deleted or deactivated, production was accessed, or GitHub/deployment actions were performed.

## Established baseline

The restored stable application is based on canonical `main` commit `25f0aae1b73af54ec741c8736dd5964977be6a86`. The User Management hardening source exists in the coherent isolated worktree `/home/ubuntu/clinic-cms-user-management`, also based at `25f0aae1b73af54ec741c8736dd5964977be6a86`. Its implementation remains uncommitted in that isolated worktree; it was not copied blindly into the stable checkout.

The isolated worktree contains the following User Management source changes: `client/src/pages/ChangePassword.tsx`, `client/src/pages/UserManagement.tsx`, `server/_core/sdk.ts`, `server/db.ts`, `server/routers.ts`, and the focused `server/userManagement.test.ts`, with the audit report and ledger updates. The isolated worktree status was intentionally left unchanged; no commit, push, merge, PR, tag, or deployment was performed.

## 1. Isolated reproduction

The test was run with bounded timeouts and never treated as successful when it timed out. Early direct runs reproduced a stall in `server/featureAccess.test.ts`, most often during `setFeaturePermissions` or its `beforeEach` reset. A diagnostic background run completed normally with **11/11** tests. A later robust three-run sequence completed normally in all cases:

| Run | Result |
|---:|---|
| 1 | PASS — 11/11 tests; exit 0. |
| 2 | PASS — 11/11 tests; exit 0. |
| 3 | PASS — 11/11 tests; exit 0. |

The earlier timeout was therefore an intermittent database-backed test stall, not a stable application assertion failure. A direct retry also reproduced the stall once, which is why the bounded timeout and repeated-run gate were retained.

## 2. Lifecycle and helper audit

`server/featureAccess.test.ts` uses `beforeAll` to snapshot consultant/staff permissions, `beforeEach` to clear both roles, serial tests for reads, replacement, and access checks, and `afterAll` to restore the original permission maps. There is no `afterEach` hook. The called helpers in `server/db.ts` are `getFeaturePermissions`, `setFeaturePermissions`, and `checkFeatureAccess`. `setFeaturePermissions` obtains the shared Drizzle database pool, executes an awaited transaction, deletes the role’s rows, then awaits each insert before the transaction callback returns. `getDb()` uses a managed `mysql2` pool with a ten-connection limit.

The test uses no prepared statements or application-level detached promises. The transaction callback is awaited. The observed failure mode is a transient TiDB/pool transaction or lock-wait condition during sequential permission replacement; the source review did not demonstrate a deterministic missing `await`, swallowed rollback, or permanent open transaction.

A narrow experiment batched the transaction inserts. It did not remove the stall and was reverted. The final application source preserves the original RBAC behavior and transaction structure.

## 3. Database diagnostics

Read-only diagnostics during a live test included `SHOW FULL PROCESSLIST`. The TiDB development instance exposed no competing active query at the sampled time; the visible test connection could appear sleeping while a transaction remained open. `SHOW ENGINE INNODB STATUS` is unsupported by this TiDB instance, and `information_schema.innodb_trx` and `information_schema.tidb_lock_waits` were unavailable. `information_schema.tidb_trx` was queried successfully but returned no active transaction rows.

The `rolePermissions` table has the expected `unique_role_feature (role, featureKey)` key, `idx_role`, and `permissionId` primary key. No production or unrelated connection was killed. No SQL suppression, forced exit, skipped test, or arbitrary timeout-as-fix was used.

## 4. Source-fidelity validation

The coherent User Management worktree was validated directly rather than mixing files between stale checkouts:

| Command | Result |
|---|---|
| `pnpm check` | PASS — zero TypeScript errors. |
| `pnpm test --run server/userManagement.test.ts` | PASS — 10/10 tests. |
| `pnpm test --run` | PASS — 34 files, 272 tests. |
| `pnpm build` | PASS — client and server bundles completed. |
| `git diff --check` | PASS. |

The full suite’s expected test count for the coherent User Management worktree is **272/272 passed**. Expected security-related diagnostics are emitted by tests, but they are asserted safe error paths rather than failures. The build retains the pre-existing large-chunk warning.

For comparison, the restored stable checkout also completed the full suite at **23 files / 186 tests**, and the three repeated isolated feature-access runs passed **11/11** each.

## 5. User and business-data safety

The separate development user audit found no authorized cleanup action. No user was deleted or deactivated. The large admin/generic-user groups were not classified as stale solely from role or count. The previous read-only inspection showed duplicate external identity data and a non-unique development `openId` index relative to the Drizzle declaration; this remains a separate provenance/schema-repair concern.

No clinical, procurement, receipt, inventory, stock-movement, appointment, consultation, billing, or user rows were modified by this attachment-33 investigation. The existing zero-business-mutation test remains part of the isolated User Management suite.

## Final outcome

The feature-access stall was **not** reproduced in the required three-run bounded sequence, and the coherent User Management worktree passed its full **272/272** test suite, type-check, build, and diff hygiene. Because the earlier stall remains intermittent rather than explained by a deterministic source defect, no speculative application repair was retained. The task stops at local validation as required.

No push, PR, merge, tag, deployment, production database action, or user cleanup was performed.
