# User Management Hardening — Publication Report

## Classification

> **USER_MANAGEMENT_HARDENING_GITHUB_VALIDATED**

The validated User Management hardening was published to the requested GitHub feature branch and passed the required protected CI gate. The change was not merged, tagged, deployed, or applied to production.

## Repository and source fidelity

| Item | Evidence |
|---|---|
| Repository | [`ravikn-dep/clinic-cms`](https://github.com/ravikn-dep/clinic-cms) |
| Canonical base | `25f0aae1b73af54ec741c8736dd5964977be6a86` |
| Feature branch | `feature/user-management-cleanup` |
| Implementation commit | `57a646a947bdea37ee650ef2b5eb1fe7098a16a0` |
| Commit message | `feat(users): harden user management and admin password reset` |
| Pull request | [#13 — User Management: admin password reset and lifecycle hardening](https://github.com/ravikn-dep/clinic-cms/pull/13) |
| Working-tree state after commit | Clean |
| Local/remote branch state | Synchronized at `57a646a947bdea37ee650ef2b5eb1fe7098a16a0` |

The canonical base is an ancestor of the implementation commit. The committed delta contains eight validated files: `client/src/pages/ChangePassword.tsx`, `client/src/pages/UserManagement.tsx`, `server/_core/sdk.ts`, `server/db.ts`, `server/routers.ts`, `server/userManagement.test.ts`, `USER_MANAGEMENT_CLEANUP_AND_ADMIN_PASSWORD_REPORT.md`, and `todo.md`. No schema migration was included.

## Security scope published

The branch contains admin-only user creation, editing, activation/deactivation, and password reset; server-side bcrypt hashing; no plaintext password or password-hash exposure; inactive-user login rejection; historical-reference deletion protection; last-active-administrator protection; consultant/staff role integrity; and preserved self-service password changes. Focused tests also assert no clinical, procurement, goods-receipt, inventory, or stock-movement mutation from User Management operations.

## Protected CI evidence

The required workflow [`CI Validation`](https://github.com/ravikn-dep/clinic-cms/actions/workflows/ci.yml) ran against the exact final PR head `57a646a947bdea37ee650ef2b5eb1fe7098a16a0`.

| Gate | Result |
|---|---|
| Workflow run | [32924275223](https://github.com/ravikn-dep/clinic-cms/actions/runs/32924275223) |
| Required job | `validate` — job `98043853575` |
| CI conclusion | **SUCCESS** |
| Fresh MySQL 8 baseline bootstrap | PASS |
| TypeScript check | PASS — zero errors |
| Unit tests | PASS |
| Production build | PASS |

The CI run completed in approximately 1 minute 36 seconds. GitHub emitted only a Node.js 20 deprecation annotation for action versions; it was not a validation failure.

## Local validation evidence

The coherent isolated User Management worktree passed the following before publication:

| Command | Result |
|---|---|
| `pnpm check` | PASS — zero TypeScript errors |
| `pnpm test --run server/userManagement.test.ts` | PASS — 10/10 |
| `pnpm test --run` | PASS — 34 files, 272/272 |
| `pnpm build` | PASS |
| `git diff --check` | PASS |

The intermittent historical `featureAccess` stall was investigated with bounded runs and read-only TiDB diagnostics. Three consecutive isolated runs passed 11/11 each. No speculative repair was retained, no assertions were weakened, and no RBAC semantics were changed.

## Actions explicitly not taken

No users were deleted or deactivated. No production database was accessed or modified. No merge, tag, deployment, force-push, or production credential change was performed. The stable pre-ThreeUI UI was not reintroduced or changed by this publication.

## Final state

The User Management hardening is **published and protected-CI validated on PR #13**, but remains unmerged as instructed. The next action is user-controlled review and merge through the repository’s protected workflow; no merge was attempted automatically.
