# Phase 3 Step 5 — Supplier Catalog Matching & Safe Item Resolution

## Scope and Canonical Starting Point

This implementation starts from canonical GitHub main commit `8ef89a9338a37a59dc7ec4872b68e65cfc5a7e8e`, the merged Phase 3 Step 4 baseline. It introduces **deterministic, read-only catalog suggestions** within the existing Scan PO review experience. It does not introduce an LLM, product enrichment service, automatic catalog learning, or automatic item mapping.

> **Safety boundary:** OCR, parsing, catalog suggestion, image re-scan, review editing, and cancellation do not create or alter a Purchase Order, catalog record, inventory record, Goods Receipt, stock movement, or vendor alias. A catalog link is created only when a human accepts a conflict-free suggestion and explicitly submits the reviewed PO.

## Implemented Catalog Model

| Table / field | Purpose | Safety property |
|---|---|---|
| `catalogItems` | Curated canonical product identity with name, normalized name, generic/brand fields, strength, dosage form, manufacturer, HSN, GST rate, and active state. | Separate from batch-centric inventory; OCR cannot create catalog records. |
| `catalogItemAliases` | Controlled global or vendor-specific aliases linked to a catalog item. | Composite uniqueness on `vendorId + normalizedAlias`; no automatic alias-learning endpoint. |
| `purchaseOrderItems.catalogItemId` | Nullable human-confirmed catalog link. | Remains unset for unmatched or unconfirmed lines. |
| `purchaseOrderExtractionReviews.catalogResolutionsJson` | Immutable reviewed-evidence snapshot of catalog resolutions. | Stores extracted and reviewed descriptions, chosen catalog identity, match reasons/conflicts, decision, and confirmation time. |

The additive migration is `drizzle/0022_motionless_quicksilver.sql`. The deterministic baseline and fail-closed bootstrap verification include both catalog tables plus their primary keys and required unique indexes.

## Deterministic Matching and Human Confirmation

`catalogMatching.suggestMatches` is authenticated, feature-gated, and read-only. It normalizes case, whitespace, punctuation, controlled dosage abbreviations, and common units. Suggestions are returned as `EXACT`, `STRONG`, or `POSSIBLE` with textual reasons and conflicts; numeric scores are neither generated nor rendered.

Canonical names, active global aliases, and vendor-specific aliases are considered deterministically. Exact normalized names and aliases can be surfaced first, but are never auto-selected. HSN agreement adds a reason; HSN mismatch, strength mismatch, dosage-form mismatch, modified-release mismatch, and equal-rank ambiguity produce conflicts. Conflicted or ambiguous suggestions are displayed for review but cannot be accepted through the submission API.

The user can explicitly select any eligible suggestion or keep a line unmatched. Editing the reviewed description or HSN clears the prior catalog decision. At explicit PO submission, the server recomputes the current candidate and rejects an accepted selection that is no longer safe. It derives the stored extracted value, reviewed value, reasons, conflicts, reviewer timestamp, and immutable catalog-resolution evidence server-side.

## Purchase Order and Evidence Behavior

`purchaseOrders.createFromReviewedExtraction` preserves the existing `Pending Approval` PO workflow. It writes the PO, line items, immutable extraction evidence, audit record, and PO history in one transaction. Accepted item links are nullable metadata on the new PO items; no Goods Receipt, inventory adjustment, stock movement, vendor update, or catalog/alias write occurs in this transaction.

The existing `purchaseOrders.create` path remains unchanged for manual POs. The Step 4 reviewed-evidence path without catalog decisions remains compatible and does not query catalog tables.

## Tests and Local Validation

| Command | Result |
|---|---|
| `pnpm check` | Passed with 0 TypeScript errors. |
| `pnpm test --run server/catalogMatching.test.ts` | Passed: 8/8 Step 5 catalog matching tests. |
| `pnpm test --run` | Passed: 25 files and 209/209 tests. |
| `pnpm build` | Passed. |
| `git diff --check` | Passed. |

The Step 5 regression tests cover normalized exact matching, global and vendor aliases, HSN support, strength/dosage conflicts, equal-rank ambiguity, no-match behavior, no mutation during suggestion, explicit acceptance, explicit unmatched decisions, immutable extracted/reviewed provenance, Pending Approval preservation, no inventory/GR mutation, access denial, and migration uniqueness constraints.

## Known Limitations

The new catalog is intentionally empty until authorized users curate entries through a future catalog-management workflow or controlled administrative data process. Inventory records remain unsuitable as a catalog source of truth because they are batch-specific. Supplier/vendor resolution is not expanded beyond optional curated vendor aliases. PDF OCR remains deferred; Scan PO continues to support JPEG and PNG inputs only.

## Local Classification

**`PHASE3_STEP5_SUPPLIER_CATALOG_MATCHING_IMPLEMENTED`** — implementation and local validation are complete. This classification may be upgraded only after the feature branch is pushed and the protected CI workflow completes a fresh MySQL 8 baseline bootstrap/schema verification, type check, full test suite, and production build.
