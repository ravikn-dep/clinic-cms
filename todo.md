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
- [ ] Real-time updates for queue and alerts

### Ambient Scribe - Clinical Documentation
- [x] Audio recording interface (live capture or file upload)
- [x] Whisper API integration for speech-to-text transcription
- [x] LLM parsing into four sections: Clinical History, Present Complaints, Advised Investigations, Treatment Plan
- [x] Digital signature support for finalization
- [ ] Store audio files in cloud storage
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
- [ ] Patient profile page with visit history
- [ ] Display past consultations and clinical notes
- [ ] Show billing records per patient
- [ ] Link to stored audio files and PDFs

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
- [ ] S3 integration for audio files
- [ ] S3 integration for PDF invoices
- [ ] S3 integration for barcode/QR code images
- [ ] Save storage keys in database
- [ ] Implement secure file retrieval

### Security & HIPAA Compliance
- [ ] Encrypt sensitive data at rest (AES-256)
- [ ] Enforce TLS 1.3 for all communications
- [ ] Role-based access control (admin/user)
- [ ] Audit trail for all PHI access
- [ ] Secure session management

### UI/UX & Design
- [ ] Elegant, refined typography and color scheme
- [ ] Polished shadcn/ui components throughout
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Loading states and error handling
- [ ] Empty states with helpful guidance
- [ ] Micro-interactions and smooth transitions

### Testing & Quality Assurance
- [x] Unit tests for core business logic (vitest)
- [x] Unit tests for barcode generation (9 tests)
- [x] Manual testing of all workflows
- [x] Cross-browser compatibility check
- [x] Performance optimization

### Deployment & Documentation
- [ ] Final checkpoint before deployment
- [ ] Deploy to production
- [ ] Verify all features working end-to-end
- [ ] Generate working URL for user
- [ ] Create user documentation

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

## Export & Reporting
- [x] Add backend CSV export for patient records.
- [x] Add backend CSV export for billing history.
- [x] Add frontend controls to download patient records as CSV.
- [x] Add frontend controls to download billing history as CSV.
- [x] Add unit tests for CSV export formatting and escaping.
- [x] Verify CSV export feature and save checkpoint.
 per user request (2026-04-29)

