# Clinic CMS Publishing and End-User Rollout Guide

**Author:** Manus AI  
**Project:** Clinic CMS  
**Purpose:** This guide explains how to move the Clinic CMS from preview into end-user use, how to review the Management UI before publishing, how staff login and roles work, and where clinic operators can edit patient, billing, price, and inventory information.

> The Clinic CMS is designed for authenticated clinic workflows. It stores patient demographics, consultation notes, inventory records, invoices, notifications, audit logs, and protected file references. Before using it with real patient data, the clinic owner should complete a local policy, compliance, and access review according to the clinic’s own operating requirements.[1]

## 1. Publishing from the Management UI

The current project has already been checkpointed after the friendly UI refresh. Publishing is intentionally a **user-controlled action**. I cannot publish it for you from the chat because the owner must decide when the version is ready for live use. To publish, open the project’s **Management UI**, review the latest checkpoint preview, and then click the **Publish** button from the top-right publishing area.

| Step | What to do | Why it matters |
|---|---|---|
| Review the checkpoint | Open the latest checkpoint card and inspect the live preview. | This confirms the exact version that will go live. |
| Test core workflows | Register a test patient, create an inventory item, generate a bill, and open patient records. | This verifies that clinic-critical flows work before real users are invited. |
| Test admin and staff accounts | Use the owner/admin account and at least one non-admin staff account. | This confirms that role-based access is working in a realistic scenario. |
| Click **Publish** | Use the Management UI Publish button after the review is complete. | This makes the app available on its production URL. |
| Configure domain if needed | Use the Management UI domain settings for a built-in domain or custom domain. | This gives staff a stable address for daily access. |

After publishing, share the production URL only with staff who should use the clinic system. If you plan to use a custom domain, complete domain setup inside the Management UI rather than changing the application code. Keep the preview environment for owner review and the published environment for real use.

## 2. Recommended pre-launch checklist

Before full-scale clinic use, perform a dry run with non-real or test data. The goal is to confirm that the system supports the clinic’s operational flow, not only that the website loads.

| Area | Owner/admin verification | Expected result |
|---|---|---|
| Login | Open the site and sign in through the platform OAuth flow. | The user lands on the dashboard after authentication.[2] |
| Patient intake | Register a test patient from **Patient Registration**. | A patient ID, QR code, barcode, and printable slip are created.[3] |
| Clinical note | Use **Ambient Scribe** with a test consultation. | Audio can be uploaded, transcribed, structured, reviewed, and finalized.[3] |
| Pharmacy | Add a test medicine with quantity, reorder level, and unit price. | Stock appears in inventory, and low stock creates notifications when threshold conditions are met.[3] |
| Billing | Create a test invoice and update the payment status. | The invoice record appears with **Pending**, **Paid**, or **Partial** status.[4] |
| Patient records | Search the test patient and open stored artifacts. | Patient profile, consultations, billing history, and protected files can be reviewed.[3] |
| Admin exports | Sign in as admin and export patient or billing CSV. | Export controls are available only to admin users.[1] |
| Audit logs | Open **Audit Logs** as admin and then test as non-admin. | Admin can review logs; non-admin access is blocked.[1] |

## 3. Login and user access model

Staff login is handled through the platform OAuth flow. When a user clicks sign in, the app sends them to the OAuth portal and returns them to `/api/oauth/callback` on the same deployed origin. After login, the application resolves the user session and loads the dashboard.[2]

The CMS currently uses two roles: **admin** and **user**. The project owner is promoted to **admin** when the authenticated owner identifier matches the configured project owner identity. Other signed-in staff are treated as regular **user** accounts unless their role is changed by an authorized operator.[1]

| Role | Intended user | Can use clinic modules | Can export CSV | Can view audit logs | Notes |
|---|---|---:|---:|---:|---|
| Admin | Owner, clinic administrator, compliance lead | Yes | Yes | Yes | Admin-only procedures enforce exports and audit-log review on the backend.[1] |
| User | Reception, doctor, pharmacy staff, billing staff | Yes | No | No | Non-admin users can perform everyday workflow actions but cannot view administrative audit data or exports.[1] |

## 4. How to give access to specific roles

The simplest rollout pattern is to let each staff member sign in once, then review the `users` table in the Management UI database panel. If a staff member needs administrator privileges, the owner can change that user’s `role` value from `user` to `admin`. This should be done only for trusted staff because administrators can view audit logs and export patient and billing CSV data.[1]

