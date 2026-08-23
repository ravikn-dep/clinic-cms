# Phase 3 Step 6: Safe PDF and Multi-Page Scan PO OCR Ingestion

**Status:** Implemented and locally validated on `feature/phase3-pdf-ocr` from canonical baseline `8999ba7e75c142c2e2685d1cec9bf0d630a2b7e6`. This report records only implemented code paths and executed local validation. No production credential, Cloud Storage bucket, production database, deployment, tag, merge, or force push was used.

## Scope and architecture

Step 6 extends the existing provider-neutral OCR extraction boundary to accept `image/jpeg`, `image/png`, and `application/pdf`. It retains the established workflow: **OCR extraction → deterministic parser → editable human review → optional explicit catalog resolution → explicit authenticated Pending Approval PO creation**. OCR and parsing remain read-only operations.

| Concern | Implemented Step 6 behavior |
| --- | --- |
| Image OCR | Retains synchronous `documentTextDetection` for JPEG and PNG inputs. |
| PDF OCR | Uses the installed Google Vision SDK's synchronous `batchAnnotateFiles` request with `DOCUMENT_TEXT_DETECTION`, inline PDF bytes, and the exact selected pages `1…n`. |
| PDF bound | Validates a real PDF locally and accepts only one through five pages; a document over five pages is rejected before the provider request. |
| Resource bounds | Server-owned limits are 10 MiB for JPEG/PNG, 5 MiB for PDFs, 5 PDF pages, 250,000 extracted characters, and a 25-second provider timeout. Client-provided size preferences are not part of the OCR input contract or route schema. |
| Page-aware results | `OcrResult` now carries `sourceMimeType`, `pageCount`, and ordered `pages`. PDF `fullText` is composed deterministically as `--- PAGE n ---` sections without repeating the full document for each page. |
| Unsupported path avoided | The asynchronous file OCR route was not added because it requires Cloud Storage output and polling. The synchronous route is appropriate for the five-page bounded scope. |

Google’s official online file-annotation guidance supports an immediate response, a single file, and no more than five selected PDF pages; its Node sample uses inline PDF content, `DOCUMENT_TEXT_DETECTION`, `pages`, and `batchAnnotateFiles`.[1] The same guidance distinguishes asynchronous file annotation as a Cloud Storage-output workflow, which this change deliberately does not introduce.[1]

## Safety and privacy controls

The new `server/ocr/document.ts` centralizes decoding, MIME allowlisting, byte ceilings, PDF structural validation through `pdf-lib`, page counting, result-size enforcement, timeout behavior, and the allowlist of client-safe validation messages. `image/jpg` was intentionally removed as a separate accepted MIME label; only the canonical `image/jpeg`, `image/png`, and `application/pdf` values are allowed.

Provider initialization, provider processing, and timeout failures stay stable application codes internally. The tRPC router returns only known safe input-validation errors; all other failure cases are reduced to **“OCR extraction failed.”** Raw credential, project, quota, Cloud Storage URL, filesystem, temporary-path, and SDK error content is logged only server-side and is not propagated through the API.

| Rejected condition | Client-safe result |
| --- | --- |
| Unsupported MIME | `Unsupported MIME type` |
| Empty input | `Cannot process empty file for OCR` |
| Oversize image or PDF | `File size exceeds maximum allowed limit` |
| Invalid PDF bytes or structure | `Malformed PDF document` |
| More than five PDF pages | `PDF exceeds maximum supported page count` |
| Excessive OCR output | `OCR result exceeds maximum supported size` |
| Provider, timeout, or internal failure | `OCR extraction failed` at the router boundary |

## Human review and business-mutation boundaries

`PurchaseOrders.tsx` now permits JPEG, PNG, and PDF selection. Images preserve their existing preview and rotate control. PDFs use a neutral filename/document state with no image rotation, and the review surface shows the authoritative extracted page count. The review UI remains editable and continues to require explicit movement into the existing PO form.

No automatic purchase order, approval, catalog acceptance, goods receipt, inventory, or stock movement was added. The only reviewed-PDF path to a PO remains the existing `purchaseOrders.createFromReviewedExtraction` transaction, which creates a **Pending Approval** PO only after explicit authorized submission. Existing deterministic catalog suggestions and human-only acceptance remain unchanged.

