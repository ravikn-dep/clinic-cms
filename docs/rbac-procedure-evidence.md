# Backend RBAC Procedure Evidence

This document records the exact backend authorization boundaries reviewed before the final checkpoint. It distinguishes **authenticated clinic-user procedures** from **admin-only procedures** and identifies where protected PHI artifact access is audited.

## Middleware Semantics

The backend uses two tRPC authorization wrappers. `protectedProcedure` requires an authenticated session and returns `UNAUTHORIZED` when no current user is present. `adminProcedure` requires an authenticated user whose role is `admin` and returns `FORBIDDEN` otherwise. These semantics are implemented in `server/_core/trpc.ts` at lines 13-28 for authenticated access and lines 30-45 for admin-only access.

| Wrapper | Enforcement | Reviewed Source |
|---|---|---|
| `protectedProcedure` | Requires `ctx.user`; unauthenticated requests are rejected. | `server/_core/trpc.ts:13-28` |
| `adminProcedure` | Requires `ctx.user.role === "admin"`; non-admin users are rejected. | `server/_core/trpc.ts:30-45` |

## Procedure-Level Authorization Map

The router was reviewed for all visible clinical, billing, export, file-access, and audit-log procedures. The table below records the intended boundary and the exact procedure reference.

| Domain | Procedure | Boundary | Evidence |
|---|---|---|---|
| Patients | `patients.register` | Authenticated clinic user | `server/routers.ts:53` |
| Patients | `patients.getAll` | Authenticated clinic user | `server/routers.ts:133` |
| Patients | `patients.exportCsv` | Admin only | `server/routers.ts:137` |
| Patients | `patients.getById` | Authenticated clinic user | `server/routers.ts:166` |
| Patients | `patients.search` | Authenticated clinic user | `server/routers.ts:182` |
| Consultations | `consultations.uploadAudio` | Authenticated clinic user | `server/routers.ts:201` |
| Consultations | `consultations.create` | Authenticated clinic user | `server/routers.ts:232` |
| Consultations | `consultations.transcribeAndParse` | Authenticated clinic user | `server/routers.ts:252` |
| Consultations | `consultations.finalize` | Authenticated clinic user | `server/routers.ts:345` |
| Consultations | `consultations.getById` | Authenticated clinic user | `server/routers.ts:372` |
| Consultations | `consultations.getByPatientId` | Authenticated clinic user | `server/routers.ts:378` |
| Inventory | `inventory.add` | Authenticated clinic user | `server/routers.ts:387` |
| Inventory | `inventory.getAll` | Authenticated clinic user | `server/routers.ts:437` |
| Inventory | `inventory.getLowStock` | Authenticated clinic user | `server/routers.ts:441` |
| Inventory | `inventory.update` | Authenticated clinic user | `server/routers.ts:447` |
| Billing | `bills.create` | Authenticated clinic user | `server/routers.ts:495` |
| Billing | `bills.getAll` | Authenticated clinic user | `server/routers.ts:610` |
| Billing | `bills.getById` | Authenticated clinic user | `server/routers.ts:624` |
| Billing | `bills.getByPatientId` | Authenticated clinic user | `server/routers.ts:632` |
| Billing | `bills.exportCsv` | Admin only | `server/routers.ts:638` |
| Billing | `bills.updatePaymentStatus` | Authenticated clinic user | `server/routers.ts:691` |
| Files | `files.getArtifactLink` | Authenticated clinic user with audit logging | `server/routers.ts:717-744` |
| Audit Logs | `auditLogs.getAll` | Admin only | `server/routers.ts:746-750` |
| Audit Logs | `auditLogs.getByUserId` | Authenticated clinic user | `server/routers.ts:754` |
| Notifications | `notifications.markAsRead` | Authenticated clinic user | `server/routers.ts:760` |

## UI Alignment Evidence

The frontend mirrors the backend boundaries for the most sensitive admin-only surfaces. The Audit Trail navigation item is hidden for non-admin users in `client/src/components/DashboardLayout.tsx`, direct navigation to `/audit` is guarded in `client/src/App.tsx`, and the billing CSV export controls are rendered only for authenticated admin users in `client/src/pages/Billing.tsx`. These UI gates are not treated as security controls by themselves; the backend `adminProcedure` remains the authoritative enforcement layer for exports and full audit-log listing.

## Conclusion

The reviewed backend surface separates authenticated clinic workflows from admin-only export and audit-log operations. Patient CSV export, billing CSV export, and full audit-log listing are enforced by `adminProcedure`. Clinical workflows, billing creation, billing payment updates, inventory operations, notifications, and protected artifact retrieval require authenticated sessions through `protectedProcedure`. Protected artifact retrieval also records `PHI_FILE_ACCESS` audit events before returning short-lived access metadata.
