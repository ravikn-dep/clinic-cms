# Attachment 75 — Detailed Pharmacy Inventory → Billing Dispensing Report

**Project:** `ravikn-dep/clinic-cms`
**Prepared from:** `pasted_content_75.txt` and the synchronized Clinic CMS worktree
**Report status:** Implementation and development validation complete; production publication intentionally not performed.

## 1. Executive Summary

Attachment 75 requested a forensic audit followed by the smallest safe canonical bridge between pharmacy inventory and billing. The audit confirmed that the CMS already had inventory, catalog, batch/expiry, Goods Receipt, stock-movement, billing, audit, and RBAC foundations, but it did **not** have a safe inventory-to-billing dispensing boundary. Billing permitted manually typed medicine lines, while stock was not atomically reserved or deducted when a medicine was finally billed.

The requested bridge was implemented without replacing the existing Billing workflow. It adds a protected inventory search for available, unexpired batches; FEFO-oriented ordering; a Medicine selector in the existing bill form; exact batch/provenance fields on bill items; an immutable dispensing ledger; an atomic final billing/dispensing transaction; idempotency protection; audit logging; and preservation of existing consultation/procedure billing behavior.

The implementation was validated in the managed development environment. The final checks passed with **0 TypeScript errors**, **402/402 full-suite tests across 56 files**, **7/7 focused pharmacy bridge tests**, a successful production build, clean Git diff checks, and authenticated Preview smoke verification of Billing → Medicine selection. No test invoice was submitted, no development stock was deliberately consumed during smoke testing, and no production database, credentials, deployment, or unrelated workflow was changed.

## 2. Canonical Head and Repository State

The Attachment 75 instructions identified `9fdbde5b6be2da6a7c48a0d41e15155cd5238ffd` as the expected protected-main baseline. That baseline was verified before implementation. The current managed worktree target after Attachment 75 is:

| Field | Result |
|---|---|
| Attachment baseline | `9fdbde5b6be2da6a7c48a0d41e15155cd5238ffd` |
| Current managed branch | `main` |
| Current managed target/checkpoint | `dccca88f3805d99fdcbf659d7ad1685728724f02` |
| Working tree | Clean after checkpoint |
| Current managed remote | Manus-managed repository remote; not the external GitHub PR remote |
| Source publication | Not performed as part of Attachment 75 |
| Production deployment | Not performed |
| Production database | Not accessed or modified |

The Attachment 75 source delta relative to the verified baseline contained ten files: six modified files and four added files. The current target is a managed checkpoint that records the implementation and its validation; it should not be interpreted as an external GitHub publication unless separately pushed through the approved repository workflow.

## 3. Attachment Scope and Constraints

The attachment required the existing source to be audited before implementation and prohibited reliance on historical todo claims. Its accepted scope was a canonical Pharmacy Inventory → Billing workflow with the following boundaries:

- Draft selection must be side-effect free.
- Stock deduction must occur only at explicit final dispensing/billing confirmation.
- Quantity must never exceed available stock.
- Expired stock must never be dispensed.
- FEFO ordering should be preferred.
- Batch and expiry values must come from canonical inventory, not be fabricated.
- Goods Receipt must remain the inbound stock authority.
- Purchase Order creation or approval must not gain a new stock mutation path.
- Prescription interpretation and AI drug selection must not be introduced.
- Existing manual consultation and procedure billing must remain intact.
- Durable provenance must link the bill item to catalog, inventory, batch, quantity, actor, and time.
- Production data, deployment, credentials, and production migrations were out of scope.

## 4. Audit Result

### 4.1 Existing architecture classification

