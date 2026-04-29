# Clinic CMS Security, RBAC, and PHI Handling Notes

This document records the current **security model, role-based access boundaries, protected artifact access pattern, and PHI-handling assumptions** for the Clinic Management System. It is intended for clinic owners, operators, and future maintainers who need a concise production handoff reference before publishing the application.

> The application is designed as a clinic workflow system that stores patient demographics, clinical notes, audio references, invoice metadata, inventory records, notifications, and audit logs. Because these records may contain protected health information, operational deployment should follow the clinic’s own legal, compliance, retention, and access-control policies.

## Current access model

The system uses the platform OAuth session flow for identity and stores users in the `users` table with a `role` value of either `admin` or `user`. The project owner is promoted to `admin` during user upsert when the OAuth open identifier matches the configured owner identifier. All application procedures that handle clinic data require an authenticated session, while export procedures and audit-log reading require an administrator role.

| Area | Current protection | Notes for operators |
|---|---:|---|
| Patient registration and patient record lookup | Authenticated user | Clinical staff can register and retrieve patients after signing in. Access is written to audit logs where PHI is viewed. |
| Ambient scribe and consultation notes | Authenticated user | Audio, transcripts, structured notes, and signatures are stored under authenticated workflows. |
| Pharmacy inventory | Authenticated user | Stock changes are audit logged, and low-stock notifications are created when quantity reaches or falls below reorder level. |
| Billing and invoice creation | Authenticated user | Invoice PDFs are generated, stored, and linked through protected retrieval metadata. |
| CSV export of patients and billing | Admin only | Export controls are hidden from non-admin users in the UI and are also enforced by backend procedures. |
| Audit-log viewer | Admin only | Audit logs are immutable from the application UI and backend procedure set. |
| Stored barcode, QR, audio, and invoice artifacts | Authenticated protected-link procedure | The UI no longer opens direct storage URLs for record artifacts; it requests an audited protected link from the backend. |

## Protected artifact handling

Generated and uploaded artifacts should be addressed through persisted storage keys, not only raw display URLs. Patient QR/barcode assets now store both URL and key columns. Audio files and invoice PDFs also use persisted key fields. Patient-facing record screens request an artifact link through the authenticated backend procedure and include the artifact type, patient identifier, and record identifier where available.

| Artifact type | Database metadata | Retrieval pattern | Audit behavior |
|---|---|---|---|
| QR code | `patients.qrcodeImageUrl`, `patients.qrcodeImageKey` | Authenticated link request from registration and patient records | Logs PHI access with artifact metadata. |
| Barcode | `patients.barcodeImageUrl`, `patients.barcodeImageKey` | Authenticated link request from registration and patient records | Logs PHI access with artifact metadata. |
| Consultation audio | `consultations.audioFileUrl`, `consultations.audioFileKey` | Authenticated link request from patient records | Logs PHI access with consultation record identifier. |
| Invoice PDF | `bills.invoicePdfUrl`, `bills.invoicePdfKey` | Authenticated link request from billing history and patient records | Logs PHI access with bill record identifier. |

The protected-link procedure currently returns the application storage path or a presigned-compatible URL returned by the storage helper. This preserves the existing platform storage behavior while centralizing authorization and audit logging in the server.

## Session, transport, and storage assumptions

The application relies on the hosting platform for OAuth callback handling, secure session cookie issuance, HTTPS termination, and managed database/storage connectivity. The application code does not hardcode session secrets, database URLs, OAuth endpoints, storage credentials, or LLM credentials. These values are injected through the managed environment.

| Assumption | Application dependency | Operational implication |
|---|---|---|
| HTTPS/TLS is terminated by the platform for public preview and published URLs. | OAuth redirects and session cookies are expected to operate over secure origins. | Publish only through trusted platform routes or domains configured in the platform UI. |
| Session cookies are signed by the platform-provided session secret. | Server context resolves `ctx.user` before protected procedures execute. | Rotate platform secrets through the project settings/secrets flow if required by policy. |
| Database and storage credentials are injected into server-side environment variables. | Server code reads managed environment variables and storage helpers. | Do not commit `.env` files or hardcode credentials in source code. |
| Artifact bytes live in object storage while metadata lives in the database. | UI stores and references storage keys/URLs rather than file bytes. | Avoid adding BLOB columns for audio, PDFs, or images. |

## RBAC verification checklist

Before publishing or promoting to a broader clinical team, the owner should verify administrator and non-administrator accounts in the preview environment. The backend enforces these boundaries, but a practical UI check reduces the chance of confusing staff workflows.

| Verification step | Expected result |
|---|---|
| Sign in as project owner/admin and open patient records. | Patient CSV export is visible and downloads through the backend export procedure. |
| Sign in as a non-admin user and open patient records. | Patient CSV export is hidden and replaced with an admin-only badge. |
| Sign in as admin and open audit logs. | Audit log data is visible and searchable. |
| Sign in as non-admin and attempt an audit-log route or procedure. | Access is blocked by backend authorization. |
| Open barcode, QR, audio, or invoice assets from records. | The asset opens through an authenticated action, and a PHI access audit entry is created. |

## Production handoff notes

The system is ready for owner review after automated tests and health checks pass. Publishing remains a user-controlled action in the project UI. Before production use with real PHI, the clinic should confirm its own retention requirements, data-processing agreements, staff access policies, and incident-response processes. The application provides the workflow and audit foundations, but legal compliance depends on the complete operational environment and clinic governance.
