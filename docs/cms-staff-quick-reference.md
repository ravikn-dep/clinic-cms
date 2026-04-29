# Clinic CMS Staff Quick Reference

**Author:** Manus AI  
**Purpose:** This one-page handout summarizes where each clinic role should go in the CMS.

| If you need to... | Open this module | Main action |
|---|---|---|
| Register a new patient | **Patient Registration** | Enter demographics, generate patient ID, print OPD slip. |
| Find a patient | **Patient Records** | Search patient, review profile, consultations, files, and bills. |
| Create or review clinical notes | **Ambient Scribe** | Upload or capture consultation audio, review transcript, finalize note. |
| Add or update medicine stock | **Pharmacy Inventory** | Enter item, batch, expiry, quantity, reorder level, and unit price. |
| Change inventory price information | **Pharmacy Inventory** | Use the unit price field when adding or maintaining stock records. |
| Create an invoice | **Billing** | Add patient, line items, quantity, unit price, discount, tax, and payment method. |
| Update payment status | **Billing** | Set invoice status to **Pending**, **Paid**, or **Partial**. |
| Review alerts | **Notifications** | Read operational alerts and mark them as reviewed. |
| Review audit activity | **Audit Logs** | Admin-only review of system activity and PHI access records. |
| Change a staff role | Management UI Database panel | Owner/admin reviews the `users` table and changes `role` when appropriate. |

The safest rollout is to publish after owner review, test one complete mock visit, add staff gradually, and give admin access only to trusted users who need exports or audit review.
