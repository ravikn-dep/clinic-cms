# STEP 2 REPORT — Purchase Order to Goods Receipt Remediation

**Repository:** `ravikn-dep/clinic-cms`  
**Canonical branch:** `main`  
**Starting local HEAD:** `b532b89aea1f7401c910a2ddb9a3ea7319b50a4c`  
**Source attachment:** `/home/ubuntu/upload/pasted_content_7.txt`  
**Deployment:** None  
**Production database:** Not connected or modified

## Final Classification

**BLOCKED**

Implementation was stopped before any Step 2 application code or database migration was applied because migration generation exposed a historical migration-state inconsistency. The attachment explicitly requires stopping if historical migration ambiguity reappears.

## 1. Attachment Review Summary

The attachment requests a corrected Purchase Order lifecycle:

> PO CREATED → PENDING APPROVAL → ADMIN APPROVAL → GOODS PHYSICALLY RECEIVED → BATCH / EXPIRY / QUANTITY VERIFIED → GOODS RECEIPT POSTED → INVENTORY UPDATED

The required changes are to enforce `Pending Approval` server-side, remove inventory mutations from PO creation and approval, add an explicit authenticated Goods Receipt operation, prevent duplicate receipt posting, preserve independent medicine batches, record stock movements, reject fabricated batch/expiry values, support safe partial receipts, enforce server-side permissions, rewrite unsafe tests, and validate against ephemeral MySQL. The attachment also prohibits general UI redesign, Google Cloud Vision, Phase-A external API changes, unrelated refactors, production changes, automatic deployment, and silent test skipping.

## 2. Current Findings

The current PO creation procedure in `server/routers.ts` accepts an optional client-supplied `approvalStatus` and conditionally persists an immediately approved PO. The same procedure mutates inventory during PO creation and fabricates `batchNumber` and `expiryDate` values. The current approval procedure changes PO state and writes audit/history records but does not contain an inventory mutation path. The current `inventory` table already stores `itemName`, `batchNumber`, `expiryDate`, and quantity, but it lacks receipt provenance and durable stock-movement records. The current schema has no Goods Receipt, receipt-line, cumulative PO-receipt, or stock-movement entities. The legacy `server/poInventoryAuto.test.ts` encodes the prohibited auto-inventory and fabricated-data behavior and would require replacement.

## 3. Intended Architecture Changes

If the migration history is reconciled, the smallest safe Step 2 design is:

| Area | Intended change |
|---|---|
| PO creation | Ignore client approval state and always write `Pending Approval`. |
| PO approval | Keep approval admin-only and limit it to PO state plus audit/history. |
| Goods Receipt | Add a separate authenticated operation that accepts an approved PO and explicit receipt lines. |
| Receipt identity | Use a stable unique `goodsReceiptId`; reject duplicate receipt IDs. |
| Partial receipt | Track cumulative received quantities per PO item and reject over-receipt. |
| Batch-aware inventory | Keep distinct item/batch/expiry rows separate; merge only the same item and batch/expiry where appropriate. |
| Audit | Record item, batch, quantity before/after, PO, receipt, actor, and timestamp in a stock movement table. |
| UI | Add only a minimal approved-PO Receive Stock dialog with ordered, previously received, remaining, quantity, batch, expiry, and confirmation. |

## 4. Blocking Migration Finding

A temporary schema edit was used only to test migration generation. The generated forward migration was `drizzle/0019_sour_the_liberteens.sql`. It unexpectedly included creation of `externalRequestReplays` and its index before the intended Step 2 changes:

```sql
CREATE TABLE `externalRequestReplays` (...);
ALTER TABLE `inventory` ADD `sourcePurchaseOrderId` varchar(50);
ALTER TABLE `inventory` ADD `sourceGoodsReceiptId` varchar(50);
ALTER TABLE `purchaseOrderItems` ADD `receivedQuantity` int DEFAULT 0 NOT NULL;
CREATE INDEX `externalRequestReplays_createdAt_idx` ON `externalRequestReplays` (`createdAt`);
```

