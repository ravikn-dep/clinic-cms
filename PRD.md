# Clinic CMS — Product Requirements Document

**Document ID:** CMS-PRD-001
**Document Type:** Canonical Product Requirements Document
**Product:** Clinic Management System (Clinic CMS)
**Current Operating Facility:** MAX DIAGNOSTICS, Punjagutta, Hyderabad
**Product Authority:** Founder / Repository Owner
**Status:** ACTIVE
**Version:** 1.0.0
**Last Updated:** 2026-08-26
**Canonical Repository:** `ravikn-dep/clinic-cms`
**Canonical Git Baseline:** `210ef792919e588021e3fd6c6e13d35b28d58ed3`
**Canonical Baseline Meaning:** Merge commit for PR #14, Phase 4 Step 3 paper-first OP, billing, and visit closure
**Stable Milestone:** `phase4-step3-stable`

---

## 1. Purpose

This Product Requirements Document is the canonical product-level source of truth for Clinic CMS.

It defines:

- the current product scope;
- implemented and stable capabilities;
- authoritative user and business workflows;
- product-level data relationships;
- role and permission boundaries;
- audit, idempotency, safety, and mutation rules;
- product decisions that supersede older workflows;
- approved future developments;
- deferred capabilities;
- explicit non-goals;
- acceptance criteria for future implementation;
- the governance process for adding, changing, retiring, or implementing product requirements.

This document does **not** replace source code as evidence of what is currently implemented. Canonical merged source remains authoritative for implementation truth. This PRD is authoritative for intended product behavior, product direction, approved workflow, and future-development scope.

### 1.1 Mandatory Product Change Rule

> No new product feature, workflow, external integration, automation, AI behavior, data mutation, or major product behavior becomes part of the approved Clinic CMS roadmap until explicitly approved by the Product Authority.

AI systems, Manus, coding agents, developers, reviewers, and external contributors may propose ideas, but they may not self-approve those ideas into the canonical roadmap.

---

## 2. Source Authority and Reconciliation Rules

When product documents, old reports, TODO items, screenshots, abandoned local worktrees, and current source disagree, use the following authority order:

1. Current canonical merged source on protected `main`
2. Current canonical schema and deterministic baseline
3. Protected-CI validated merged implementation reports
4. Stable tags and merge history
5. Explicit Product Authority decisions
6. Older locally validated reports
7. `todo.md` and historical implementation ledgers
8. Obsolete prototypes, abandoned branches, historical checkpoints, and superseded ideas

The repository contains historical features and TODO entries that reflect older product directions. Those entries must not silently override later canonical product decisions.

---

## 3. Product Status Taxonomy

| Status | Meaning |
|---|---|
| `CANONICAL_STABLE` | Merged into protected `main`, validated, and accepted as current product behavior. |
| `IMPLEMENTED_VALIDATED` | Implemented and validated but not yet fully closed into canonical stable state. |
| `IN_PROGRESS` | Actively being developed. |
| `APPROVED_PLANNED` | Explicitly approved by Product Authority but not yet implemented. |
| `DEFERRED` | Intentionally postponed; not part of current implementation sequence. |
| `BLOCKED` | Approved but prevented by a known dependency or unresolved issue. |
| `RETIRED` | Previously implemented/planned direction that is no longer authoritative. |
| `OUT_OF_SCOPE` | Explicitly excluded from the current product. |

Unapproved ideas must not be represented as `APPROVED_PLANNED`.

---

# PART I — PRODUCT FOUNDATION

## 4. Product Vision

Clinic CMS is a practical clinic and diagnostic-center management platform designed initially for operations at **MAX DIAGNOSTICS, Punjagutta**.

The product coordinates:

- patient identity;
- appointment and visit intake;
- consultant attribution;
- OP generation and printing;
- longitudinal Patient Records;
- billing and payment tracking;
- pharmacy inventory;
- Purchase Orders;
- OCR-assisted procurement intake;
- Vendor Master;
- catalog management;
- Goods Receipts;
- stock movements;
- user administration;
- role-based access;
- audit evidence;
- notifications;
- future controlled external appointment and communication channels.

The present clinical operating model is deliberately **paper-first**, while preserving a consultation/encounter data model capable of supporting future digital or hybrid consultation workflows.

---

## 5. Current Operating Model

### 5.1 Current Facility

The current canonical deployment model is a **single operational facility**:

**MAX DIAGNOSTICS — Punjagutta**

No full multi-clinic tenancy model is part of the current canonical product.

### 5.2 Consultant Model

Multiple consultants may be represented as users with role `consultant`.

A consultant can have clinic-facing professional metadata including:

- name;
- qualifications;
- specialization;
- designation;
- department;
- state council / registration information;
- registration number;
- optional prescription header;
- optional consultant logo;
- optional signature asset;
- active/inactive state.

Consultant identity is server-authoritative for appointment attribution and consultation/OP context.

### 5.3 Core Operational Principle

The system must prefer **one coherent patient-visit workflow** over separate disconnected front-desk modules.

### 5.4 Unified Dashboard and Navigation

**Status: `IMPLEMENTED_VALIDATED`**

The authenticated application uses one role-aware dashboard and one primary navigation shell for admins, consultants, and staff. The dashboard and navigation are not separate role-specific applications; visible modules continue to be filtered by the existing feature-access and admin-only guards.

Primary navigation is grouped by operational intent:

| Group | Current destinations |
|---|---|
| **Dashboard** | Operational Home dashboard |
| **Clinic Workflow** | New Visit / Appointment, Today's Appointments, Patient Records, Billing |
| **Pharmacy & Inventory** | Pharmacy, Purchase Orders |
| **Admin / Management** | Catalog Management, User Management, Feature Access Control, OP Form Customization, Analytics, Audit Trail, Daily Export, Notifications where permitted |

**New Visit / Appointment** is the principal front-desk entry point. It combines consultant selection, conservative patient search, in-flow registration when required, explicit patient selection, and appointment creation. The underlying `/register-patient` route and registration API remain reachable for legitimate record-management use but are not promoted as a competing primary navigation action.

The Home dashboard is an operational read surface. Its primary CTA opens New Visit / Appointment, and its appointment queue is derived from the authoritative appointment list for the current day. Summary cards show today's appointments, checked-in visits, completed visits, and existing pharmacy/procurement attention where the current user has access. These dashboard reads do not create appointments, consultations, bills, Goods Receipts, stock movements, or other business records.

The dashboard does not introduce a separate analytics subsystem. The current Analytics page remains a limited administrative reporting surface, and future analytics requirements must not be inferred from dashboard presentation alone.

---

## 6. Foundational Domain Model

The following concepts must remain distinct.

| Domain object | Product meaning |
|---|---|
| **Patient** | Persistent longitudinal patient identity. |
| **Appointment** | Scheduling and visit-entry object. |
| **Consultation** | Encounter identity linked to a patient, consultant, and when applicable an appointment. |
| **OP Form** | Printable clinical encounter document; currently paper-first. |
| **Bill** | Financial record for a patient/encounter. For the canonical encounter workflow, successful encounter bill creation closes the visit. |
| **Patient Records** | Longitudinal patient hub for historical and future actions. |
| **Purchase Order** | Reviewed procurement record / purchase intent. |
| **Goods Receipt** | Authoritative physical receipt-posting event. |
| **Inventory** | Batch-aware available stock. |
| **Stock Movement** | Immutable movement/provenance record for stock changes. |
| **Catalog Item** | Canonical curated product identity. |
| **Vendor** | Explicitly governed supplier identity. |
| **Enquiry** | External/front-desk lead or appointment-intake record. |

These entities must not be collapsed merely to simplify UI implementation.

---

# PART II — USERS, ACCESS, AND SECURITY

## 7. User Roles

Canonical application roles are:

- `admin`
- `consultant`
- `staff`

A legacy/general `user` role may remain in the schema for historical compatibility, but current clinic operational authority is defined around admin, consultant, and staff.

---

## 8. Role-Based Access Control

### 8.1 Admin

Admin responsibilities may include:

- user creation and lifecycle management;
- consultant profile administration;
- role/feature permission administration;
- password set/reset for other users;
- audit-log access;
- catalog administration;
- Vendor Master administration;
- PO approval/rejection;
- operational consultant-completion override where explicitly supported;
- administrative reports/exports;
- configuration surfaces.

Admin authority does not imply automatic permission to bypass business invariants such as Goods Receipt requirements or stock-posting controls.

### 8.2 Consultant

Consultant authority includes:

