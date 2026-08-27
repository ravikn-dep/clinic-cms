# Phase 3 Step 3: Corrective Scan PO Review & Safe Structured Prefill

## Status

The prior Step 3 checkpoint `32834ed` was rejected as documentation-only and is **not** used as an implementation source. This corrective implementation starts from canonical GitHub main commit `7312f3fea6b2833aa4d2ccdf6ef0b11f5bdc9082` and is implemented in commit `5159c99`.

## Implemented Workflow

The Scan PO action now follows the canonical deterministic flow:

```text
JPEG / PNG upload
  → ocr.extractDocument
  → raw OCR fullText
  → poParsing.parseOcrText
  → editable human review
  → explicit authorised Create & Submit PO
  → Pending Approval PO
```

`client/src/pages/PurchaseOrders.tsx` no longer calls the legacy `purchaseOrders.uploadPoImage`, `purchaseOrders.extractFromImage`, or `purchaseOrders.validateExtractedData` procedures from the production Scan PO UI. The retained legacy backend helpers are not invoked by this new workflow.

## Files Changed

| File | Change | Purpose |
|---|---|---|
| `client/src/pages/PurchaseOrders.tsx` | Modified | Replaces the legacy LLM-driven scan handler with the canonical OCR-to-parser review flow, qualitative confidence badges, reconciliation status, editable review fields, and an explicit-only submission boundary. |
| `shared/poReviewPrefill.ts` | Added | Defines the typed review model, preserves `extractedValue` and `sourceText` independently from the editable value, produces qualitative confidence labels, and surfaces reconciliation warnings. |
| `server/poReviewPrefill.test.ts` | Added | Provides six focused Step 3 tests for pipeline mapping, blanks, confidence, provenance, reconciliation, non-mutation, and explicit Pending Approval creation. |
| `PHASE_3_STEP_3_REVIEW_PREFILL_REPORT.md` | Added and finalized | Records only behavior demonstrated by committed source and tests. |
| `todo.md` | Modified | Records corrective Step 3 completion; it is a task ledger and not application behavior. |

## Review and Provenance Behavior

The UI displays document header values, line-item values, tax and total values, qualitative **HIGH**, **MEDIUM**, or **LOW** confidence badges, source text when supplied by the deterministic parser, and parser/reconciliation warnings. No numeric confidence percentages are generated or rendered.

Every displayed parsed field is editable in the review surface. A correction changes only `ReviewField.value`; the originally extracted value and `sourceText` remain intact in `ReviewField.extractedValue` and `ReviewField.sourceText`. The form then receives only values supported by the existing PO create contract: vendor name, GSTIN, item description, quantity, and unit price. Fields not represented by the current PO create schema remain review evidence rather than being fabricated into unsupported database fields.

## Safety and Submission Boundary

OCR and parser calls do not create a purchase order, approve a purchase order, create a goods receipt, update inventory, or create stock movements. The review continuation action only pre-fills the existing PO form and explicitly resets authorisation. The only creation call remains `purchaseOrders.create` inside the user-initiated `handleSubmit` function. The existing protected backend procedure continues to set `paymentStatus: "Pending"` and `approvalStatus: "Pending Approval"`.

## Validation Evidence

| Command | Result |
|---|---|
| `pnpm check` | Passed with 0 TypeScript errors. |
| `pnpm test --run server/ocr.test.ts` | Passed: 10/10 Step 1 OCR hardening tests. |
| `pnpm test --run server/poParsing.test.ts` | Passed: 6/6 Step 2 deterministic parser tests. |
| `pnpm test --run server/poReviewPrefill.test.ts` | Passed: 6/6 Step 3 tests. |
| `pnpm test --run` | Passed: 23 test files and 191/191 tests. |
| `pnpm build` | Passed successfully. |

The Step 3 tests specifically verify that OCR output feeds deterministic parsing, parsed values enter review state, missing values stay blank, confidence remains qualitative, arithmetic discrepancies are surfaced, provenance survives editing, OCR/parsing produce zero business mutations, and only the explicit create procedure produces a Pending Approval PO without a goods receipt or inventory update.

## Git Fidelity

The corrective implementation commit contains actual frontend source changes in `client/src/pages/PurchaseOrders.tsx`, plus a shared model and dedicated test file. It is not a documentation-only candidate. The implementation commit `5159c99` appears in the history for all three implementation files; canonical locations are used without duplicate source trees.

## Known Limitations

- Step 3 accepts JPEG and PNG inputs only. PDF OCR remains explicitly deferred and is rejected through the existing safe OCR input boundary.
- The current `purchaseOrders.create` contract persists vendor details plus generic PO line-item name, quantity, and unit price. Review-only parser fields such as HSN, batch, expiry, discount, tax breakdown, source text, and reconciliation evidence are not fabricated into unsupported PO database columns.
- The legacy backend scan helper procedures remain for backward compatibility, but the production Scan PO UI no longer invokes them. Removing those unused server procedures is intentionally outside this corrective UI scope.
- OCR/parse provenance is preserved during review. The existing correction audit event records manually corrected field names and reconciliation metadata after explicit creation; it does not persist an independent immutable copy of every raw OCR source fragment.

## Classification

**`PHASE3_STEP3_REVIEW_PREFILL_IMPLEMENTED`** — local implementation and validation completed. This status may be upgraded to `PHASE3_STEP3_REVIEW_PREFILL_GITHUB_VALIDATED` only after the current canonical pull-request head passes the required `validate` check.
