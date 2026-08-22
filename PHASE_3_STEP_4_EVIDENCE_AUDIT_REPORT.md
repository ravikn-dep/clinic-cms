# Phase 3 Step 4 — PO OCR / Parser Review Evidence & Audit Persistence

## Scope and Boundary

This implementation starts from canonical GitHub main commit `9d2004c5e1d8b7702c3108ebc85c7c2102e51529`. It persists evidence **only** when an authenticated user explicitly submits the reviewed Purchase Order form. OCR extraction, deterministic parsing, editing the review model, uploading a different image, and cancelling the dialog remain non-mutating operations.

The submitted Purchase Order is always created with `paymentStatus = Pending` and `approvalStatus = Pending Approval`. The reviewed-extraction path does not approve a PO, create a Goods Receipt, modify inventory, or create stock movements.

## Implemented Evidence Record

The additive `purchaseOrderExtractionReviews` table is linked one-to-one with a purchase order through a unique `purchaseOrderId`. It has a primary key (`reviewId`) and a unique client submission identifier (`reviewSubmissionId`) to reject duplicate/replayed reviewed submissions. The table is append-only in application behavior: there are no update or delete procedures.

| Evidence component | Stored form | Purpose |
|---|---|---|
| Extracted header, totals, and line items | Separate structured JSON text columns | Preserves the extracted value, parser `sourceText` where available, qualitative confidence, and field warnings. |
| Reconciliation and review warnings | Separate structured JSON text columns | Preserves deterministic arithmetic outcome without silently normalizing it. |
| Corrections | Structured `{ field, extractedValue, finalValue }` entries | Records exactly which supported fields changed before submission. |
| Final reviewed values | Separate structured JSON text column | Reflects the server-validated PO submission values for vendor name, GSTIN, item name, quantity, and unit price. |
| Reviewer and provider metadata | Dedicated columns | Captures authenticated reviewer identity, safe provider label, status, timestamps, and document type. |

Raw OCR `fullText` is deliberately excluded. The persisted provider label is constrained to `google-cloud-vision` or `mock-ocr`; no credential, filesystem, quota, or raw SDK error information is accepted.

## Write, Read, and Consistency Design

`purchaseOrders.createFromReviewedExtraction` validates the explicit PO fields, review snapshot, UUID replay key, and provider label. The server derives the PO ID, reviewer ID/name, review status, and `Pending Approval` status; client-provided identities and approval values are not part of the input contract.

`createPurchaseOrderWithItemsAndExtractionReview` uses a single database transaction to insert the PO, its line items, the immutable evidence record, an audit log, and a purchase-order history event. A failed transaction returns a safe error and does not trigger stock/inventory work. `purchaseOrders.getExtractionReview` is an authenticated, feature-gated, read-only retrieval procedure.

## Schema and Bootstrap

The forward-only migration is `drizzle/0021_persist_reviewed_extraction_evidence.sql`. The deterministic fresh-database baseline (`drizzle/baseline/current_schema.sql`) now includes the same table, primary key, unique constraints, and reviewer-time index. `scripts/bootstrap_baseline.ts` now requires the table and verifies its primary key plus PO and submission uniqueness.

No historical migration was rewritten. No migration has been applied to a production or development database from this worktree.

## Local Validation

| Command | Result |
|---|---|
| `pnpm check` | Passed with 0 TypeScript errors. |
| `pnpm test --run server/ocr.test.ts` | Passed: 10/10 Step 1 OCR tests. |
| `pnpm test --run server/poParsing.test.ts` | Passed: 6/6 Step 2 parser tests. |
| `pnpm test --run server/poReviewPrefill.test.ts` | Passed: 6/6 Step 3 review-prefill tests. |
| `pnpm test --run server/poEvidenceAudit.test.ts` | Passed: 10/10 Step 4 evidence-audit tests. |
| `pnpm test --run` | Passed: 24 files and 201/201 tests. |
| `pnpm build` | Passed. |

The required fresh MySQL 8 baseline bootstrap and schema verification will execute through the protected canonical pull-request CI workflow before final validation classification.

## Known Limitations

The evidence system preserves field-level provenance where the deterministic parser supplies it; it does not preserve raw full-document OCR text. PDF OCR remains deferred and JPEG/PNG remain the supported Scan PO input types. PO fields not represented in the existing PO schema are retained as review evidence only and are not fabricated into PO/inventory columns.

## Local Classification

**`PHASE3_STEP4_EVIDENCE_AUDIT_IMPLEMENTED`** — source implementation and local validation are complete. This may be upgraded to `PHASE3_STEP4_EVIDENCE_AUDIT_GITHUB_VALIDATED` only after the canonical branch is pushed and the required fresh-MySQL CI validation passes.