- access to own consultant-context appointments where permitted;
- check/view visit context according to workflow;
- Generate OP for own checked-in visit when authorized;
- access own branded OP;
- mark own consultation complete / Ready for Billing;
- access patient records according to existing permissions;
- no ability to impersonate another consultant.

### 8.3 Staff

Staff responsibilities may include:

- New Visit / Appointment workflow;
- patient search and registration;
- consultant selection for booking;
- front-desk check-in;
- billing where `billing` permission is enabled;
- Purchase Order / Goods Receipt operations where `purchase_orders` permission is enabled;
- other feature-gated operational modules.

Staff must not impersonate consultant clinical completion.

---

## 9. User Management

**Status: `CANONICAL_STABLE`**
**Stable milestone:** `user-management-hardening-stable`

### 9.1 Required Capabilities

Admin can:

- create consultant/staff users;
- set an initial password;
- edit permitted profile fields;
- activate/deactivate users;
- reset another user's password;
- manage consultant-specific profile/branding information.

### 9.2 Password Rules

- passwords are hashed server-side using bcrypt;
- plaintext passwords are never returned from API procedures;
- password hashes are never returned through User Management APIs;
- self-service password change remains protected;
- administrator reset does not expose an existing password;
- inactive users must be rejected at authentication/session resolution;
- credential failure responses should avoid account-state disclosure.

### 9.3 Historical Identity Protection

A historically referenced user must not be hard-deleted merely because the account is no longer active.

Preferred lifecycle for referenced historical users:

**Deactivate, do not delete.**

The last active administrator must not be deletable through ordinary User Management.

### 9.4 User Cleanup

Mass deletion of legacy/stale users is **not canonical product behavior**.

Any future user-data cleanup requires a separate data-provenance and environment-specific approval process.

---

# PART III — PATIENT AND VISIT MANAGEMENT

## 10. Patient Identity

**Status: `CANONICAL_STABLE`**

### 10.1 Patient Record

Patient identity includes, where available:

- Patient ID;
- first name;
- last name;
- date of birth and/or age;
- gender;
- contact number;
- normalized contact number;
- email;
- address;
- barcode metadata;
- QR metadata;
- timestamps.

### 10.2 Duplicate Handling

Patient matching must be deterministic and conservative.

Existing workflow uses strong signals including:

- exact Patient ID;
- normalized mobile number;
- name matching.

Strong candidates must be shown for explicit human resolution.

The system must not silently merge patient identities.

### 10.3 Registration

If no existing patient is selected, an authorized user can register the patient within the New Visit workflow.

Patient creation must be auditable.

---

## 11. Unified New Visit / Appointment Workflow

**Status: `CANONICAL_STABLE`**
**Stable milestone:** `phase4-step2-stable`

The primary front-desk workflow is:

```text
NEW VISIT / APPOINTMENT
        ↓
SELECT ACTIVE CONSULTANT
        ↓
SEARCH PATIENT
   ├── EXISTING → SELECT
   └── NEW → REGISTER
        ↓
CREATE APPOINTMENT
        ↓
PATIENT ARRIVES
        ↓
CHECK-IN
```

Patient registration and appointment creation must not require separate disconnected front-desk workflows.

### 11.1 Appointment Sources

Canonical controlled appointment sources:

- `MANUAL`
- `WALK_IN`
- `PHONE`

Future external channels may map into the canonical appointment workflow but must not create a parallel appointment model.

### 11.2 Appointment Statuses

Canonical appointment states include:

- `Scheduled`
- `Checked-in`
- `Completed`
- `Cancelled`
- `No-show`
- `Rescheduled`

### 11.3 Appointment Attribution

Every operational appointment must retain:

- patient identity;
- consultant identity;
- date;
- time;
- source;
- status;
- relevant audit/lifecycle information.

### 11.4 Consultant Scope

A consultant must not book, check in, complete, or operate another consultant's appointment by client-side identity substitution.

### 11.5 Idempotency

Appointment/visit services must be resilient to retry and concurrent operations where applicable.

---

# PART IV — CONSULTATION AND OP

## 12. Canonical Paper-First Consultation Workflow

**Status: `CANONICAL_STABLE`**
**Stable milestone:** `phase4-step3-stable`
**Canonical merge:** `210ef792919e588021e3fd6c6e13d35b28d58ed3`

The authoritative visit lifecycle is:

```text
Scheduled
   ↓
Checked-in
   ↓
Generate OP
   ↓
Appointment-linked Consultation
   ↓
Print consultant-branded blank paper OP
   ↓
Doctor performs consultation and writes manually
   ↓
Consultation Completed / Ready for Billing
   ↓
Encounter Bill
   ↓
Appointment Completed
   ↓
Visit Closed
   ↓
Patient Records
```

### 12.1 Mandatory Invariant

**Consultation completion does not close the visit.**

Only successful consultation-linked encounter bill creation closes the appointment by marking it `Completed`.

### 12.2 Generate OP

Generate OP must:

- accept/operate from the appointment identity;
- require a checked-in appointment;
- resolve the patient server-side;
- resolve the consultant server-side;
- create or reuse the single appointment-linked consultation;
- be idempotent on retry;
- not create a bill;
- not complete the appointment;
- not mutate pharmacy inventory;
- not mutate procurement.

### 12.3 One Consultation Per Appointment

The database/application model must enforce one appointment-linked consultation per appointment.

A retry must reopen/reuse the same encounter.

---

## 13. Consultant-Branded OP Form

**Status: `CANONICAL_STABLE`**

### 13.1 Branding

The printable A4 OP must place:

**LEFT**
- consultant identity;
- qualifications;
- specialization;
- designation where configured;
- registration/council identity;
- optional logo.

**RIGHT**
- MAX DIAGNOSTICS;
- Punjagutta.

### 13.2 Patient Header

The OP may include:

- Patient ID;
- patient name;
- age;
- gender;
- mobile/contact;
- visit/consultation identifier;
- date/time;
- relevant QR/registration reference where supported.

### 13.3 Paper Clinical Sections

The current authoritative paper OP contains blank handwriting areas for:

- Chief complaints / history
- Clinical examination / findings
- Investigations
- Diagnosis / assessment
- Treatment / prescription
- Advice / follow-up
- Doctor signature

### 13.4 Print Boundary

Printing is a presentation operation.

Printing must not:

- mark consultation complete;
- create a bill;
- mark appointment Completed;
- create or dispense medicines;
- update inventory;
- create a Purchase Order;
- post a Goods Receipt.

---

## 14. Paper-First, Digital-Ready Architecture

### 14.1 Current Operational Mode

**PAPER-FIRST**

The doctor may write history, examination, diagnosis, treatment, prescription, and advice manually on the printed OP.

Digital clinical entry is not mandatory.

### 14.2 Digital-Ready Encounter

The `consultations` model continues to preserve nullable digital-ready fields such as:

- raw transcript;
- clinical history;
- present complaints;
- advised investigations;
- treatment plan;
- digital signature;
- audio references.

These fields must not be rendered as authoritative paper content in the current blank OP workflow.

### 14.3 Future Modes

Future architecture may support:

- `PAPER`
- `DIGITAL`
- `HYBRID`

This capability is **`APPROVED_PLANNED` as an architectural direction**, but a mandatory digital consultation workflow is not currently approved.

### 14.4 Retired Direction

**Mandatory fully digital consultation as the immediate primary Phase 4 workflow: `RETIRED`.**

Residual digital/scribe implementation may remain in source for compatibility or future reuse, but it is not the canonical current consultation workflow.

---

## 15. Consultation Completion / Ready for Billing

**Status: `CANONICAL_STABLE`**

### 15.1 Meaning

`consultations.isFinalized = 1` in the paper-first workflow means:

> The consultation encounter has occurred and is operationally complete/ready for billing.

It does **not** mean that digital clinical content has been digitally signed or medically certified.

### 15.2 Authority

Allowed:

- assigned active consultant;
- admin override where operationally required and auditable.

Not allowed:

- staff impersonating consultant completion;
- cross-consultant completion.

### 15.3 Completion Does Not Close Visit

After consultation completion:

- appointment remains not `Completed`;
- billing becomes available;
- no inventory mutation occurs.

---

# PART V — BILLING AND VISIT CLOSURE

## 16. Encounter Billing

**Status: `CANONICAL_STABLE`**

### 16.1 Billing Context

Encounter billing must derive the following server-side:

```text
Consultation
   → Patient
   → Consultant
   → Appointment
```

The client must not be able to substitute another patient into an encounter bill.

### 16.2 Billing Gate