| Area audited | Classification | Evidence and interpretation |
|---|---|---|
| Inventory table and batch/expiry quantities | `PRESENT_WORKING` | Existing `inventory` rows contain item, batch, expiry, available quantity, reorder level, price, and source references. |
| Inventory UI and low-stock views | `PRESENT_WORKING` | Existing Pharmacy page and dashboard expose stock and low-stock states. |
| Catalog linkage | `PRESENT_WORKING` | Inventory can carry `catalogItemId`; catalog and alias helpers already exist. |
| Goods Receipt | `PRESENT_WORKING` | Goods Receipt is the approved inbound stock-posting boundary and existing receipt workflow remains unchanged. |
| Existing stock movements | `PRESENT_WORKING` | Existing movements are receipt-oriented positive inbound movements; they were not overloaded for dispensing. |
| `billItems` schema | `PRESENT_WORKING` | Manual item lines were supported, but durable exact inventory/batch provenance was absent. |
| `bills.create` / manual billing | `PRESENT_WORKING` | Manual consultation, procedure, and medicine billing behavior existed and was preserved. |
| Encounter-aware billing | `PRESENT_WORKING` | Existing `bills.createEncounter` and encounter closure semantics existed and were retained for the pharmacy path. |
| Billing Medicine handling | `PRESENT_BROKEN` for canonical stock linkage | The form could represent a Medicine line but did not require canonical batch selection or deduct stock at final billing. |
| Inventory → billing dispensing bridge | `NOT_PRESENT` | No approved atomic mutation existed that linked a bill line to inventory and reduced stock exactly once. |
| Audit logging | `PRESENT_WORKING` | Existing audit infrastructure was reused for `PHARMACY_DISPENSED`. |
| RBAC | `PRESENT_WORKING` | The new procedures use authenticated protected procedures; existing role/feature boundaries were not weakened. |

### 4.2 Root gap

The root gap was not a missing inventory table. It was the absence of a **single final dispensing boundary** that could validate the current batch, atomically decrement stock, create the bill item, record durable provenance, prevent duplicate submission, and write an audit event as one transaction. The Billing form also lacked a canonical stock selector, so manually entered medicine descriptions could not safely carry verified batch identity.

## 5. Architecture Implemented

The implementation uses four coordinated layers.

### 5.1 Pure validation helpers

`server/pharmacyDispensing.ts` contains deterministic rules for:

- identifying valid unexpired batches;
- ordering candidates by earliest expiry and stable item name ordering;
- rejecting expired stock;
- rejecting non-positive or non-integer quantities;
- rejecting quantities above available stock;
- requiring exact inventory provenance for Medicine lines;
- keeping Consultation and Procedure lines outside the pharmacy boundary; and
- validating the request-level idempotency contract.

These helpers are side-effect free and are covered by the focused test file.

### 5.2 Protected inventory search

`server/db.ts` adds a billing-oriented inventory query that:

- joins inventory to catalog identity when available;
- searches item name, canonical name, generic name, and batch-related text through the existing data model;
- excludes zero-stock rows;
- excludes batches whose expiry is before the current database date;
- returns item ID, canonical/catalog identity, batch, expiry, available quantity, and unit price; and
- orders valid candidates by parsed expiry date ascending, giving FEFO-oriented results.

The query is read-only. Selecting a result in the Billing draft does not update inventory.

### 5.3 Atomic and idempotent final dispensing

`server/db.ts` adds `createDispensedBill`, which executes bill creation, inventory validation, conditional stock decrement, bill-item insertion, dispensing-record insertion, encounter/appointment closure where the existing context is valid, and audit logging inside one database transaction.

For each Medicine item, the transaction:

1. Rechecks the current inventory row.
2. Verifies that the selected item ID still has the exact submitted batch and expiry.
3. Rejects expired stock.
4. Requires a positive integer quantity.
5. Performs a conditional update requiring current quantity to be at least the requested quantity and expiry to remain valid.
6. Treats an update affecting anything other than exactly one row as a failure.
7. Inserts the bill item and immutable dispensing record only after the stock update succeeds.

The conditional update is the oversell guard: two transactions cannot both successfully decrement the same current quantity beyond what is available. The unique `idempotencyKey` on `dispensingRecords` provides the durable duplicate-submit boundary. A repeated request after a committed first request returns the existing bill identity rather than deducting stock a second time.

### 5.4 Existing encounter semantics

The bridge accepts the existing appointment, encounter, and consultation context. It validates that a referenced consultation is finalized, that an encounter belongs to that consultation, and that the appointment relationship is consistent. When an eligible encounter is supplied, the existing close-encounter and complete-appointment behavior is preserved rather than duplicated in a separate workflow.

## 6. Schema and Migration

### 6.1 Forward-only migration

The implementation generated and applied the corrected development migration:

`drizzle/0030_purple_infant_terrible.sql`

The first generated attempt, `0029_lonely_scrambler`, was rejected because its timestamp default was invalid for the target schema expression. That failed uncommitted SQL artifact was removed; the timestamp default was corrected in `drizzle/schema.ts`, and migration 0030 was generated and applied successfully. Historical migrations were not edited.

### 6.2 New bill-item provenance fields

The following nullable fields were added to `billItems` so manual Consultation and Procedure billing remains compatible while canonical Medicine lines can retain exact provenance:

