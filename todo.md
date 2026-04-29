# Clinic Management System (CMS) - Development Roadmap

## Core Modules

### Patient Intake & Registration
- [x] Auto-generate unique Patient ID (deterministic hash-based)
- [x] Patient registration form with demographics capture
- [x] Generate QR code and barcode for OPD tracking
- [x] Store barcode/QR code images in cloud storage
- [x] Trigger notification on new patient registration

### Dashboard & Navigation
- [x] Build DashboardLayout with sidebar navigation
- [x] Display today's patient queue/consultation list
- [x] Show key statistics: total patients, pending bills, low-stock alerts
- [x] Real-time updates for queue and alerts via explicit polling/cache refresh

### Ambient Scribe - Clinical Documentation
- [x] Audio recording interface (live capture or file upload)
- [x] Whisper API integration for speech-to-text transcription
- [x] LLM parsing into four sections: Clinical History, Present Complaints, Advised Investigations, Treatment Plan
- [x] Digital signature support for finalization
- [x] Store audio files in cloud storage
- [x] Generate and store consultation records

### Pharmacy Inventory Management
- [x] Add/edit medicines with batch number, expiry date, quantity, reorder level
- [x] Real-time inventory tracking
- [x] Low-stock alerts when quantity < reorder level
- [x] Display inventory dashboard with alert indicators
- [x] Track stock changes in audit logs

### Integrated Billing Module
- [x] Auto-pull consultation fees from scribe module
- [x] Auto-pull dispensed pharmacy items
- [x] Generate unified invoice with itemized breakdown
- [x] Track payment status: Pending, Paid, Partial
- [x] Generate and store PDF invoices in cloud storage
- [x] Trigger notification on invoice generation

### Patient Records & History
- [x] Searchable patient list with filters
- [x] Patient profile page with visit history
- [x] Display past consultations and clinical notes
- [x] Show billing records per patient
- [x] Link to stored audio files and PDFs

### Audit Trail & Compliance
- [x] Immutable audit log table with all system actions
- [x] Log entries: actor, action type, timestamp, old/new values
- [x] Capture: registration, PHI access, prescription, stock change, billing
- [x] Audit log viewer with filters and search
- [x] Prevent editing/deletion of audit logs

### Automated Notifications
- [x] In-app notification system for clinic owner
- [x] Email notifications to clinic owner (via Manus built-in API)
- [x] Trigger on: new patient registration, invoice generation, low stock
- [x] Notification history and dismissal

### Cloud File Storage
- [x] Cloud storage integration for audio files with persisted storage keys
- [x] Cloud storage integration for PDF invoices with persisted storage keys
- [x] Cloud storage integration for barcode/QR code images with persisted storage keys
- [x] Save storage keys in database for all generated/uploaded artifacts
- [x] Implement protected file retrieval links in patient profile and registration views

### Security & HIPAA Compliance
- [x] Document platform database/storage encryption and PHI handling assumptions
- [x] Document HTTPS/TLS and secure cookie/session assumptions
- [x] Verify role-based access control (admin/user) in backend procedures and UI
- [x] Audit trail for all PHI access
- [x] Verify secure session management assumptions

### UI/UX & Design
- [x] Verify elegant, refined typography and color scheme across key pages
- [x] Verify polished shadcn/ui components throughout key pages
- [x] Verify responsive design (mobile, tablet, desktop)
- [x] Verify loading states and error handling across key pages
- [x] Verify empty states with helpful guidance across key pages
- [x] Verify micro-interactions and smooth transitions where appropriate

### Testing & Quality Assurance
- [x] Unit tests for core business logic (vitest)
- [x] Unit tests for barcode generation (9 tests)
- [x] Manual testing of all workflows
- [x] Cross-browser compatibility check
- [x] Performance optimization

### Deployment & Documentation
- [x] Final checkpoint before deployment
- [ ] Deploy to production (user-controlled Publish action)
- [x] Verify core workflows end-to-end by code review, tests, and health checks
- [x] Generate working URL for user
- [x] Create user documentation

---

## Implementation Notes

### Database Schema
- **patients**: patient_id, name, contact, barcode_data, created_at
- **consultations**: consultation_id, patient_id, transcript, clinical_history, present_complaints, advised_investigations, treatment_plan, digital_signature, is_finalized
- **inventory**: item_id, item_name, batch_number, expiry_date, quantity_available, reorder_level, unit_price
- **bills**: bill_id, patient_id, consultation_id, total_amount, discount, tax, final_amount, payment_status
- **bill_items**: bill_item_id, bill_id, item_type, description, quantity, unit_price, subtotal
- **audit_logs**: log_id, user_id, action_type, table_name, record_id, old_value, new_value, timestamp (immutable)
- **notifications**: notification_id, user_id, title, content, is_read, created_at