Encounter bill creation requires the consultation to be finalized / Ready for Billing.

Opening the Billing page alone must not close the visit.

### 16.3 One Bill Per Encounter

For encounter billing:

- `bills.consultationId` is nullable;
- a unique index protects non-null consultation linkage;
- multiple historical/non-encounter bills with `NULL` consultationId remain permitted;
- retry must return/reuse the existing encounter bill instead of creating a duplicate.

### 16.4 Visit Closure

Successful creation/linkage of the encounter bill causes the linked appointment to become:

`Completed`

This is the canonical **Visit Closed** boundary.

### 16.5 Payment Is Separate

Visit closure is based on bill generation, not payment settlement.

Payment status may remain:

- `Pending`
- `Partial`
- `Paid`

without reopening the completed clinical visit.

### 16.6 Visit-Date Billing Selection

**Status: `IMPLEMENTED_VALIDATED`**

The Billing page provides a read-only, clinic-local date selector that lists appointment-authoritative visits for the selected day. The normal encounter workflow is:

```text
Selected clinic date → eligible finalized visit → Raise Bill
```

The server derives patient, consultant, consultation, appointment, billing state, and eligibility from existing relationships. Only a finalized consultation without an existing encounter bill exposes `Raise Bill`; scheduled, unfinished, completed, or already-billed visits remain non-actionable or show their current state. Generic/manual billing remains available and the canonical encounter billing procedure remains responsible for authorization, patient-substitution protection, idempotency, and visit closure.

---

## 17. Generic / Manual Billing

**Status: `CANONICAL_STABLE`**

The existing generic manual billing route may remain available for non-encounter billing.

It must not weaken the consultation-derived encounter billing controls.

---

## 18. Billing Outputs

Current product includes billing records and invoice/receipt infrastructure.

Where supported:

- invoice PDFs may be generated/stored;
- paid bill receipts may be generated;
- payment status is tracked;
- delivery status may be tracked;
- receipt delivery is a separate operation.

Future redesign of billing accounting is not part of the current approved scope.

---

# PART VI — PATIENT RECORDS

## 19. Patient Records as Longitudinal Hub

**Status: `CANONICAL_STABLE` for current visit-chain access; `APPROVED_PLANNED` for expanded longitudinal actions**

Patient Records is the preferred longitudinal hub after the active visit.

Conceptual relationship:

```text
PATIENT
 ├── Visit 1
 │    ├── Appointment
 │    ├── Consultant
 │    ├── Consultation / OP
 │    ├── Bill
 │    └── Completed
 ├── Visit 2
 │    └── ...
 ├── Documents
 ├── Billing history
 └── Future clinical/pharmacy/follow-up records
```

### 19.1 Current Minimum Visit Chain

Patient Records should be able to resolve:

- appointment;
- consultant;
- consultation / OP;
- bill;
- completed state.

### 19.2 Current Contextual Actions

**Status: `IMPLEMENTED_VALIDATED`**

The patient identity preview surfaces billing context near the patient identity when the user has billing access. One eligible finalized unbilled encounter opens Billing directly; multiple eligible encounters require explicit encounter selection; and zero eligible encounters displays an explanatory non-actionable state. Visit-level actions remain state-aware, including `Raise Bill` only for eligible encounters and `View Bill` for billed encounters. These actions do not create appointments, consultations, bills, or procurement records from Patient Records. The selected patient is presented as an inline expanded preview immediately beneath the selected patient row; only one patient preview is expanded at a time, and contextual patient/visit actions remain adjacent to the patient identity and relevant visit. This inline-preview refinement is `IMPLEMENTED_VALIDATED` after Preview acceptance.

### 19.3 Future Actions

Approved direction:

- View Visit
- Print OP
- View Bill
- Start New Visit
- follow-up entry
- future attached scanned OP
- future communication history

These extensions should be added incrementally rather than creating separate disconnected dashboards.

---

# PART VII — PROCUREMENT AND INVENTORY

## 20. Procurement Architecture

**Status: `CANONICAL_STABLE`**

Canonical procurement workflow:

```text
Supplier Document / Manual PO
        ↓
OCR / Parsing when used
        ↓
Human Review
        ↓
Explicit Vendor Master selection
        ↓
Catalog resolution where applicable
        ↓
Pending Approval Purchase Order
        ↓
Admin Approval
        ↓
Approved Purchase Order
        ↓
Goods Physically Received
        ↓
Goods Receipt
        ↓
Inventory Update
        ↓
Stock Movement
        ↓
Partially / Fully Received
```

### 20.1 Critical Inventory Invariant

> PO creation does not update inventory.
> PO approval does not update inventory.
> Only successful governed Goods Receipt posting updates inventory.

Any historical feature or TODO item claiming automatic stock update during PO creation is **`RETIRED`** and must not be restored.

---

## 21. Purchase Orders

**Status: `CANONICAL_STABLE`**

PO data includes:

- PO identity;
- Vendor Master linkage where applicable;
- vendor snapshot details;
- item lines;
- catalog link where accepted;
- ordered quantity;
- received quantity;
- unit price;
- totals;
- payment status;
- approval status;
- approval actor/time;
- authorization notes;
- expected delivery information.

### 21.1 Creation

PO creation must result in:

`Pending Approval`

unless a future product change is explicitly approved.

### 21.2 Approval / Rejection

PO approval/rejection is a governed administrative action.

Approval must:

- recheck current PO state;
- record actor/timestamp/history/audit;
- not update inventory.

### 21.3 Historical Integrity

Historical PO line description and reviewed extraction evidence must not be silently rewritten because catalog metadata later changes.

---

## 22. OCR-Assisted PO Intake

**Status: `CANONICAL_STABLE`**

### 22.1 Supported Document Types

Canonical OCR supports bounded:

- JPEG
- PNG
- PDF

PDF ingestion is bounded to the current safe small-batch model.

### 22.2 Core OCR Architecture

```text
Document
  ↓
OCR provider boundary
  ↓
Raw extracted text
  ↓
Deterministic parser
  ↓
Arithmetic reconciliation
  ↓
Editable human review
  ↓
Explicit submission
```

### 22.3 OCR Safety

OCR/parsing must not automatically:

- create authoritative Vendor Master entities;
- approve POs;
- create Goods Receipts;
- mutate inventory;
- create stock movements;
- silently accept catalog resolution.

### 22.4 Server-Owned Bounds

Document validation must remain server-authoritative, including:

- MIME allowlist;
- document byte limits;
- PDF page-count limit;
- OCR output-size limit;
- provider timeout;
- safe client error masking.

### 22.5 Human Review

Extracted values remain editable before PO submission.

Reviewed evidence should preserve provenance necessary for audit without persisting prohibited raw provider secrets/credentials.

---

## 23. Immutable PO Extraction Evidence

**Status: `CANONICAL_STABLE`**

A submitted reviewed extraction may create an immutable one-per-PO evidence snapshot containing:

- provider;
- document classification;
- extracted header/items/totals;
- reconciliation;
- warnings;
- corrections;
- final reviewed values;
- catalog resolutions;
- reviewer identity;
- timestamps.

Raw provider secrets, credential paths, signed URLs, and temporary paths must not be persisted as evidence.

---

## 24. Vendor Master

**Status: `CANONICAL_STABLE`**

### 24.1 Governance

Vendor Master is explicit governed reference data.

Admin can:

- create;
- update;
- activate/deactivate.

### 24.2 Identity

Vendor identity may include:

- vendor ID;
- name;
- normalized name;
- contact number;
- GST number;
- normalized GST number;
- address;
- bank details;
- drug-license metadata;
- email;
- active status.

### 24.3 OCR Boundary

OCR resolution must never silently create or overwrite Vendor Master.

A user must explicitly select an active vendor for governed PO creation when required by the workflow.

---

## 25. Catalog Management

**Status: `CANONICAL_STABLE`**

### 25.1 Catalog Item

Canonical curated product identity can include:

- canonical name;
- normalized name;
- generic name;
- brand;
- strength;
- dosage form;
- manufacturer;
- HSN;
- GST rate;
- active status.

### 25.2 Aliases

Aliases may be:

- global;
- vendor-specific.

Aliases are explicit human curation records.

### 25.3 Matching

Catalog matching is:

- deterministic;
- read-only;
- ranked;
- conflict-aware;
- explicit-acceptance only.

Catalog matching must not:

- create catalog records automatically;
- create aliases automatically;
- learn from an accepted suggestion without explicit future approval;
- merge products automatically;
- substitute generic/brand identities autonomously.