### Immutable evidence decision

No schema change or migration was made for Step 6. The existing immutable evidence snapshot already records the approved OCR provider, document classification, structured extracted fields, source snippets used for the review fields, reviewer corrections, final reviewed values, reconciliation, warnings, catalog resolutions, reviewer identity, and the linked PO. It deliberately does not persist raw OCR text.

`sourceMimeType` and `pageCount` are returned safely in the transient OCR result for the UI and review session, but are not persisted in immutable evidence. This is intentional: they describe processing transport rather than the clinically and financially reviewed purchase-order content, while the current immutable provider/document-type provenance is sufficient for the existing audit model. Persisting raw OCR text, provider raw metadata, Cloud identifiers, signed URLs, credentials, or temporary paths remains prohibited. A future evidence expansion, if separately authorized, should use only additive fields authenticated by a server-side extraction-session mechanism; it must not accept user-supplied MIME/page metadata as evidence.

## Files changed

| File | Purpose |
| --- | --- |
| `server/ocr/document.ts` | New centralized authoritative input inspection, PDF-page validation, deterministic page composition, output cap, timeout, and safe-error helper. |
| `server/ocr/types.ts` | Adds safe source MIME and page-count fields; removes the client-controlled `maxSizeMb` input property. |
| `server/ocr/provider.ts` | Makes the mock provider page-aware for deterministic PDF tests and retains safe provider wrapping. |
| `server/ocr/googleVisionProvider.ts` | Routes PDFs to bounded synchronous `batchAnnotateFiles`; preserves image OCR; sanitizes all provider errors. |
| `server/routers.ts` | Removes the client size override and shares the centralized safe-error allowlist. |
| `client/src/pages/PurchaseOrders.tsx` | Adds PDF selection state, neutral preview, page count display, updated copy, and document-neutral rescan wording. |
| `server/pdfOcr.test.ts` | Dedicated PDF/multi-page, parser, RBAC, timeout, error masking, and zero-mutation regression suite. |
| `server/ocr.test.ts` | Updates prior OCR MIME/size expectations for the Step 6 PDF-capable contract. |
| `package.json`, `pnpm-lock.yaml` | Adds `pdf-lib` for deterministic local PDF page-count validation. |
| `todo.md` | Records Step 6 implementation and focused-test progress. |

## Validation evidence

| Command | Result |
| --- | --- |
| `pnpm test --run server/ocr.test.ts server/pdfOcr.test.ts server/poEvidenceAudit.test.ts server/catalogMatching.test.ts` | **37/37 tests passed** across the focused OCR, PDF, evidence, and catalog-compatibility suites. |
| `pnpm check` | **Passed** with zero TypeScript errors. |
| `pnpm test --run` | **218/218 tests passed** across 26 test files. |
| `pnpm build` | **Passed**. Vite emitted only its existing large-chunk advisory, not a build error. |
| `git diff --check` | **Passed** with no whitespace errors. |

The Step 6 tests cover JPEG/PNG regression behavior; valid one-to-five-page PDFs; malformed, empty, oversize, and six-page PDF rejection; an ignored client size preference; deterministic ordered Vision-file page handling; no page-text duplication; parser consumption without an LLM fallback; provider error and timeout sanitization; authenticated access; router masking; and direct no-mutation assertions prior to explicit review submission. Existing Step 4 evidence tests verify explicit Pending Approval creation and immutable evidence, while existing Step 5 catalog tests verify suggestions remain deterministic and explicit-only.

## Exclusions and next gate

This implementation does **not** add asynchronous Vision OCR, Cloud Storage output, polling, external credentials, production configuration, deployment, a production migration, a merge, a tag, automatic approval, goods receipt posting, inventory updates, stock movement, catalog alias learning, or an LLM fallback.

The next action is a scope-limited commit, normal push of `feature/phase3-pdf-ocr`, a pull request to `main`, and confirmation that the protected `CI Validation / validate` workflow passes. The branch must not be merged during this task.

## References

[1]: https://docs.cloud.google.com/vision/docs/file-small-batch "Google Cloud Vision: Small batch file annotation online"
