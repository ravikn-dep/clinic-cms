# Clinic CMS User Guide

This guide explains the main Clinic Management System workflows for daily clinic operations. The application is organized around authenticated staff access, a sidebar dashboard, and clinical modules for registration, documentation, inventory, billing, patient history, notifications, and audit review.

## Daily workflow overview

A typical clinic day begins with patient registration, continues through consultation documentation, and ends with billing, inventory updates, and record review. The dashboard gives staff a quick view of patient volume, the current queue, inventory status, and low-stock alerts. Queue and alert data refresh automatically while the dashboard is open, so staff do not need to reload the page manually for routine status updates.

| Workflow stage | Primary module | Outcome |
|---|---|---|
| Intake | Patient Registration | Patient demographics are captured, and OPD barcode/QR tracking assets are generated. |
| Consultation | Ambient Scribe | Audio is transcribed and structured into clinical history, present complaints, advised investigations, and treatment plan. |
| Pharmacy | Inventory Management | Medicine stock, batch, expiry, reorder levels, and unit prices are maintained. |
| Billing | Billing Module | Consultation and pharmacy charges are combined into an itemized invoice with payment status. |
| Review | Patient Records | Staff can search the patient profile, consultation history, stored files, and billing records. |
| Oversight | Audit Logs and Notifications | Administrators can review system activity, and owners receive operational alerts. |

## Patient registration

Open **Patient Registration** from the sidebar and complete the required demographic fields. The system generates a patient identifier and OPD tracking barcode/QR assets after successful submission. The success panel displays the patient ID, QR code, barcode, and barcode data. Use **Print Slip** to create an OPD tracking slip for the patient, or use the QR/barcode buttons to open tracking assets through an authenticated, audited file-access action.

| Field or action | Guidance |
|---|---|
| First name, last name, date of birth, contact number | These fields are required for registration. |
| Gender, email, address | These fields are optional but useful for complete patient records. |
| Print Slip | Opens a printable OPD slip containing patient ID and tracking assets. |
| QR Code / Barcode | Opens the stored asset through protected retrieval and records the access event. |

## Ambient scribe and clinical notes

Use the **Ambient Scribe** module to upload or capture consultation audio, generate a transcript, and structure the clinical note. The note is divided into **Clinical History**, **Present Complaints**, **Advised Investigations**, and **Treatment Plan**. After clinical review, staff can finalize the note with a digital signature. Finalization is intended to mark the consultation as clinically accepted and should be performed only after review.

## Pharmacy inventory

Use **Pharmacy Inventory** to add or update medicines, batch numbers, expiry dates, quantities, reorder levels, and unit pricing. Stock updates are logged in the audit trail. When a newly added or updated item reaches or falls below its reorder level, the system creates an in-app notification and sends an owner notification through the platform notification channel.

| Inventory field | Purpose |
|---|---|
| Item name and batch number | Identifies medicine stock and supports batch-specific tracking. |
| Expiry date | Helps staff identify stock that requires attention before dispensing. |
| Quantity available | Current stock count used for low-stock alerts. |
| Reorder level | Threshold used to create alerts when stock is low. |
| Unit price | Used by billing when pharmacy items are added to invoices. |

## Billing and invoices

Use the **Billing** module to create itemized bills. The module supports consultation fees, pharmacy items, discounts, tax, payment status, and payment method. After invoice generation, the system stores a PDF invoice artifact and links it to the billing record. Patient records can open the stored invoice through a protected, audited retrieval action.

Payment status should be kept current so the clinic can distinguish **Pending**, **Paid**, and **Partial** invoices. Administrators can export billing history as CSV from the billing interface when reporting is required.

## Patient records and file access

Use **Patient Records** to search patients and review demographics, consultations, billing history, and stored artifacts. Stored barcode, QR, audio, and invoice files are opened through authenticated actions rather than unaudited direct links. This preserves a record of PHI access in the audit log.

| Record area | What staff can do |
|---|---|
| Patient profile | Review demographics and patient identifiers. |
| Consultations | Review historical clinical notes and finalized documentation. |
| Billing records | Review invoices, totals, and payment status. |
| Stored files | Open QR, barcode, audio, and invoice files through protected retrieval. |

## Exports and administrator-only actions

CSV exports are restricted to administrators. When an administrator opens patient or billing records, export buttons are available. When a non-admin user opens the same screens, export controls are hidden or replaced with an admin-only notice. This behavior is also enforced by the backend, so hiding a button is not the only protection.

## Audit logs and notifications

The audit log records important system actions, including patient creation, PHI access, consultation changes, stock changes, billing activity, and export activity. Administrators should review audit logs periodically and after unusual access reports. Notifications provide operational alerts such as new registration, invoice generation, and low-stock conditions.

## Recommended owner review before publishing

Before using the system with live clinic data, the owner should review all core workflows in the preview environment. Register a test patient, print a tracking slip, create a consultation note, update inventory, generate a bill, open stored artifacts, export CSV files as an admin, and confirm that a non-admin account cannot access administrator-only exports or audit logs. Publishing should be performed only by the owner through the project UI after this review.