### 25.4 Catalog Writes

Catalog creation/update/deactivation/reactivation and alias management are admin-governed.

---

## 26. Goods Receipt

**Status: `CANONICAL_STABLE`**

Goods Receipt is the authoritative physical stock-posting event.

### 26.1 Preconditions

A receipt requires:

- approved PO;
- valid PO line;
- quantity within outstanding balance;
- catalog identity where required by current governed inventory path;
- explicit batch;
- valid expiry;
- actor authorization;
- unique Goods Receipt ID.

### 26.2 Partial Receipt

Partial receipts are supported.

For each PO line:

```text
Ordered quantity
- Previously received
= Outstanding quantity
```

A receipt must not exceed the outstanding quantity.

### 26.3 Duplicate Protection

Repeated submission of the same receipt identity must not create a second stock effect.

### 26.4 Concurrency

Receipt posting must serialize/recheck state so concurrent operations cannot over-receive the PO.

---

## 27. Assisted Goods Receipt Enhancement

**Status: `APPROVED_PLANNED`**
**Working designation:** Phase 3 Step 8.1

Approved desired workflow:

```text
Approved PO
   ↓
Receive Goods
   ↓
PO lines auto-populated
   ↓
Default receiving quantity = outstanding quantity
   ↓
Staff confirms actual quantity
   ↓
Staff enters/confirms batch + expiry + unit cost
   ↓
Explicit Post Goods Receipt
   ↓
Inventory update
```

This enhancement must remain confirmation-driven.

Auto-population must never mean automatic stock posting.

---

## 28. Inventory

**Status: `CANONICAL_STABLE`**

Current inventory is batch-aware.

Inventory identity may use:

- catalog identity where resolved;
- batch number;
- expiry date.

The application must not silently merge a governed catalog-linked item into a legacy free-text inventory row without explicit reconciliation.

### 28.1 Inventory Mutation Sources

Current governed positive stock posting is Goods Receipt driven.

Future dispensing/adjustment flows require explicit separate product approval.

---

## 29. Stock Movements

**Status: `CANONICAL_STABLE`**

Stock movement evidence should include:

- movement identity;
- Goods Receipt;
- Goods Receipt line;
- PO;
- inventory item;
- catalog item where available;
- item name;
- batch;
- quantity added;
- previous quantity;
- resulting quantity;
- actor;
- timestamp.

A receipt line must not produce duplicate stock movement effects.

---

# PART VIII — PHARMACY

## 30. Pharmacy Inventory Module

**Status: `CANONICAL_STABLE`**

Current product includes a pharmacy inventory management surface with batch, expiry, quantity, reorder level, and pricing support.

### 30.1 Current Scope

Current pharmacy scope is inventory-oriented.

### 30.2 Prescription-to-Dispensing Workflow

Structured consultant prescription → pharmacist dispensing → explicit stock deduction is **`DEFERRED`** until separately approved for implementation.

No paper prescription should automatically deduct inventory.

---

# PART IX — NOTIFICATIONS, DOCUMENTS, AND REPORTING

## 31. Notifications

**Status: `CANONICAL_STABLE` for current in-app/owner notification infrastructure; `APPROVED_PLANNED` for expanded patient/consultant automation**

Current notification infrastructure supports application notification records and selected owner/admin alerts.

Future notifications may include:

- appointment reminder;
- consultant appointment alert;
- follow-up reminder;
- patient confirmation;
- billing communication;
- review request.

External delivery channel behavior must be separately approved and privacy-reviewed.

---

## 32. Document and Asset Storage

**Status: `CANONICAL_STABLE`**

The application can preserve storage references for artifacts such as:

- barcode;
- QR;
- consultant logo;
- signature;
- audio;
- invoice/receipt artifacts where implemented.

Database records should store application-managed keys/references rather than secrets.

Protected retrieval must enforce authorization.

---

## 33. Audit Trail

**Status: `CANONICAL_STABLE`**

Audit evidence is expected for important state-changing or sensitive operations.

Examples include:

- patient registration / PHI access where implemented;
- appointment creation;
- check-in;
- OP print/view where supported;
- consultation completion;
- visit closure;
- billing;
- PO creation;
- PO approval/rejection;
- reviewed extraction submission;
- Goods Receipt;
- catalog writes;
- Vendor Master writes;
- User Management actions.

Audit actor identity must be server-derived.

Audit logs must not contain:

- plaintext passwords;
- password hashes;
- service credentials;
- raw cloud credentials;
- unnecessary sensitive payloads.

---

## 34. Reporting and Analytics

**Status: `CANONICAL_STABLE` for the existing dashboard and export surfaces; `IMPLEMENTED_VALIDATED` for the current lightweight analytics page; `APPROVED_PLANNED` for conversion-focused analytics**

Existing product includes the unified dashboard and reporting/export surfaces. The current Analytics page is present and appointment-backed, but its billing and patient datasets remain scaffolded rather than being treated as a complete financial or patient analytics source.

Approved future operational analytics direction includes:

- enquiry → appointment conversion;
- appointment → checked-in conversion;
- appointment/visit → OP completion;
- OP/visit → bill generation;
- consultant-level visit counts;
- channel attribution where enquiries are used;
- procurement/receipt progress.

Analytics must be descriptive and not silently mutate business state.

---

# PART X — EXTERNAL INTEGRATIONS

## 35. External Integration Foundation

**Status: `CANONICAL_STABLE` for current schema/security primitives**

Canonical source contains external integration primitives including:

- enquiries;
- external API audit logs;
- idempotency keys;
- request replay protection;
- appointment booking locks.

These primitives must be used rather than bypassed when future external assistants are integrated.

---

## 36. Future Appointment Intake Channels

**Status: `APPROVED_PLANNED`**

Approved future direction includes appointment/enquiry intake from:

- WhatsApp;
- website;
- phone/voice assistant;
- walk-in/front desk;
- Google;
- Instagram;
- referral;
- other controlled channels.

### 36.1 Canonical Ingress Rule

External channels must enter the existing domain model:

```text
External Enquiry
   ↓
Canonical Patient Search / Registration
   ↓
Canonical Consultant Selection
   ↓
Canonical Appointment
   ↓
Check-in
   ↓
Canonical Visit Workflow
```

They must not create parallel patient, appointment, billing, or inventory models.

---

## 37. Clinic Voice / Messaging Assistant

**Status: `APPROVED_PLANNED`**

Approved product direction:

- multilingual conversational front desk;
- English;
- Hindi;
- Telugu;
- appointment enquiry;
- patient-detail capture;
- availability/slot assistance;
- appointment creation through canonical APIs;
- consultant notification;
- follow-up communication;
- OP conversion tracking.

Preferred voice direction is a natural non-cloned South Indian female voice unless Product Authority later approves a different model.

External assistant authentication must use governed service authentication, replay protection, idempotency, scoped authority, and audit.

The assistant must not provide autonomous clinical diagnosis or prescribing authority.

---

## 38. Calendar Synchronization

**Status: `APPROVED_PLANNED`**

Future appointment orchestration may synchronize confirmed appointments with an approved calendar system.

CMS remains authoritative for the patient and appointment record.

Calendar integration must not become an independent source of patient identity.

---

# PART XI — AI AND AUTOMATION

## 39. AI-Assisted Capabilities

AI may assist with:

- OCR;
- document extraction;
- deterministic/assisted parsing support;
- administrative conversations;
- enquiry intake;
- scheduling assistance;
- summarization;
- future data-entry assistance;
- future optional clinical documentation support under separate governance.

---

## 40. AI Prohibited Autonomous Actions

Without new explicit Product Authority approval, AI must not autonomously:

- diagnose;
- prescribe;
- medically certify a consultation;
- approve a Purchase Order;
- reject/approve a financial transaction;
- post a Goods Receipt;
- mutate inventory;
- merge patients;
- create authoritative Vendor Master identity;
- create canonical catalog identities;
- accept catalog matches;
- close a visit;
- alter user authority.

AI output must remain assistive unless an explicitly approved workflow says otherwise.

---

# PART XII — UI / UX

## 41. UI Principles

Clinic CMS UI should remain:

- simple;
- minimal;
- fast for front-desk use;
- consultant-context aware;
- status-driven;
- low-click;
- responsive;
- print-friendly;
- human-confirmation oriented for irreversible mutations.

### 41.1 Workflow Consolidation

Prefer a single coherent workflow over duplicated navigation.

Example:

`New Visit / Appointment` should cover patient search/new registration + consultant booking rather than forcing staff to navigate between unrelated modules.

