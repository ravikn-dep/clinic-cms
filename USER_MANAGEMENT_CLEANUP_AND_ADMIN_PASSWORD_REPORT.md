# User Management Cleanup and Admin Password Management Report

## Executive summary

This branch audits and hardens the existing User Management and hybrid authentication layer for the Clinic Management System. The implementation preserves the existing role model of **admin**, **consultant**, and **staff**, retains the unified dashboard with role/feature gating, and does not modify clinical, procurement, Goods Receipt, inventory, or billing behavior.

The connected development database was previously classified as operational-looking and historically populated. Because hard-deleting users would destroy attribution or risk breaking historical references, no connected-data deletion or stale-user cleanup was performed. The safe policy implemented here is to preserve referenced identities and use deactivation as the operational alternative to deletion.

## Files changed

| File | Change | Purpose |
|---|---|---|
| `server/db.ts` | Modified | Adds reference-summary and active-admin-count helpers; makes local credential authentication reject inactive accounts and support username/email/user ID lookup; preserves server-side password-hash storage. |
| `server/routers.ts` | Modified | Enforces admin-only creation, update, reset, and deletion controls; validates identifiers and minimum password length; hashes reset/create passwords server-side; prevents historical-reference deletion and last-active-admin deletion; keeps credential-login failures generic. |
| `server/_core/sdk.ts` | Modified | Rejects inactive users when resolving authenticated sessions, preventing an inactive account from continuing through the OAuth/session path. |
| `client/src/pages/UserManagement.tsx` | Modified | Adds initial-password entry during account creation, admin Reset Password flow, role-aware controls, and client validation aligned with the eight-character server policy. |
| `client/src/pages/ChangePassword.tsx` | Modified | Aligns self-service password-change validation with the eight-character minimum and existing protected workflow. |
| `server/userManagement.test.ts` | Added | Focused regression tests for administrator creation, role escalation, duplicate identifiers, bcrypt hashing, password secrecy, inactive login rejection, safe deletion, last-admin protection, and zero business-data mutation. |
| `todo.md` | Modified | Records the completed hardening and focused validation work while preserving cleanup and full-environment validation items that remain pending. |
| `USER_MANAGEMENT_CLEANUP_AND_ADMIN_PASSWORD_REPORT.md` | Added | This report. |

No schema or migration file was changed. No database migration was generated or applied.

## Authentication design

The application continues to use two authentication paths. Manus OAuth remains the administrator-facing path, while local credentials support consultant and staff accounts. The server compares submitted credentials against the stored bcrypt hash and returns a non-sensitive user profile. Password values and password hashes are not returned by the User Management procedures.

Local authentication now resolves a user by normalized username, email, or staff/consultant user ID, and requires the account to be active. Inactive accounts fail with the same generic invalid-credential response rather than disclosing whether an account exists or whether it is inactive. The session-resolution path also rejects inactive users, so deactivation takes effect on subsequent authenticated requests.

The minimum password length is **8 characters** for account creation, administrator resets, and self-service changes. Password hashing remains server-side. The reset and create procedures return only a success result and user identifier; they do not return a temporary password, QR login secret, password hash, or other plaintext credential.

## Authorization and lifecycle controls

| Operation | Authorization | Integrity rule |
|---|---|---|
| Create consultant/staff | `adminProcedure` | Only consultant/staff roles are accepted; username/email uniqueness is checked server-side; password is required and hashed before persistence. |
| Edit consultant/staff | `adminProcedure` | Client input cannot escalate a user to admin; identifier and role constraints are validated by the router. |
| Reset password | `adminProcedure` | Target must exist; password is hashed server-side; audit record contains only the target identifier and no secret. Existing sessions are not globally invalidated by this change. |
| Self-service password change | Protected authenticated procedure | Existing current-password verification is retained; minimum length is eight characters. |
| Activate/deactivate | `adminProcedure` | Existing role-aware lifecycle path is retained; inactive status is enforced at credential login and session resolution. |
| Delete user | `adminProcedure` | Historical/operational references block hard deletion; the last active administrator cannot be deleted. Deactivation is the safe alternative. |
| Dashboard features | Existing server-side RBAC and feature permissions | Consultant and staff users continue using the same unified dashboard surface with feature access controlled by role and admin-configured permissions. |