| Access task | Recommended action | Operational caution |
|---|---|---|
| Add ordinary staff access | Ask the staff member to open the published URL and sign in. | Confirm the user appears in the database as `user`. |
| Promote an administrator | In the Management UI database panel, edit the staff member in the `users` table and set `role` to `admin`. | Give admin access only to staff who need export and audit-review powers. |
| Remove broad access | Change the user back to `user` or remove access according to the clinic’s access policy. | Confirm local policy before deleting records, because audit history and accountability matter. |
| Review permissions | Test the same page as admin and non-admin. | Audit logs and export controls should only be available to admins. |

## 5. Where to edit clinic information

The CMS is organized around operational modules in the left sidebar. Each module owns a different part of the clinic workflow. For daily staff, the most important distinction is whether they are editing **patients**, **clinical notes**, **inventory/prices**, or **billing/payment status**.

| Need | Go to | What can be changed or created | Who should normally do it |
|---|---|---|---|
| Register a patient | **Patient Registration** | Patient demographics, contact details, address, barcode/QR generation. | Reception or intake staff. |
| Review patient history | **Patient Records** | Search and review profile, consultations, billing history, barcode, QR, audio, and invoice files. | Reception, doctor, billing, or admin staff. |
| Capture consultation notes | **Ambient Scribe** | Upload audio, generate transcript, structure note, finalize with signature. | Doctor or clinical documentation staff. |
| Add medicine stock | **Pharmacy Inventory** | Item name, batch number, expiry date, quantity, reorder level, and unit price. | Pharmacy or inventory staff. |
| Edit medicine quantity | **Pharmacy Inventory** | Current available quantity and reorder level. | Pharmacy or inventory staff. |
| Edit medicine price | **Pharmacy Inventory** when adding inventory; billing line items when invoicing. | Unit price is captured on inventory creation; invoice item prices are entered in **Billing** when generating a bill.[4] | Pharmacy and billing staff. |
| Create invoice | **Billing** | Patient ID, itemized lines, quantities, unit prices, discount, tax, and final amount. | Billing staff. |
| Update payment status | **Billing** | Payment status: **Pending**, **Paid**, or **Partial**. | Billing staff. |
| Review alerts | **Notifications** | Mark notifications as read and review operational messages. | Any authenticated staff member. |
| Review audit activity | **Audit Logs** | Search and review activity records. | Admin only. |

## 6. Practical workflow for everyday use

A typical clinic day begins at the dashboard. Intake staff register the patient, print or use the OPD tracking slip, and then the doctor records or uploads consultation audio in Ambient Scribe. Pharmacy staff maintain inventory and prices, while billing staff generate invoices after consultation and dispensing. Administrators periodically review audit logs and exports.

| Stage | Staff action | System result |
|---|---|---|
| Intake | Register the patient and print the slip. | The patient becomes searchable, and barcode/QR assets are stored. |
| Consultation | Upload or capture consultation audio and finalize notes. | Structured medical notes are stored under the patient record. |
| Pharmacy | Add or update stock. | Low-stock thresholds can create notifications. |
| Billing | Create invoice and update payment status. | Invoice metadata and PDF artifact are stored. |
| Review | Search records and open artifacts through protected actions. | PHI file access is logged for accountability. |
| Oversight | Admin reviews audit logs and exports reports. | Clinic administration can monitor activity and reporting. |

## 7. What to tell staff before launch

Staff should understand that the CMS is not only a data-entry screen; it is a workflow and accountability system. They should sign in with their assigned account, avoid sharing accounts, and use the correct module for each task. Patient data should be entered carefully because it affects records, invoices, and audit trails. Administrators should periodically check audit logs and confirm that only appropriate staff have admin privileges.

## 8. Recommended launch sequence

The safest rollout is staged. First, publish the current checkpoint and keep access limited to the owner and one test user. Next, run one complete mock clinic visit with test data. After that, add role-specific staff in small groups: reception, doctor, pharmacy, billing, and admin. Once the team confirms the workflow, use the published URL as the clinic’s daily CMS entry point.

| Launch phase | Users involved | Recommended outcome |
|---|---|---|
| Owner review | Owner/admin only | Confirm preview and production URL load correctly. |
| Internal test | Owner plus one non-admin test user | Confirm role boundaries and everyday workflows. |
| Department pilot | Reception, doctor, pharmacy, billing | Confirm each department can complete its tasks. |
| Full use | All approved staff | Begin daily use with periodic admin review. |

## References

[1]: ./security-rbac-and-phi-handling.md "Clinic CMS Security, RBAC, and PHI Handling Notes"  
[2]: ../client/src/const.ts "Clinic CMS OAuth login URL helper"  
[3]: ./user-guide.md "Clinic CMS User Guide"  
[4]: ../server/routers.ts "Clinic CMS server procedures for inventory, billing, roles, and protected workflows"