### 41.2 Clinical Surfaces

Clinical and billing screens should prioritize legibility and reliability over decorative effects.

### 41.3 Decorative Effects

Optional visual effects may be introduced later only as presentation enhancements.

Decorative WebGL/Three.js effects must never become dependencies of:

- authentication;
- clinical data entry;
- PO processing;
- billing;
- inventory;
- printing.

Current ThreeUI/Structure Flow integration is not part of canonical product scope unless separately approved and merged.

---

# PART XIII — RELIABILITY AND SAFETY

## 42. Server-Authoritative Identity

Client input must not be trusted for authoritative identity when that identity can be derived from stored relationships.

Examples:

- consultation → patient;
- consultation → consultant;
- consultation → appointment;
- appointment → patient;
- appointment → consultant;
- Goods Receipt → PO and line;
- audit actor → authenticated session.

---

## 43. Idempotency Requirements

Critical operations must be retry-safe.

| Operation | Required behavior |
|---|---|
| Generate OP | Reuse one appointment-linked consultation. |
| Complete consultation | No duplicate completion effect/audit on retry. |
| Create encounter bill | Return/reuse existing bill for same consultation. |
| Goods Receipt | Duplicate receipt ID produces zero second stock mutation. |
| Stock movement | One governed movement per authoritative receipt line. |
| External API request | Idempotency/replay controls where applicable. |
| Appointment booking | Conflict/concurrency protection where applicable. |

---

## 44. Transactional Boundaries

Operations that combine multiple authoritative mutations must use safe transaction boundaries where supported.

Examples:

- Goods Receipt + receipt lines + received quantities + inventory + stock movements + history/audit;
- encounter bill + bill lines + appointment closure;
- governed PO approval/rejection state + audit/history;
- user lifecycle mutation + audit as appropriate.

Partial business state should not be accepted as success.

---

## 45. Error and Privacy Boundary

Client errors should:

- expose actionable validation failures;
- mask raw provider/SDK secrets;
- avoid credential paths;
- avoid internal filesystem paths;
- avoid raw database internals when not needed;
- avoid unnecessary PHI.

Server logs must also avoid secrets and should minimize production exposure of sensitive identifiers.

---

# PART XIV — PRODUCT SAFETY MATRIX

## 46. Mutation and Authority Matrix

| Operation | Primary authority | May mutate | Must never silently mutate | Audit expected | Idempotency/concurrency |
|---|---|---|---|---|---|
| Patient search | Authenticated permitted user | none | patient demographics | PHI access where implemented | read-only |
| Patient registration | Authorized operational user | patient | PO/GR/inventory | yes | duplicate-aware |
| Appointment creation | Authorized staff/admin or consultant self-scope | appointment | consultation/bill/inventory | yes | conflict-safe |
| Check-in | Authorized user within scope | appointment check-in state | bill/inventory | yes | state-checked |
| Generate OP | Authorized visit actor | consultation create/reuse | bill/appointment completion/inventory | print/view audit where supported | idempotent |
| Consultation Completed | Consultant own / admin override | consultation finalization | bill/inventory | yes | idempotent |
| Encounter Bill | Billing authority | bill, bill items, linked appointment closure | procurement/inventory | yes | one bill/consultation |
| OCR | Authenticated PO access | transient extraction only | PO/GR/inventory | operational logs | read-only |
| Reviewed PO submit | PO-authorized user | Pending Approval PO + evidence | approval/inventory | yes | controlled |
| PO approval | Admin | PO approval/history | inventory | yes | state-checked |
| Goods Receipt | PO/receipt-authorized user | receipt, inventory, stock movement | unrelated clinical/billing | yes | strongly required |
| Catalog write | Admin | catalog/alias | PO history/inventory history | yes | duplicate-safe |
| Vendor write | Admin | Vendor Master | OCR evidence/PO history | yes | duplicate-safe |
| Password reset | Admin | credential hash | patient/billing/procurement | yes without secret | safe retry behavior |
| User deactivate | Admin | user active state | historical attribution | yes | protected |

---

# PART XV — MODULE INVENTORY

## 47. Canonical Module Register

| Module ID | Module | Status | Primary actors | Purpose |
|---|---|---|---|---|
| MOD-AUTH-001 | Authentication | `CANONICAL_STABLE` | All | Secure session/credential access. |
| MOD-USR-001 | User Management | `CANONICAL_STABLE` | Admin | Consultant/staff lifecycle and password administration. |
| MOD-RBAC-001 | Feature Access / RBAC | `CANONICAL_STABLE` | Admin | Server-side role and feature gating. |
| MOD-CON-001 | Consultant Profile | `CANONICAL_STABLE` | Admin, Consultant | Professional identity and OP branding. |
| MOD-PAT-001 | Patient Registration | `CANONICAL_STABLE` | Staff/Admin | Patient identity creation. |
| MOD-PAT-002 | Patient Records | `CANONICAL_STABLE` | Authorized users | Longitudinal record hub. |
| MOD-VIS-001 | New Visit / Appointment | `CANONICAL_STABLE` | Staff/Admin/Consultant scope | Unified intake and booking. |
| MOD-VIS-002 | Check-in | `CANONICAL_STABLE` | Authorized users | Patient arrival transition. |
| MOD-OP-001 | Paper OP Generation | `CANONICAL_STABLE` | Consultant/Admin/authorized workflow | Branded blank paper OP. |
| MOD-CON-002 | Consultation Encounter | `CANONICAL_STABLE` | Consultant/Admin | Encounter identity and billing readiness. |
| MOD-BIL-001 | Encounter Billing | `CANONICAL_STABLE` | Billing-authorized users | Financial record and visit closure. |
| MOD-BIL-002 | Generic Billing | `CANONICAL_STABLE` | Billing-authorized users | Non-encounter billing. |
| MOD-PHA-001 | Pharmacy Inventory | `CANONICAL_STABLE` | Authorized users | Batch inventory management. |
| MOD-PO-001 | Purchase Orders | `CANONICAL_STABLE` | Staff/Admin | Procurement record lifecycle. |
| MOD-OCR-001 | PO OCR | `CANONICAL_STABLE` | PO-authorized users | Document extraction. |
| MOD-OCR-002 | PO Parser/Reconciliation | `CANONICAL_STABLE` | PO-authorized users | Deterministic structured extraction/reconciliation. |
| MOD-PO-002 | Review Evidence | `CANONICAL_STABLE` | PO-authorized users | Immutable reviewed extraction snapshot. |
| MOD-VEN-001 | Vendor Master | `CANONICAL_STABLE` | Admin | Governed supplier identity. |
| MOD-CAT-001 | Catalog Matching | `CANONICAL_STABLE` | PO reviewers | Deterministic product suggestions. |
| MOD-CAT-002 | Catalog Administration | `CANONICAL_STABLE` | Admin | Curated product/alias lifecycle. |
| MOD-GR-001 | Goods Receipt | `CANONICAL_STABLE` | PO/receipt-authorized users | Physical receipt posting. |
| MOD-INV-001 | Inventory Posting | `CANONICAL_STABLE` | System via governed GR | Batch stock update. |
| MOD-STK-001 | Stock Movements | `CANONICAL_STABLE` | System | Immutable stock provenance. |
| MOD-NOT-001 | Notifications | `CANONICAL_STABLE` | Users/Admin | In-app/owner notification infrastructure. |
| MOD-AUD-001 | Audit Trail | `CANONICAL_STABLE` | Admin/system | Action attribution and traceability. |
| MOD-ANA-001 | Analytics | `IMPLEMENTED_VALIDATED` | Admin | Existing dashboard and lightweight appointment-backed reporting; richer billing/patient analytics remain incomplete. |
| MOD-EXT-001 | External API Security Foundation | `CANONICAL_STABLE` | External services | Audit/idempotency/replay controls. |
| MOD-EXT-002 | WhatsApp/Website/Voice Intake | `APPROVED_PLANNED` | Patients/assistant/staff | External enquiry and appointment orchestration. |
| MOD-GR-002 | Assisted Goods Receipt | `APPROVED_PLANNED` | Staff/Admin | Pre-populate receipt confirmation from approved PO. |
| MOD-DIG-001 | Digital/Hybrid Consultation | `APPROVED_PLANNED` | Consultant | Optional future structured encounter documentation. |
| MOD-MULTI-001 | Multi-clinic Tenancy | `DEFERRED` | Admin/Consultants | Future clinic/location separation. |

---

# PART XVI — CURRENT STABLE BASELINE