### API Integrations
- **Whisper API**: Speech-to-text transcription
- **LLM (GPT-4o)**: Clinical note parsing
- **Twilio**: Optional WhatsApp notifications
- **AWS S3**: Cloud file storage
- **Manus Built-in APIs**: Notifications, storage, LLM

### Design Tokens
- Color scheme: Professional, elegant palette
- Typography: Clean, readable fonts
- Spacing: Consistent grid system
- Shadows: Subtle, refined depth
- Animations: Smooth, purposeful transitions

## Production Readiness Follow-up
- [x] Add explicit dashboard polling/cache refresh for queue and alert data.
- [x] Add protected file-link metadata for barcode, QR, audio, and invoice artifacts in patient records.
- [x] Add RBAC verification and documentation for owner/admin access boundaries.
- [x] Add concise user documentation for registration, scribe, billing, pharmacy, exports, and audit logs.

## Production Readiness Gap Remediation
- [x] Hide or gate admin-only UI actions/routes for billing CSV export and audit-log navigation/views based on authenticated role.
- [x] Replace remaining Billing prototype data/actions with tRPC-backed loading, empty, validation, success, and error states.
- [x] Run and document workflow-level verification evidence for registration, scribe, pharmacy, billing, protected artifact access, and admin exports.

## Final Evidence Gap Closure
- [x] Add explicit evidence/tests or code references showing backend adminProcedure/protectedProcedure enforcement for all admin-only routes and exports.
- [x] Verify loading, error, and empty states on remaining key pages: registration, patient records, notifications, audit logs, and ambient scribe.
- [x] Save a final project checkpoint before marking deployment readiness complete.
- [x] Add workflow-focused verification evidence covering registration, scribe, pharmacy, billing, protected artifact access, and admin export flows.
- [x] Document exact backend owner/admin access boundaries with procedure-level evidence.

## Export & Reporting
- [x] Add backend CSV export for patient records.
- [x] Add backend CSV export for billing history.
- [x] Add frontend controls to download patient records as CSV.
- [x] Add frontend controls to download billing history as CSV.
- [x] Add unit tests for CSV export formatting and escaping.
- [x] Verify CSV export feature and save checkpoint.
 per user request (2026-04-29)


## Final Design QA Evidence Closure
- [x] Audit and document typography and color treatment on dashboard, registration, patient records, billing, notifications, audit logs, and ambient scribe with concrete code references.
- [x] Apply and verify polished component styling beyond the dashboard on remaining key pages.
- [x] Review and document responsive layouts for key pages at mobile, tablet, and desktop breakpoints; add missing responsive fixes where needed.
- [x] Add and verify tasteful micro-interactions on remaining key pages with concrete evidence.
- [x] Save an updated checkpoint after final design QA evidence closure.

## Friendly UI Refresh Request
- [x] Refresh the global visual system with a warmer, friendlier clinical palette, softer surfaces, and more welcoming interaction states.
- [x] Improve the dashboard first impression with friendlier hero messaging, softer cards, clearer CTAs, and more inviting visual hierarchy.
- [x] Apply the friendly visual refresh consistently across registration, patient records, ambient scribe, pharmacy, billing, notifications, and audit logs.
- [x] Validate the refreshed UI with automated tests, production build, and project health checks.
- [x] Save a checkpoint after the friendly UI refresh for user review.

## Publishing Guide and Training Video Request
- [x] Create a practical end-user publishing guide for the Management UI, including checkpoint review, Publish action, domain/custom-domain options, and production readiness notes.
- [x] Document CMS login flow and role-based access behavior for owner/admin and user roles.
- [x] Document where clinic staff can edit patients, prices, inventory, billing status, notifications, and audit review items.
- [x] Write a narrated training-video script that teaches CMS workflows by role and module.
- [x] Generate narrated AI training-video media or a complete video-ready narrated package for user review.
- [x] Save a checkpoint after adding the publishing and training deliverables.
- [x] Produce actual MP4 training video with synchronized visuals and feminine narration, visually teaching publishing, login, roles, patient workflows, inventory/pricing, billing, notifications, audit logs, and where each edit is made.
- [x] Fix observed jsPDF constructor issue affecting invoice PDF generation.