## Historical attribution and deletion policy

`getUserReferenceSummary` checks the user against appointment/checked-in attribution, consultations, consultant availability, notifications, audit logs, purchase-order approval, Goods Receipt receipt attribution, stock movements, purchase-order history, vendor creation, bill-template creation, and child-user creation. A non-zero aggregate blocks deletion and instructs the administrator to deactivate the account instead.

This is intentionally a preservation-first policy. The connected development database was not treated as disposable, so no bulk deletion was attempted and no historical identity was rewritten. The remaining cleanup task is to classify records only after an explicitly disposable non-production database is supplied.

## Audit and mutation boundaries

User creation, profile updates, password resets, activation changes, and permitted deletion continue to produce audit records through the existing audit-log mechanism. Password-reset audit data identifies the target user but does not contain the submitted password or generated hash.

The User Management changes do not add or invoke any patient, appointment, consultation, purchase-order, Goods Receipt, stock-movement, inventory, or billing mutation. The focused tests explicitly spy on representative clinical, procurement, receipt, and inventory mutation helpers and verify that password-management operations do not call them.

No idempotency behavior was changed. Existing business-operation idempotency remains outside this user-lifecycle change.

## Validation results

| Check | Result |
|---|---|
| `pnpm check` | **PASS** — zero TypeScript errors. |
| Focused user/RBAC/auth tests | **PASS** — 22/22 tests across `server/userManagement.test.ts`, `server/rbac.test.ts`, and `server/auth.logout.test.ts`. |
| `pnpm build` | **PASS** — Vite frontend and bundled server completed successfully. The build emitted only the existing large-chunk warning. |
| `git diff --check` | **PASS** — no whitespace errors. |
| Full `pnpm test --run` | **BLOCKED by connected development-schema drift** — 250/272 tests passed; 22 failures occurred in `server/appointments.test.ts` and `server/visitDb.test.ts`. |

The full-suite failures are not caused by the User Management changes. They fail while selecting the existing `appointments.appointmentSource` column, with the development database reporting `Unknown column 'appointmentSource'`/`Unknown column 'appointmentsource'`. This is a pre-existing schema-alignment problem in the connected development environment and must be reconciled through the normal forward-migration/fresh-schema process before claiming a green full suite. No migration was applied in this task.

## Browser acceptance

Interactive acceptance was not used as the source of truth for this security task. The dashboard/session environment has previously been inaccessible for the synthetic acceptance account, and the task requirement is to avoid changing real role permissions or production data merely to make that account display tabs. Evidence therefore relies on the passing focused server/router tests, static type check, build, and diff hygiene. No production database, production credentials, deployment, or external service was accessed.

## Known limitations and deferred work

The branch does not classify or delete users from the connected database because that database is not demonstrably disposable. A future cleanup run should use an isolated disposable database, produce a complete reference classification, retain at least one active administrator, and obtain explicit approval before any destructive operation.

Global session invalidation is not performed during password reset; the existing local session model remains in place. If an immediate revocation requirement is added later, it should be implemented as a separate, explicitly scoped session-version or token-revocation change with its own migration and tests.

The complete test suite remains blocked until the development database is reconciled with the current appointment schema. This report intentionally does not hide that failure, suppress it, remove the failing query, or add fallback values.

## Environment-variable names

No environment variables were added or changed. Existing platform-provided names remain applicable, including `DATABASE_URL`, `JWT_SECRET`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`, `OWNER_NAME`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_URL`, and `VITE_FRONTEND_FORGE_API_KEY`. No secret values are included in this report.

## Rollback procedure

Before checkpointing or handing off the branch, inspect the saved project version in the Management UI. To restore the prior stable implementation, use the project version history/rollback action or the corresponding checkpoint identifier; do not use a destructive Git reset. Database state is not reverted by a code rollback, and this task made no database changes.

## Final classification

**USER_MANAGEMENT_HARDENING_IMPLEMENTED_WITH_FULL_SUITE_BLOCKED_BY_PRE_EXISTING_SCHEMA_DRIFT**

The focused security and integrity behavior is implemented and validated. The task is not classified as fully complete because the connected development environment prevents a green full test suite and the database is not disposable for stale-user deletion.