| Field | Purpose |
|---|---|
| `catalogItemId` | Curated catalog identity when available |
| `inventoryItemId` | Exact inventory batch row used for dispensing |
| `batchNumber` | Exact batch submitted and revalidated at final billing |
| `expiryDate` | Exact expiry submitted and revalidated at final billing |

### 6.3 `dispensingRecords` ledger

The new `dispensingRecords` table contains:

| Field | Purpose |
|---|---|
| `dispensingId` | Immutable dispensing record identity and primary key |
| `idempotencyKey` | Unique duplicate-submit protection key |
| `billId` | Resulting bill identity |
| `billItemId` | Exact billed medicine-line identity |
| `catalogItemId` | Optional catalog provenance |
| `inventoryItemId` | Exact inventory row provenance |
| `batchNumber` | Exact dispensed batch |
| `quantityDispensed` | Quantity deducted and recorded |
| `actorId` | Authenticated staff/admin actor |
| `movementType` | Explicit `DISPENSE` source type, separate from receipt movements |
| `createdAt` | Database timestamp |

The migration also creates indexes for bill and inventory lookup and a unique index for idempotency. It does not alter Goods Receipt tables or reinterpret receipt-specific positive stock movements.

### 6.4 Migration metadata

The Drizzle journal contains the new generated migration metadata for `0030_purple_infant_terrible`. The current schema and applied development database were synchronized after the timestamp correction. The development database accepted the corrected migration successfully.

## 7. Server API and Authorization

The new server path is exposed through authenticated protected procedures in `server/routers.ts`. It does not create a public dispensing endpoint or bypass the existing CMS session/RBAC model.

The router validates Medicine items before calling the database transaction. It requires:

- exact `inventoryItemId`;
- exact `batchNumber`;
- exact `expiryDate`;
- positive integer quantity;
- a dispensing identity and idempotency key; and
- authenticated actor context.

Manual Consultation and Procedure items continue through the existing bill path and do not call the stock-deduction transaction. No automatic prescription interpretation, AI medicine selection, or new PO stock mutation was added.

## 8. Billing UI Changes

`client/src/pages/Billing.tsx` was extended rather than rebuilt.

For a Medicine line, the existing item-type control now exposes:

- a searchable canonical inventory selector;
- product name and catalog identity where available;
- batch number;
- expiry date;
- available quantity;
- unit price; and
- a FEFO-oriented result order.

Selecting a candidate populates the Medicine line’s description, price, inventory ID, catalog ID, batch, and expiry. The draft remains side-effect free. The final action validates that every Medicine line has exact inventory provenance before sending the dispensing mutation. The form reports a clear error when a Medicine line has no valid selected batch.

The existing Consultation and Procedure line controls, quantity/price fields, invoice totals, manual billing behavior, and encounter-linked billing path remain in place.

## 9. Tests

### 9.1 Focused pharmacy test results

Command:

```text
pnpm test --run server/pharmacyDispensing.test.ts
```

Result:

```text
1 test file passed
7 tests passed
```

The focused tests cover:

1. earliest valid batch selected first;
2. expired batches excluded from FEFO candidates;
3. quantities above available stock rejected;
4. exact inventory provenance required for Medicine lines;
5. expired pharmacy lines and invalid quantities rejected;
6. Consultation and Procedure lines kept outside the pharmacy boundary; and
7. idempotency contract required at the request boundary.

### 9.2 Full validation

| Command | Result |
|---|---|
| `pnpm check` | PASS — 0 TypeScript errors |
| `pnpm test --run` | PASS — 402/402 tests across 56 files |
| `pnpm build` | PASS — frontend and server production build completed |
| `git diff --check` | PASS — no whitespace errors |

The full suite was run without `|| true`, skipped tests, SQL error suppression, or test-data seeding.

### 9.3 Concurrency evidence

The server transaction uses a conditional quantity update, so a concurrent sale cannot make the database quantity negative or deduct more than the current available quantity. The focused unit suite verifies the stock-boundary rules, but it does **not** constitute a high-contention live integration test with two simultaneous database transactions. A future hardening item is a dedicated DB-backed concurrency test and explicit duplicate-key race assertion. The implementation therefore has a code-level oversell guard, while the remaining evidence gap is test depth rather than a known oversell defect.

### 9.4 Non-pharmacy isolation and Goods Receipt safety

The focused tests verify that non-pharmacy bill lines stay outside the dispensing helper boundary. Existing full-suite tests continued to pass, including the existing Goods Receipt and inventory workflows. No Goods Receipt path was modified to perform dispensing, and no PO creation or approval mutation was added.