The current TypeScript schema defines `externalRequestReplays`, but the existing migration journal ends at `0018_uneven_callisto`; no historical SQL migration in the repository defines `externalRequestReplays`. Therefore, the generated migration would silently combine historical Phase-A schema reconciliation with the new Step 2 schema change. Applying it without explicit reconciliation could create an incorrect migration chain or duplicate/partial production schema changes.

The temporary generated migration, its snapshot, and the journal entry were removed without applying SQL. The current working tree retains only the pre-existing CI workflow change and the Step 2 TODO additions; no Step 2 schema migration was applied.

## 5. Migration Status

| Item | Result |
|---|---|
| Historical migrations changed | No |
| New Step 2 migration applied | No |
| `webdev_execute_sql` used | No |
| Production database connected | No |
| Production data changed | No |
| Deployment performed | No |
| Step 2 application code applied | No |

## 6. Validation Status

The full Step 2 validation suite was not run because implementation was stopped at the migration-safety gate. Existing Step 1 baseline evidence remains separate from this blocked Step 2 attempt; it must not be reused as evidence that Step 2 is complete.

## 7. Required Resolution Before Applying Step 2

The migration chain must first be reconciled by determining whether the `externalRequestReplays` table was intended to be introduced by a missing/unpushed historical migration or whether it must be represented by a new forward-only reconciliation migration. That decision must preserve the existing journal numbering, avoid modifying historical migrations, and be explicitly reviewed before any Step 2 migration is generated or applied. Only after that reconciliation may the Goods Receipt schema and lifecycle implementation proceed.

## 8. Files Reviewed

- `server/routers.ts`
- `server/db.ts`
- `drizzle/schema.ts`
- `drizzle/meta/_journal.json`
- `server/poInventoryAuto.test.ts`
- `server/poApproval.test.ts`
- `client/src/pages/PurchaseOrders.tsx`
- `pasted_content_7.txt`

## 9. Files Changed During This Attempt

- `todo.md`: added the Step 2 remediation checklist and scope guardrails.
- `STEP_2_REPORT.md`: added this blocker report.

The temporary schema edits and generated migration artifacts were reverted/removed before stopping. No Step 2 production logic was left partially applied.

## 10. Recommended Next Step

Resolve the historical `externalRequestReplays` migration discrepancy first. After explicit reconciliation, restart Step 2 from the unchanged PO/inventory implementation baseline, then implement and validate the Goods Receipt lifecycle in a forward-only migration.

**Do not proceed to Step 3 automatically.**
**Do not implement Google Cloud Vision in this task.**
**Do not deploy automatically.**

## Final Classification

**BLOCKED**

This classification is based on the attachment’s explicit migration-safety rule, not on a production database failure. 

---

## References

[1]: `/home/ubuntu/upload/pasted_content_7.txt` "User-provided Step 2 remediation instructions"
[2]: `server/routers.ts` "Current Purchase Order router implementation"
[3]: `drizzle/schema.ts` "Current Drizzle schema"
[4]: `drizzle/meta/_journal.json` "Current Drizzle migration journal"
[5]: `server/poInventoryAuto.test.ts` "Legacy unsafe PO/inventory expectations"
[6]: `client/src/pages/PurchaseOrders.tsx` "Current Purchase Orders UI"

> Note: References [2]–[6] are repository files reviewed locally; no external service or production database was accessed.

---

## Step 2 TODO State

The Step 2 implementation checklist in `todo.md` remains pending because the migration-safety gate blocked application. Existing unrelated pending work in the repository was not rewritten or marked complete.

---

## Safety Statement

No production database connection, production schema change, external service connection, automatic deployment, or Phase-A external API modification was performed during this attempt.

---

## Handoff

Await explicit migration reconciliation and review before continuing Step 2.
