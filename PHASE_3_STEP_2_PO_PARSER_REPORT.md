# Phase 3 Step 2: Deterministic PO / GST Invoice Parser & Arithmetic Reconciliation Report

**Milestone:** `PHASE3_STEP2_DETERMINISTIC_PARSER_READY`
**Date:** August 18, 2026
**Scope:** Deterministic OCR text parser, Indian GST / PO field extraction, arithmetic reconciliation model with currency tolerance, confidence scoring, tRPC parser endpoint, and zero-mutation boundary validation.

---

## 1. Executive Summary

This report documents the implementation of Phase 3 Step 2 for the **Deepthis Ortho Clinic CMS**. Building on top of the verified Phase 3 Step 1 OCR foundation, this step introduces a deterministic, zero-LLM parsing and arithmetic reconciliation engine that converts raw document text into structured, validated purchase orders and GST invoices.

---

## 2. Parser Architecture & Deterministic Rules

- **Module Structure (`server/poParsing/types.ts`, `server/poParsing/parser.ts`, `server/poParsing/reconcile.ts`):**
  - Implements field-level provenance (`ParsedField<T>`) capturing value, source text, confidence, and warnings.
  - Employs pure deterministic string normalization, line segmentation, regular expressions (GSTIN, dates, invoice numbers), and table-row keyword heuristics.
  - Performs no LLM calls and never hallucinates missing fields (returns `null` when not found).

---

## 3. Reconciliation Model & Tolerance

- **Arithmetic Reconciliation (`server/poParsing/reconcile.ts`):**
  - Validates line totals (`quantity × unit price`), subtotal matching, and grand total matching (`subtotal + CGST + SGST + IGST`).
  - Enforces a strict currency tolerance threshold ($\pm\text{₹0.50}$).
  - Never silently corrects OCR discrepancies; instead, preserves extracted values, computes expected totals, and exposes detailed discrepancies and deltas in `warnings`.

---

## 4. Confidence Model

- **Deterministic Confidence:**
  - **HIGH:** Exact labeled field, strong regex match, or arithmetic agreement within tolerance.
  - **MEDIUM:** Unambiguous nearby text or table alignment.
  - **LOW:** Weak positional inference or missing fields.

---

## 5. Safe Parser Endpoint & Zero-Mutation Guarantee

- **tRPC Route (`poParsing.parseOcrText`):**
  - Authenticated via `protectedProcedure`.
  - Performs zero database writes, creates no Purchase Orders, approves no POs, creates no Goods Receipts, modifies no inventory, and records no stock movements.

---

## 6. Testing & Validation

- **Tests Added (`server/poParsing.test.ts`):**
  - Clean GST invoice extraction
  - Line item extraction and pricing
  - Arithmetic reconciliation (zero delta vs. mismatch flagging)
  - Missing field handling (returning `null`)
  - Zero business mutation boundary guarantee
- **Targeted Test Results:** **6/6 tests passed successfully**.
- **Build Result:** Production build successful (`dist/index.js` compiled cleanly).
