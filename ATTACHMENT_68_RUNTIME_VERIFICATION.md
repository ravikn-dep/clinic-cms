# Attachment 68 — Generate OP Runtime Verification

**Status:** Resolved and verified in the managed development Preview on 28 August 2026.  
**Scope:** The Generate OP / Print OP interaction only. No production environment, deployment, schema, migration, authentication, RBAC, billing, procurement, inventory, OCR, dashboard, or external-integration change was made.

## Reproduction and Root Cause

The authenticated **Generate OP & Print** control on `/appointments` was enabled and its click handler fired. The real browser trace showed `visits.generateOp` followed by `consultations.getBrandedPrintData`, both returning HTTP 200. The apparent “no response” was therefore not an unbound control, disabled pointer target, tRPC failure, or OP-data resolution failure on the valid record.

The interaction had insufficient immediate visual acknowledgement while the browser opened a secondary preparation window and then entered its native print experience. In an automated browser, that native print dialog keeps focus and prevents further inspection of the originating page; it can look like an inert control even while the request path has completed. The current code also had page-specific feedback differences between Appointments and Patient Records.

| Trace stage | Observed result |
|---|---|
| Click binding and eligibility | Valid checked-in appointment control was enabled and accepted a real click. |
| Immediate UI response | Appointments changed to **Generating OP…**; Patient Records and New Visit changed to **Preparing…**. |
| Synchronous print-window preparation | The shared helper created and focused a lightweight preparation window directly from the click event. |
| OP generation | `visits.generateOp` returned HTTP 200; a new consultation is only generated or reused by the existing server-authoritative route. |
| Branded print data | `consultations.getBrandedPrintData` returned HTTP 200 in the verified path. |
| Output and print | The existing canonical A4 renderer injected the branded HTML and invoked the browser print action. |

## Scoped Correction

The shared `printWindow` helper now provides immediate preparation feedback by focusing the synchronous popup and rendering a short non-sensitive loading document. It detects a blocked popup before any asynchronous work is allowed to masquerade as a successful print, closes the preparation window on failure, and propagates errors to the existing page-local toast behavior.

Appointments now presents **Generating OP…** while its existing OP-generation and branded-data steps are in flight. Patient Records uses the shared helper and presents **Preparing…** for all consultation Print OP actions. New Visit already used the shared helper; its active print action was rechecked after resuming the existing OP-generated encounter. The core route contracts, encounter lifecycle, branded-data resolver, and canonical master OP renderer remain unchanged.

## Entry-Point Verification

| Entry point | Verified behavior |
|---|---|
| `/appointments` — Generate OP & Print | A real click immediately changed the control to **Generating OP…**. The latest verified calls returned `visits.generateOp` HTTP 200 in 1.77 seconds and `consultations.getBrandedPrintData` HTTP 200 in 1.15 seconds. |
| `/patients` — Print OP | A real click immediately changed the consultation action to **Preparing…** and dispatched a successful branded print-data request (HTTP 200 in 1.15 seconds). |
| `/new-visit` — Print OP | A resumed existing OP-generated encounter restored its consultation context. A real Print OP click immediately changed the control to **Preparing…** and dispatched the shared branded print-data request successfully (HTTP 200 in 1.15 seconds). |

No client-side uncaught exception, arbitrary HTTP error body, or raw provider information was exposed during the verification. The browser controller could not inspect beyond the native print dialog, but the request trace, immediate pending state, shared-helper interaction test, and prior Chromium A4 output inspection provide consistent evidence that print preparation completed.

## Regression and Build Evidence

The print interaction regression suite now covers synchronous preparation-window focus, blocked-popup detection, deferred content rendering, error cleanup, and the absence of a print call after a failed data provider. The full validation command completed successfully:

| Check | Result |
|---|---|
| `pnpm check` | Passed with no TypeScript errors. |
| Focused print interaction coverage | Passed: 5 tests in `server/printWindow.test.ts`. |
| `pnpm test --run` | Passed: **369/369 tests** across 50 files. |
| `pnpm build` | Passed. The existing large-chunk advisory remained non-blocking. |
| `git diff --check` | Passed. |

## Acceptance Status

The Generate OP action now has an immediate visible state transition, a synchronous focused preparation window, duplicate-submit protection through disabled pending controls, and explicit handling for popup-blocked and asynchronous failures. The three approved entry points share the same safe browser-print behavior while continuing to use the one canonical master OP renderer and existing branded print-data contract.

**Final classification:** `GENERATE_OP_INTERACTION_RESOLVED_AND_VERIFIED`
