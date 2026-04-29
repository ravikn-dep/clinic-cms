# UI State Verification Evidence

This document records the key-page loading, empty, validation, and error-state coverage reviewed before the final checkpoint. The review combined code inspection with the automated quality gates recorded in `docs/verification-evidence.md`.

## Verification Summary

The primary clinic workflows now present visible state feedback for long-running actions, empty datasets, and recoverable errors. The remaining gaps found during review were the Notifications and Audit Logs pages, where data-fetching failures were not visible enough to users. Those pages now include explicit loading indicators, retry actions, and error messages.

| Page | Loading / Pending State | Empty State | Error / Validation State | Concrete Evidence |
|---|---|---|---|---|
| Dashboard | Query loading spinners for patients, consultations, low-stock, and inventory cards. | Empty patient queue state. | Dashboard-level error banner when key queries fail. | `client/src/pages/Home.tsx:28`, `client/src/pages/Home.tsx:73-129` |
| Patient Registration | Submit button disables and shows pending state during registration; protected artifact buttons disable while link retrieval is pending. | Success panel explains QR/barcode availability after registration. | Field-level form validation, registration failure toast, pop-up warning, and protected asset failure toast. | `client/src/pages/PatientRegistration.tsx` registration mutation and success panel review |
| Patient Records | Patient list, profile, consultations, billing, and linked-file sections show loading or pending states. | Empty patient, consultation, billing, and artifact states are rendered separately. | Protected artifact retrieval and CSV export failures surface through toast messaging. | `client/src/pages/PatientRecords.tsx:56-62`, `client/src/pages/PatientRecords.tsx:118-166`, `client/src/pages/PatientRecords.tsx:218-330` |
| Notifications | Manual refresh disables during fetch and displays a spinner. | Empty notification and filtered-empty states are distinct. | Query failure state shows error text and a retry button; mark-as-read failures show toast feedback. | `client/src/pages/Notifications.tsx:119-127`, `client/src/pages/Notifications.tsx:180-203` |
| Audit Logs | Audit-log query shows a loading spinner while admin-only data loads. | Empty audit-log state remains available after successful fetch. | Query failure state shows error text and a retry button. | `client/src/pages/AuditLogs.tsx:121-136` |
| Ambient Scribe | Upload/transcription/finalization buttons disable during processing. | Initial note panel explains that no clinical note has been generated yet. | File-size validation, missing-patient/audio validation, microphone failure, transcription failure, and signature validation are surfaced through toast messages. | `client/src/pages/AmbientScribe.tsx:146-166`, `client/src/pages/AmbientScribe.tsx:228-267` |
| Billing | Invoice list, invoice creation, CSV export, payment update, refresh, and protected invoice-link actions use loading or disabled states. | Empty invoice history panel explains how to create the first invoice. | Query error state has retry action; billing form validation and mutation failures show toast messages. | `client/src/pages/Billing.tsx:59-88`, `client/src/pages/Billing.tsx:182-193`, `client/src/pages/Billing.tsx:270-308`, `client/src/pages/Billing.tsx:346-366` |

## Notes

The verification focused on user-visible data-state handling rather than visual polish. Accessibility, responsive design, typography, and visual refinement remain tracked separately in `todo.md` for a broader design QA pass if required before production launch.
