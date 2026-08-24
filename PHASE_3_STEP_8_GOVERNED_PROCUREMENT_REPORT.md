# Phase 3 Step 8 — Governed Procurement and Inventory Posting

**Status:** Implementation and isolated validation complete on `feature/phase3-step8-governed-procurement`. This report describes the feature branch only. No production database, deployed application, gateway configuration, OCR provider, or historical migration was changed.

## Implemented Workflow

| Workflow stage | Governed behavior |
|---|---|
| Vendor Master | Administrators can create and activate/deactivate verified vendors. The server normalizes vendor names and GSTINs, rejects duplicate normalized identities, and audits lifecycle changes. |
| OCR and review | OCR/parser values remain reviewable evidence. Resolution is read-only and never creates or silently updates a Vendor Master record. A user must explicitly select an active Vendor Master before PO submission. |
| PO creation | Both manual and reviewed-extraction creation paths require an active `vendorId`. The server validates the link, rejects a GSTIN conflict, preserves the reviewed PO snapshot, and creates only `Pending Approval` POs. |
| Approval/rejection | The admin-only procedures use a per-PO transaction lock, recheck `Pending Approval`, record server-derived actor/timestamp/audit/history evidence, and do not post inventory. |
| Goods Receipt | Receipt posting remains an approved-PO-only action. The transaction serializes by PO, rejects duplicate GR IDs, duplicate line IDs, over-receipt, invalid batch/expiry, and unresolved catalog lines. It writes receipt, receipt lines, PO received quantities, catalog-aware inventory, stock movements, history, and audit together. |
| Inventory identity | Inventory matching uses accepted catalog identity plus batch and expiry. A matching legacy free-text row is not silently merged; it requires explicit catalog reconciliation. |

## Schema and Migration

Migration `drizzle/0024_soft_aqueduct.sql` is additive only. It adds the `procurementPostingLocks` table, Vendor Master normalized identity and bank-detail columns, PO-to-vendor linkage, catalog identity provenance on inventory/stock movements, and supporting indexes/unique protection. The generated Drizzle journal and snapshot are included.

The deterministic baseline `drizzle/baseline/current_schema.sql` and strict `scripts/bootstrap_baseline.ts` assertions were updated for all 29 tables, the new posting-lock primary key, Step 8 columns, catalog/batch/expiry uniqueness, and required Vendor Master/PO indexes. Historical migrations `0000`–`0023` were not edited.

## Validation Evidence

| Check | Result |
|---|---|
| TypeScript | `pnpm check` passed with zero errors. |
| Focused governed-procurement regression | 43 tests passed across procurement policy, Vendor Master authorization, PO lifecycle, reviewed evidence, and catalog matching suites. |
| Full regression | `pnpm test --run` passed: **247/247** tests across 30 files. |
| Production build | `pnpm build` passed. The bundler reported only its pre-existing large-chunk advisory. |
| Diff hygiene | `git diff --check` passed. |
| Fresh deterministic bootstrap | `pnpm db:bootstrap` passed against an empty isolated MySQL 8.0.46 database: 153 SQL statements, 29 required tables, all strict PK/unique/index/column assertions. |
| Fresh forward migration | Canonical pre-Step-8 baseline plus `0024_soft_aqueduct.sql` applied with no SQL errors on a separate empty isolated MySQL 8.0.46 database. Verification returned one posting-lock table, six added columns, and four supporting indexes/constraints. |

## Controls Preserved

The implementation preserves authenticated procedures, server-side feature checks, admin-only Vendor Master writes and PO approval/rejection, explicit human PO and receipt actions, OCR review requirements, catalog confirmation, immutable receipt/stock provenance, no implicit stock update on PO creation or approval, safe error boundaries, and no raw OCR/provider material in audit records.

## Deliberate Limits and Next Verification

The managed development database is known to be structurally behind canonical schema and was not reset, force-migrated, or used for this feature. Accordingly, no interactive authenticated browser acceptance test was claimed from that stale environment. Before a release decision, run the protected CI workflow and then perform a disposable-development-data UI check covering Vendor Master creation, explicit PO vendor selection, admin approval, partial receipt, duplicate receipt retry, and no OCR-only mutation.

No merge, tag, deployment, force push, production connection, production migration, or production data change has been performed.