## 48. Stable Milestone Register

| Milestone | Target commit | Annotated tag object | Status | Canonical meaning |
|---|---|---|---|---|
| `phase3-step4-stable` | `8ef89a9338a37a59dc7ec4872b68e65cfc5a7e8e` | `1d2dfcc32c63c987cba48a6f15fd5b893e2e498f` | `CANONICAL_STABLE` | Reviewed PO evidence/audit baseline. |
| `phase3-step5-stable` | `8999ba7e75c142c2e2685d1cec9bf0d630a2b7e6` | `76df430c4fdfe19e8d1632fe353f237b138b8fd6` | `CANONICAL_STABLE` | Safe supplier catalog matching. |
| `phase3-step6-stable` | `20d1dca9e0a8adca06a5bc46f85057f151388154` | `d896c53e7ecba844aabe7e7c2b4680b164f87bd4` | `CANONICAL_STABLE` | Bounded PDF/multi-page OCR. |
| `phase3-step7-stable` | `535a0d06352faebff62daaf886516b61cb94e8bd` | `1a133fdb81ef80272d51943ee7e5790264de7d89` | `CANONICAL_STABLE` | Governed catalog administration. |
| `phase3-step8-stable` | `a679dd189b6df826b03bc35a6acf56d12e8342ef` | `ec7c2ed3af1e779444f2487ea70d506766b9fee5` | `CANONICAL_STABLE` | Governed procurement and inventory posting. |
| `phase4-step1-stable` | `1463e3da8c175357951bda62d87adf8abecbcdc6` | `1c6bdecb099287bbcb39b0cf0da39cdd3a9cf17c` | `CANONICAL_STABLE` | Consultant-specific OP foundation. |
| `phase4-step2-stable` | `25f0aae1b73af54ec741c8736dd5964977be6a86` | `01b24e2d58cae08224c84a0b4f424fc9e5d25cb7` | `CANONICAL_STABLE` | Unified consultant visit workflow. |
| `user-management-hardening-stable` | `55574b63c3b664e27eb57a24d3dfce94db6e652e` | `a6f126ae533629f1c7f81e2b5729c910ce5aeb45` | `CANONICAL_STABLE` | Admin password reset/user lifecycle hardening. |
| `phase4-step3-stable` | `210ef792919e588021e3fd6c6e13d35b28d58ed3` | `dac30c77c36da9fb33a1cce44c13ca9b48eb3578` | `CANONICAL_STABLE` | Paper-first OP, encounter billing, visit closure. |

All nine listed stable milestones are annotated tags. The **Target commit** column contains the peeled commit returned by `git rev-parse <tag>^{commit}`; the **Annotated tag object** column contains the object returned by `git rev-parse <tag>`.

---

# PART XVII — ROADMAP

## 49. NOW

Current canonical baseline is Phase 4 Step 3 stable.

Primary product task after PRD adoption should be selected explicitly by Product Authority.

No automatic continuation is authorized by this document.

---

## 50. NEXT — Approved Planned

### 50.1 Assisted Goods Receipt — Step 8.1

**Status: `APPROVED_PLANNED`**

Goal:

Reduce manual receipt data entry after PO approval while preserving explicit confirmation and stock-posting governance.

### 50.2 Patient Records Longitudinal Expansion

**Status: `APPROVED_PLANNED`**

Goal:

Make Patient Records the place from which completed visit, OP, bill, follow-up, future document, and later communication actions are accessed.

### 50.3 External Appointment Intake

**Status: `APPROVED_PLANNED`**

Goal:

Allow WhatsApp, website, and voice enquiries to enter the canonical appointment lifecycle.

### 50.4 Consultant Notifications / Appointment Automation

**Status: `APPROVED_PLANNED`**

Goal:

Notify consultant appropriately after booking and support reminders/calendar integration without duplicating appointment state.

---

## 51. LATER — Approved Architectural Direction

### 51.1 Digital / Hybrid Consultation

**Status: `APPROVED_PLANNED`**

Possible future capabilities:

- structured digital history;
- findings;
- diagnosis;
- investigations;
- treatment;
- prescription;
- follow-up;
- voice dictation;
- scanned handwritten OP attachment;
- controlled AI-assisted extraction.

Clinical automation requires separate safety/medico-legal review before implementation.

---

## 52. DEFERRED

### 52.1 Full Multi-Clinic Tenancy

**Status: `DEFERRED`**

Future architecture may allow:

- clinic/facility selection;
- consultant-specific clinic context;
- tenant/facility branding;
- clinic-specific permissions;
- separate operational dashboards.

Current single-facility workflow must not be complicated prematurely by tenancy requirements.

### 52.2 Prescription-Linked Pharmacy Dispensing

**Status: `DEFERRED`**

A future governed pharmacy workflow may connect an authorized prescription to explicit pharmacist dispensing and negative stock movement.

It is not currently part of the paper-first consultation workflow.

---

# PART XVIII — RETIRED / SUPERSEDED PRODUCT DIRECTIONS

## 53. Retired Decisions

| Retired direction | Status | Replacement |
|---|---|---|
| Mandatory fully digital clinical consultation as immediate Phase 4 workflow | `RETIRED` | Paper-first OP with digital-ready consultation encounter. |
| Appointment/consultation completion before billing closes the visit | `RETIRED` | Encounter bill creation is the visit closure boundary. |
| Separate primary Patient Registration and Appointment workflows | `RETIRED` | Unified New Visit / Appointment workflow. |
| Automatic inventory update on PO creation | `RETIRED` | Inventory updates only through governed Goods Receipt. |
| Automatic inventory update on PO approval | `RETIRED` | Approval is financial/procurement state only; GR posts stock. |
| Automatic catalog/alias learning from accepted OCR matches | `RETIRED / NOT APPROVED` | Explicit governed human catalog curation. |
| Hard deletion of referenced users for cleanup | `RETIRED / NOT APPROVED` | Deactivation preserves historical attribution. |

Residual source or TODO entries describing retired behavior must not be treated as current requirements.

---

# PART XIX — EXPLICIT NON-GOALS

## 54. Current Out-of-Scope Behaviors

The following are not approved current product behavior:

- autonomous diagnosis;
- autonomous prescribing;
- autonomous clinical sign-off;
- AI-driven patient merging;
- AI-driven catalog creation;
- AI-driven Vendor Master creation;
- automatic PO approval;
- automatic Goods Receipt posting;
- stock update merely because a PO exists or is approved;
- automatic dispensing from a handwritten prescription;
- uncontrolled external API writes;
- external assistant bypass of CMS RBAC;
- full multi-clinic tenancy in the current phase;
- production database migration without explicit authorization;
- hard deletion of historically referenced users;
- uncontrolled persistence of raw provider secrets;
- using decorative UI effects as operational dependencies.

---

# PART XX — KNOWN LIMITATIONS AND TECHNICAL DEBT

## 55. Known Product / Engineering Limitations

The following should remain visible to future developers and agents:

1. Historical `todo.md` includes superseded product claims; PRD status and current canonical source take precedence.
2. Legacy Ambient Scribe/digital consultation source remains present, although paper-first is the current authoritative clinical workflow.
3. Generic manual billing remains alongside encounter billing.
4. Patient Records is not yet a full EHR and should not be described as one.
5. Prescription-linked pharmacy dispensing is not yet part of the canonical visit workflow.
6. External WhatsApp/voice/website orchestration is not yet fully connected to the canonical patient/appointment lifecycle.
7. Production/development schema drift has occurred historically; future migration work must use deterministic baseline and forward-only validation.
8. Large frontend bundle advisories have been observed and may require future performance work.
9. Existing authentication/session behavior may have future session-invalidation improvements.
10. Historical user provenance concerns require separate data-governance analysis if cleanup is attempted.
11. Paper clinical content is not automatically archived digitally in the current workflow.
12. Clinical AI or automated extraction of handwritten OP is not approved as current authoritative documentation.

---

# PART XXI — REQUIREMENT TRACEABILITY

## 56. Core Requirement Register