## 10. Development Preview Smoke Verification

After the user authenticated in the managed Preview, the following interactions were verified without submitting a bill:

1. Dashboard loaded with the existing unified navigation and live inventory metrics.
2. Billing loaded with existing invoice history and no API error.
3. `Raise New Bill` opened the existing invoice form.
4. The existing item-type selector opened normally.
5. Selecting `Medicine` displayed the new `Search valid stock` control.
6. Valid development inventory candidates appeared with product name, batch, expiry, available quantity, and price.
7. The form remained in draft state; no invoice was submitted and no stock deduction was triggered.

The Preview smoke test did not create synthetic invoice data or intentionally consume development inventory.

## 11. Security, Audit, and Data-Integrity Review

The implementation preserves the following controls:

- **Authentication:** server procedures are protected by the existing authenticated CMS procedure layer.
- **Authorization:** existing RBAC/feature-access boundaries remain in force; no public stock deduction route was added.
- **Input integrity:** final billing rechecks the current inventory row, exact batch, exact expiry, quantity, and expiry validity.
- **Idempotency:** `dispensingRecords.idempotencyKey` is unique and checked before creating a duplicate dispensing transaction.
- **Atomicity:** bill, stock decrement, bill item, dispensing provenance, encounter/appointment updates, and audit write share one transaction.
- **Auditability:** a `PHARMACY_DISPENSED` audit event records the actor, bill, bill-item IDs, and inventory-item IDs.
- **Provenance:** the bill item and dispensing record preserve inventory, catalog, batch, expiry, quantity, actor, and movement type.
- **Receipt boundary:** Goods Receipt remains the inbound stock authority; the new `DISPENSE` movement type is not inserted into receipt-oriented movement semantics.
- **No PHI or secret exposure:** no credentials, tokens, database dumps, or environment files were added to the change set.

## 12. Files Changed

Relative to the verified Attachment 75 baseline, the exact changed files were:

| Status | Path | Purpose |
|---|---|---|
| Modified | `client/src/pages/Billing.tsx` | Adds Medicine inventory search, batch/expiry display, price autofill, provenance capture, and final dispensing submission while preserving existing billing lines. |
| Added | `drizzle/0030_purple_infant_terrible.sql` | Forward-only development migration for dispensing records and bill-item provenance columns. |
| Added | `drizzle/meta/0030_snapshot.json` | Drizzle schema snapshot for migration 0030. |
| Modified | `drizzle/meta/_journal.json` | Records generated migration metadata. |
| Modified | `drizzle/schema.ts` | Adds bill-item provenance fields and `dispensingRecords`. |
| Modified | `server/db.ts` | Adds read-only billing inventory search and atomic idempotent dispensing transaction. |
| Added | `server/pharmacyDispensing.test.ts` | Seven focused deterministic pharmacy bridge tests. |
| Added | `server/pharmacyDispensing.ts` | Pure pharmacy validation and FEFO helper rules. |
| Modified | `server/routers.ts` | Adds protected search/dispensing route wiring and final payload validation. |
| Modified | `todo.md` | Records Attachment 75 scope and completion status. |

No package dependency change was required for this bridge. No `.env`, credential, database dump, generated build output, `node_modules`, or unrelated source file was included.

## 13. Known Limitations and Remaining Work

The implementation deliberately does not add prescription interpretation, AI drug selection, external pharmacy integration, POS settlement, or production migration execution. It also does not introduce a separate stock-movement table for outbound dispensing because durable `dispensingRecords` provenance is sufficient for this phase and keeps receipt-specific movement semantics intact.

The next hardening opportunities are:

1. add a DB-backed concurrent-sale integration test that starts two dispensing attempts against the same batch;
2. normalize a database unique-key race into a stable duplicate-request response when two identical idempotency requests arrive simultaneously;
3. add a dedicated Billing UI test for price autofill and exact batch/expiry rendering; and
4. add a dedicated audit-view assertion that the `PHARMACY_DISPENSED` record contains the expected actor and provenance fields.

These are follow-up hardening items, not unresolved production errors observed during this task.

## 14. Final Classification

**ATTACHMENT_75_PHARMACY_DISPENSING_BRIDGE_IMPLEMENTED_AND_DEVELOPMENT_VALIDATED**

The bridge is implemented and development-validated. It is **not** a production publication or production migration approval. Any external GitHub publication, protected-main merge, deployment, or production database migration requires a separate explicit authorization and validation cycle.