| Requirement ID | Requirement | Module | Status | Primary evidence |
|---|---|---|---|---|
| PAT-001 | Patient is persistent longitudinal identity. | Patients | `CANONICAL_STABLE` | schema + patient workflow |
| PAT-002 | Patient matching must not silently merge identities. | Patients | `CANONICAL_STABLE` | unified visit workflow |
| VIS-001 | New Visit combines consultant selection, patient search/register, and booking. | Visits | `CANONICAL_STABLE` | Phase 4 Step 2 |
| VIS-002 | Appointment must support Checked-in before OP generation. | Visits | `CANONICAL_STABLE` | appointments schema |
| VIS-003 | Visit closes only after encounter bill exists. | Visits/Billing | `CANONICAL_STABLE` | Phase 4 Step 3 |
| OP-001 | Generate OP operates from stored appointment context. | OP | `CANONICAL_STABLE` | Phase 4 Step 3 |
| OP-002 | One appointment-linked consultation per appointment. | Consultation | `CANONICAL_STABLE` | unique appointment link |
| OP-003 | Current OP is paper-first with blank clinical writing sections. | OP | `CANONICAL_STABLE` | OP renderer |
| OP-004 | Consultant identity left; MAX DIAGNOSTICS/Punjagutta right. | OP | `CANONICAL_STABLE` | branded OP |
| OP-005 | Printing does not close consultation/visit or bill. | OP | `CANONICAL_STABLE` | Phase 4 Step 3 |
| CON-001 | Consultation completion means Ready for Billing, not visit closure. | Consultation | `CANONICAL_STABLE` | Phase 4 Step 3 |
| CON-002 | Consultant owns own completion; admin may override audibly/auditably. | Consultation | `CANONICAL_STABLE` | Phase 4 Step 3 |
| BIL-001 | Encounter bill derives patient/appointment from consultation. | Billing | `CANONICAL_STABLE` | createEncounter flow |
| BIL-002 | One non-null bill per consultation. | Billing | `CANONICAL_STABLE` | unique index |
| BIL-003 | Payment settlement is separate from visit closure. | Billing | `CANONICAL_STABLE` | Phase 4 Step 3 |
| PRD-001 | New ideas require Product Authority approval before approved scope. | Governance | `CANONICAL_STABLE` | this PRD |
| PO-001 | New reviewed/manual PO enters Pending Approval. | Procurement | `CANONICAL_STABLE` | Phase 3 |
| PO-002 | PO approval does not update stock. | Procurement | `CANONICAL_STABLE` | Phase 3 Step 8 |
| OCR-001 | OCR/parsing are human-review support, not automatic stock mutation. | OCR | `CANONICAL_STABLE` | OCR reports/source |
| OCR-002 | JPEG/PNG/bounded PDF supported. | OCR | `CANONICAL_STABLE` | Phase 3 Step 6 |
| CAT-001 | Catalog matching is deterministic and explicit-acceptance only. | Catalog | `CANONICAL_STABLE` | Step 5 |
| CAT-002 | Catalog writes/aliases are governed admin operations. | Catalog | `CANONICAL_STABLE` | Step 7 |
| VEN-001 | Vendor Master is explicit governed reference data. | Vendor | `CANONICAL_STABLE` | Step 8 |
| GR-001 | Inventory changes only after successful Goods Receipt. | Goods Receipt | `CANONICAL_STABLE` | Step 8 |
| GR-002 | Goods Receipt supports partial receipt and rejects over-receipt. | Goods Receipt | `CANONICAL_STABLE` | Step 8 |
| GR-003 | Duplicate receipt does not create second stock effect. | Goods Receipt | `CANONICAL_STABLE` | Step 8 |
| GR-004 | Approved PO receipt form should auto-populate outstanding lines after Step 8.1. | Goods Receipt | `APPROVED_PLANNED` | Founder approval |
| INV-001 | Inventory is batch/expiry aware. | Inventory | `CANONICAL_STABLE` | schema |
| STK-001 | Stock movements preserve receipt provenance. | Stock | `CANONICAL_STABLE` | schema/Step 8 |
| USR-001 | Admin can create/reset consultant/staff credentials without exposing secrets. | Users | `CANONICAL_STABLE` | user-management stable |
| USR-002 | Inactive user cannot authenticate. | Users | `CANONICAL_STABLE` | user-management stable |
| USR-003 | Referenced historical users should be deactivated rather than deleted. | Users | `CANONICAL_STABLE` | user-management policy |
| EXT-001 | External channels must enter canonical patient/appointment workflow. | External | `APPROVED_PLANNED` | product decision |
| EXT-002 | External requests require audit/idempotency/replay protection. | External | `CANONICAL_STABLE` foundation | schema |
| DIG-001 | Digital/hybrid consultation remains optional future architecture. | Clinical | `APPROVED_PLANNED` | product decision |
| MULTI-001 | Multi-clinic tenancy is postponed. | Platform | `DEFERRED` | product decision |

---

# PART XXII — PRODUCT DECISION REGISTER

## 57. Canonical Product Decisions

| Decision ID | Decision | Status | Authority | Product impact |
|---|---|---|---|---|
| DEC-001 | Current facility context is MAX DIAGNOSTICS, Punjagutta. | ACTIVE | Product Authority | Avoid premature multi-tenancy. |
| DEC-002 | Consultant branding appears left; facility branding appears right on OP. | ACTIVE | Product Authority | Standard OP identity. |
| DEC-003 | Front desk uses unified New Visit / Appointment workflow. | ACTIVE | Product Authority | Eliminates duplicate registration/booking workflows. |
| DEC-004 | Consultation is paper-first now. | ACTIVE | Product Authority | No mandatory digital clinical entry. |
| DEC-005 | Consultation object remains future digital/hybrid-ready. | ACTIVE | Product Authority | Preserves extensibility. |
| DEC-006 | Consultation completion does not close visit. | ACTIVE | Product Authority | Billing remains required. |
| DEC-007 | Encounter bill creation closes the visit. | ACTIVE | Product Authority | Appointment becomes Completed after bill linkage. |
| DEC-008 | Patient Records is the longitudinal hub. | ACTIVE | Product Authority | Future actions should converge there. |
| DEC-009 | PO creation/approval do not update inventory. | ACTIVE | Product Authority | Prevents procurement/accounting events from fabricating stock. |
| DEC-010 | Goods Receipt is the authoritative inventory posting event. | ACTIVE | Product Authority | Batch/expiry/quantity confirmation required. |
| DEC-011 | Catalog acceptance and alias creation remain explicit human-governed actions. | ACTIVE | Product Authority | Prevents silent identity drift. |
| DEC-012 | Historically referenced users are preserved through deactivation. | ACTIVE | Product Authority | Protects attribution. |
| DEC-013 | External assistants use canonical CMS workflows rather than parallel models. | ACTIVE | Product Authority | Preserves single source of truth. |
| DEC-014 | New product ideas require explicit approval before PRD inclusion as approved scope. | ACTIVE | Product Authority | Controls scope drift. |

---

# PART XXIII — ACCEPTANCE CRITERIA FOR APPROVED FUTURE WORK

## 58. Assisted Goods Receipt — GR-004

A future Step 8.1 implementation is acceptable only if:

1. Approved PO lines are automatically shown.
2. Ordered, received, and outstanding quantities are visible.
3. Default receive quantity may equal outstanding quantity.
4. User can correct actual received quantity before posting.
5. Batch is explicit.
6. Expiry is explicit and validated.
7. Unit cost can be reviewed/confirmed as applicable.
8. No stock update occurs before explicit Post Goods Receipt.
9. Duplicate receipt retry produces zero second stock mutation.
10. Over-receipt is rejected.
11. PO remains linked to resulting receipt/history.
12. Existing Step 8 procurement safety tests remain green.

---

## 59. External Appointment Intake — EXT-001

A future external appointment integration is acceptable only if:

1. External enquiry gets a stable enquiry identity.
2. Patient identity is searched through canonical matching.
3. Existing patient is reused only after deterministic/human-safe resolution.
4. New patient uses canonical patient registration.
5. Consultant availability is server-authoritative.
6. Appointment is created through canonical appointment service.
7. Duplicate external request is idempotent.
8. Request replay is protected.
9. External action is audited.
10. No external system bypasses clinic RBAC/business validation.
11. Enquiry can be traced to appointment and conversion outcome.
12. External assistant cannot prescribe/diagnose.

---

## 60. Digital / Hybrid Consultation — DIG-001

A future digital/hybrid consultation is acceptable only after separate approval of detailed scope and safety controls.

At minimum it must:

1. Reuse the existing consultation encounter identity.
2. Avoid creating duplicate visit models.
3. Preserve paper-first compatibility.
4. Clearly distinguish draft from finalized clinical content.
5. Define consultant authorship/sign-off semantics.
6. Define scanned-paper attachment provenance.
7. Keep AI assistive unless separately authorized.
8. Preserve audit and version history where clinically appropriate.
9. Not silently alter handwritten/paper historical records.
10. Undergo privacy, medico-legal, clinical-safety, and usability review.

---

# PART XXIV — PRD CHANGE GOVERNANCE

## 61. PRD Change Rules

1. `PRD.md` is the canonical product requirements document.
2. Current merged source remains authoritative for implemented behavior.
3. New ideas do not automatically become approved scope.
4. Any proposed product behavior must first be presented to the Product Authority.
5. Only explicit Product Authority approval may move an item to `APPROVED_PLANNED`.
6. Implementation prompts must cite the relevant Requirement IDs.
7. An implementation must not silently conflict with an existing ACTIVE Product Decision.
8. If requested implementation conflicts with this PRD, the agent/developer must stop and report the conflict.
9. After merge/stable validation, implemented requirements should move to `CANONICAL_STABLE`.
10. Retired requirements/decisions must remain historically recorded instead of being silently deleted.
11. Major workflow changes require a new Decision ID.
12. AI may recommend changes but may not approve them.
13. Product-code changes and PRD changes should be traceable to the same approved requirement when practical.
14. Database migrations require explicit scope and must remain forward-only unless a separately approved recovery process says otherwise.
15. Production changes remain user-controlled and require separate authorization.

---

## 62. New Idea Workflow

```text
IDEA
  ↓
Product / Architecture Assessment
  ↓
Proposal
  ↓
Product Authority Review
  ├── APPROVED
  ├── REJECTED
  └── DEFERRED
       ↓
If Approved:
Update PRD requirement + decision
       ↓
Implementation branch
       ↓
Local tests
       ↓
Local immutable commit
       ↓
PR
       ↓
Protected CI
       ↓
Product Authority merge
       ↓
Stable tag
       ↓
PRD status updated to CANONICAL_STABLE
```

Validated implementation work must be committed locally before temporary Manus workspaces are reset, so an immutable source SHA is always available.

---

## 63. Required Prompt Header for Future Implementation

Future implementation instructions should begin with language equivalent to:

> Read `PRD.md` first. Identify the Requirement IDs governing this task. Do not implement behavior that conflicts with `PRD.md`. If the requested work conflicts with an ACTIVE Product Decision or requirement, stop and report the conflict rather than silently changing product architecture.

---

# PART XXV — RELEASE GOVERNANCE

## 64. Standard Feature Lifecycle

Preferred development sequence:

1. Canonical baseline confirmed.
2. Dedicated feature branch.
3. Scope audit.
4. Implementation.
5. Local validation.
6. **Local commit immediately after successful validation.**
7. Normal push.
8. Pull request to protected `main`.
9. Required CI.
10. Product Authority review/merge.
11. Canonical `main` verification.
12. Stable tag when appropriate.
13. PRD status update.

No force push should be used for normal product development.

---

## 65. Protected CI Expectations

The repository's protected validation should continue to include, as applicable:

- deterministic fresh MySQL baseline/bootstrap;
- TypeScript type check;
- unit/integration tests;
- production build;
- migration integrity;
- diff/format hygiene as applicable.

A green historical test run cannot substitute for a failing current branch.

---

# PART XXVI — SOURCES AND CURRENT BASELINE EVIDENCE

## 66. Primary Canonical Source Paths

Current PRD v1.0.0 was reconciled primarily against the merged repository state at `210ef792919e588021e3fd6c6e13d35b28d58ed3`, including:

- `drizzle/schema.ts`
- `drizzle/baseline/current_schema.sql`
- `scripts/bootstrap_baseline.ts`
- `server/db.ts`
- `server/routers.ts`
- `server/paperFirstWorkflow.ts`
- `server/paperFirstWorkflow.test.ts`
- `client/src/App.tsx`
- `client/src/pages/NewVisit.tsx`
- `client/src/pages/Appointments.tsx`
- `client/src/pages/PatientRecords.tsx`
- `client/src/pages/Billing.tsx`
- `client/src/pages/PurchaseOrders.tsx`
- `client/src/pages/CatalogManagement.tsx`
- `client/src/pages/UserManagement.tsx`
- `client/src/lib/opFormGenerator.ts`
- `client/src/lib/dashboardNavigation.ts`
- `server/dashboardNavigation.test.ts`
- `todo.md`
- merged Phase 3/Phase 4 implementation history
- stable milestone tags
- PR #14 paper-first Step 3 merge evidence

Historical TODO claims were not automatically treated as current product truth when contradicted by later canonical source or explicit decisions.

---
# PART XXVII — PHASE 4 STEP 3 WORKFLOW RECONCILIATION
## 67. Unified Patient Visit Architecture
The validated implementation now treats the **Encounter** as the first-class attendance record for a patient visit. Patient intake may search by Patient ID, normalized Indian mobile number, or name; register a patient when no safe match exists; select an active consultant; and create or resume a same-day encounter without requiring an appointment. Appointments remain an optional scheduling and reminder channel, and appointment check-in converges into the same encounter identity.

The paper-first invariant remains unchanged and is enforced server-side: an encounter begins `Present`, explicit check-in transitions it to `Checked-in`, only a checked-in encounter may generate the paper OP, the consultant completes the paper consultation, and billing remains the `Ready for Billing` / closure boundary. Direct encounters and appointment-linked encounters share the same consultation, Patient Records, and Billing contracts. Encounter creation, check-in, OP generation, consultation completion, and billing closure are audited and consultant-scoped; no procurement or inventory mutation is part of the patient visit workflow.

Patient identifiers continue to use the clinic-local `DOCM-DD/MM/YYOP###` format. New registrations use a transactional daily sequence row to avoid count-and-retry collisions under concurrent registration, while historical Patient IDs remain immutable. The deterministic fresh-database baseline and forward migration both include the Encounter and daily sequence entities; existing installations continue through the historical forward-migration path.
---
# PART XXVIII — PRD CHANGE HISTORY

## 68. Change History

| Version | Date | Change | Approved By | Canonical Baseline |
|---|---|---|---|---|
| 1.0.0 | 2026-08-26 | Initial canonical reconstruction after Phase 4 Step 3; reconciles current source, stable milestones, retired workflows, and approved future direction. | Product Authority | `210ef792919e588021e3fd6c6e13d35b28d58ed3` |
| 1.0.1 | 2026-08-26 | Records the validated dashboard/navigation refinement: grouped role-aware navigation, New Visit as the principal front-desk entry point, appointment-authoritative Home queue, and no new analytics subsystem. | Product Authority | `210ef792919e588021e3fd6c6e13d35b28d58ed3` |
| 1.0.2 | 2026-08-27 | Records the validated Billing visit-date selection and Patient Records contextual-action refinement; preserves encounter billing safeguards, paper-first lifecycle boundaries, RBAC, and no-schema-change procurement isolation. | Product Authority | `210ef792919e588021e3fd6c6e13d35b28d58ed3` |
| 1.0.3 | 2026-08-27 | Records the visually accepted Patient Records inline expanded preview: one preview immediately beneath the selected row, state-aware actions adjacent to patient identity, and safe collapse during selection/filter changes. | Product Authority | `210ef792919e588021e3fd6c6e13d35b28d58ed3` |
| 1.0.4 | 2026-08-27 | Records the validated unified Patient Visit architecture: first-class Encounter records, optional appointments, direct and appointment-linked convergence, explicit check-in before paper OP generation, encounter-aware Records/Billing, deterministic daily Patient-ID sequencing, and additive baseline/migration coverage. | Product Authority | `210ef792919e588021e3fd6c6e13d35b28d58ed3` |

---

# PART XXIX — FINAL CANONICAL SUMMARY
## 69. Current Clinic CMS Product Definition

Clinic CMS currently operates around one central principle:

> A patient enters through a unified consultant-specific visit workflow, is checked in, receives a branded paper OP, completes the doctor consultation on paper, becomes Ready for Billing, receives an encounter bill, and the bill closes the visit. Patient Records then becomes the longitudinal hub.

In parallel:

> Procurement is human-reviewed and governed: OCR may assist extraction, but only an approved Purchase Order followed by explicit Goods Receipt can post inventory.

And:

> User identity, consultant attribution, financial mutation, procurement approval, Goods Receipt posting, inventory mutation, and visit closure remain server-governed actions.

Future AI, voice, WhatsApp, website, digital consultation, pharmacy dispensing, and multi-clinic capabilities must extend these canonical relationships rather than bypass them.

---

**End of CMS-PRD-001 v1.0.0**

## Publication review
Documentation branch established through PR #15 for protected canonical review; dashboard refinement is preserved as a separate feature delta for PR #16.
