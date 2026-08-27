import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { sdk } from "./_core/sdk";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as utils from "./utils";
import { storageGet, storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { nanoid } from "nanoid";
import * as barcodeGen from "./barcode";
import * as invoiceGen from "./invoice";
import { csvResponse, makeCsvFilename, toCsv } from "./csvExport";
import { notifyOwner } from "./_core/notification";
import { resolveArtifactStorageKey } from "./artifactAccess";
import { hashPassword, verifyPassword, generateRandomPassword } from "./_core/auth";
import { registerPatientWithTracking } from "./services/patientRegistration";
import { getOcrProvider, isSafeOcrClientError } from "./ocr/provider";
import { parseOcrText } from "./poParsing/parser";
import { reconcileDocument } from "./poParsing/reconcile";
import { applySubmittedPurchaseOrderValues, createExtractionReviewEvidence } from "../shared/poExtractionReview";
import type { PurchaseOrderReviewPrefill } from "../shared/poReviewPrefill";
import type { CatalogResolutionDecision } from "../shared/catalogResolution";
import { suggestCatalogMatches } from "./catalogMatching/matcher";
import { normalizeCatalogText } from "./catalogMatching/normalize";
import { enrichPurchaseOrderFromVerifiedVendor, normalizeGstNumber } from "./procurement";
import { storeConsultantImage } from "./consultantAssets";
import { FIXED_CLINIC_BRANDING } from "../shared/clinicBranding";
import { normalizeIndianMobile } from "./external/validation";
import { hasStrongDuplicate, rankPatientCandidates } from "./visitWorkflow";
import { isReadyForBilling } from "./paperFirstWorkflow";

/**
 * Security and RBAC boundary for the clinic CMS.
 *
 * All clinical, billing, inventory, export, notification, and artifact-link
 * procedures below are authenticated with protectedProcedure unless explicitly
 * documented otherwise. ctx.user is hydrated from the signed Manus OAuth session.
 * The project owner is promoted to the admin role during user upsert when the
 * authenticated openId matches ENV.ownerOpenId; adminProcedure is reserved for
 * endpoints that should be owner/admin-only, such as audit-log review and bulk
 * CSV exports. Clinical artifacts remain in cloud storage; application records
 * keep only storage URLs/keys and file bytes are never stored in SQL tables.
 */
const safeNotifyOwner = async (title: string, content: string) => {
  try {
    await notifyOwner({ title, content });
  } catch (error) {
    console.warn(`[Notification] Owner alert failed for ${title}:`, error);
  }
};

async function requireActiveConsultant(consultantId: number) {
  const consultant = await db.getActiveConsultantById(consultantId);
  if (!consultant) throw new Error("Selected consultant is not active");
  return consultant;
}

function assertConsultantSelfOrAdmin(ctx: { user: { id: number; role: string } }, consultantId: number) {
  if (ctx.user.role === "admin") return;
  if (ctx.user.role === "consultant" && ctx.user.id === consultantId) return;
  throw new Error("You are not authorized to access this consultant record");
}

async function assertAppointmentWorkflowAccess(ctx: { user: { id: number; role: string } }) {
  if (ctx.user.role === "admin" || ctx.user.role === "consultant") return;
  if (ctx.user.role === "staff" && await db.checkFeatureAccess("staff", "patient_records")) return;
  throw new Error("You are not authorized to manage appointments");
}

async function requireAccessibleAppointment(ctx: { user: { id: number; role: string } }, appointmentId: string) {
  const appointment = await db.getAppointmentById(appointmentId);
  if (!appointment) throw new Error("Appointment not found");
  if (ctx.user.role === "consultant" && appointment.consultantId !== ctx.user.id) {
    throw new Error("Consultants cannot access another consultant's appointment");
  }
  await assertAppointmentWorkflowAccess(ctx);
  return appointment;
}

const reviewFieldSchema = z.object({
  value: z.string().max(2_000),
  extractedValue: z.string().max(2_000),
  sourceText: z.string().max(2_000).optional(),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string().max(500)).max(50),
  edited: z.boolean(),
});

const purchaseOrderReviewPrefillSchema = z.object({
  documentType: z.enum(["PURCHASE_ORDER", "GST_INVOICE", "UNKNOWN"]),
  header: z.object({
    invoiceNumber: reviewFieldSchema,
    invoiceDate: reviewFieldSchema,
    vendorName: reviewFieldSchema,
    vendorGstin: reviewFieldSchema,
  }),
  totals: z.object({
    subtotal: reviewFieldSchema,
    cgst: reviewFieldSchema,
    sgst: reviewFieldSchema,
    igst: reviewFieldSchema,
    totalTax: reviewFieldSchema,
    grandTotal: reviewFieldSchema,
  }),
  items: z.array(z.object({
    description: reviewFieldSchema,
    hsnCode: reviewFieldSchema,
    batchNumber: reviewFieldSchema,
    expiryDate: reviewFieldSchema,
    quantity: reviewFieldSchema,
    unitPrice: reviewFieldSchema,
    discount: reviewFieldSchema,
    gstRate: reviewFieldSchema,
    taxableAmount: reviewFieldSchema,
    lineTotal: reviewFieldSchema,
  })).max(100),
  warnings: z.array(z.string().max(500)).max(100),
  reconciliation: z.object({
    lineTotalsMatch: z.boolean().nullable(),
    subtotalMatches: z.boolean().nullable(),
    taxMatches: z.boolean().nullable(),
    grandTotalMatches: z.boolean().nullable(),
    delta: z.number().finite().optional(),
  }),
  requiresExplicitSubmission: z.literal(true),
});

const catalogResolutionInputSchema = z.object({
  lineIndex: z.number().int().min(0).max(99),
  decision: z.enum(["ACCEPTED", "UNMATCHED"]),
  catalogItemId: z.string().min(1).max(50).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "ACCEPTED" && !value.catalogItemId) {
    ctx.addIssue({ code: "custom", message: "An accepted catalog match requires a catalog item" });
  }
  if (value.decision === "UNMATCHED" && value.catalogItemId) {
    ctx.addIssue({ code: "custom", message: "An unmatched decision cannot include a catalog item" });
  }
});

const purchaseOrderCreateInputSchema = z.object({
	vendorId: z.string().trim().min(1).max(50),
	vendorName: z.string().min(1),
	vendorContactNumber: z.string().min(10),
  vendorEmail: z.string().email().optional(),
  vendorGSTNumber: z.string().optional(),
  vendorBankDetails: z.string().optional(),
  vendorAddress: z.string().optional(),
  totalAmount: z.string().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Total amount must be a valid non-negative number"),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
  authorizationNotes: z.string().optional(),
  items: z.array(z.object({
    itemName: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.string().refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Unit price must be a valid non-negative number"),
  })).min(1),
});

async function canonicalizeLinkedVendorPurchaseOrder(input: z.infer<typeof purchaseOrderCreateInputSchema>) {
	const vendor = await db.getVendorById(input.vendorId);
	if (!vendor || !Boolean(vendor.isActive)) throw new Error("Select an active Vendor Master record before creating a purchase order");
	const inputGst = normalizeGstNumber(input.vendorGSTNumber);
	if (inputGst && vendor.normalizedGstNumber && inputGst !== vendor.normalizedGstNumber) {
		throw new Error("Vendor GSTIN conflicts with the selected Vendor Master record and must be reviewed before submission");
	}
	const enriched = enrichPurchaseOrderFromVerifiedVendor(input, vendor);
	return {
		...input,
		vendorId: String(vendor.vendorId),
		vendorName: enriched.vendorName,
		vendorContactNumber: enriched.vendorContactNumber || input.vendorContactNumber,
		vendorEmail: enriched.vendorEmail ?? undefined,
		vendorGSTNumber: enriched.vendorGSTNumber ?? undefined,
		vendorBankDetails: enriched.vendorBankDetails ?? undefined,
		vendorAddress: enriched.vendorAddress ?? undefined,
	} satisfies z.infer<typeof purchaseOrderCreateInputSchema>;
}

function buildPendingApprovalPurchaseOrder(
  input: z.infer<typeof purchaseOrderCreateInputSchema>,
  catalogItemIdsByLineIndex = new Map<number, string>(),
) {
  const purchaseOrderId = utils.generateAuditLogId();
  const totalAmount = Number(input.totalAmount);
  const items = input.items.map((item, index) => {
    const poItemId = utils.generateAuditLogId();
    const unitPrice = Number(item.unitPrice);
    return {
      poItemId,
      purchaseOrderId,
      itemName: item.itemName.trim(),
      catalogItemId: catalogItemIdsByLineIndex.get(index),
      quantity: item.quantity,
      unitPrice: unitPrice.toString() as any,
      subtotal: (unitPrice * item.quantity).toString() as any,
    };
  });

  return {
    purchaseOrderId,
    totalAmount,
    items,
		purchaseOrder: {
			purchaseOrderId,
			vendorId: input.vendorId,
			vendorName: input.vendorName,
      vendorContactNumber: input.vendorContactNumber,
      vendorEmail: input.vendorEmail,
      vendorGstNumber: input.vendorGSTNumber,
      vendorBankDetails: input.vendorBankDetails,
      vendorAddress: input.vendorAddress,
      totalAmount: totalAmount.toString() as any,
      paymentStatus: "Pending" as const,
      approvalStatus: "Pending Approval" as const,
      authorizationNotes: input.authorizationNotes,
      expectedDeliveryDate: input.expectedDeliveryDate,
      notes: input.notes,
    },
  };
}

async function buildCatalogResolutionEvidence(
  decisions: z.infer<typeof catalogResolutionInputSchema>[],
  review: PurchaseOrderReviewPrefill,
  confirmedAt: string,
): Promise<{ resolutions: CatalogResolutionDecision[]; catalogItemIdsByLineIndex: Map<number, string> }> {
  const uniqueLineIndices = new Set<number>();
  for (const decision of decisions) {
    if (uniqueLineIndices.has(decision.lineIndex)) throw new Error("Each review line can have only one catalog decision");
    uniqueLineIndices.add(decision.lineIndex);
    if (!review.items[decision.lineIndex]) throw new Error("Catalog decision references an unavailable review line");
  }

  if (decisions.length === 0) {
    return { resolutions: [], catalogItemIdsByLineIndex: new Map<number, string>() };
  }

  const [catalogItems, aliases] = await Promise.all([
    db.getActiveCatalogItems(),
    db.getActiveCatalogItemAliases(),
  ]);
  const resolutions: CatalogResolutionDecision[] = [];
  const catalogItemIdsByLineIndex = new Map<number, string>();

  for (const decision of decisions) {
    const line = review.items[decision.lineIndex];
    const base = {
      lineIndex: decision.lineIndex,
      originalExtractedDescription: line.description.extractedValue,
      reviewedDescription: line.description.value,
      decision: decision.decision,
      reasons: [] as string[],
      conflicts: [] as string[],
      confirmedAt,
    };

    if (decision.decision === "UNMATCHED") {
      resolutions.push(base);
      continue;
    }

    const candidates = suggestCatalogMatches({
      lineDescription: line.description.value,
      hsnCode: line.hsnCode.value || undefined,
    }, catalogItems, aliases);
    const selected = candidates.find((candidate) => candidate.catalogItemId === decision.catalogItemId);
    if (!selected) throw new Error("The selected catalog item is not a current safe suggestion for this reviewed line");
    if (selected.conflicts.length > 0) throw new Error("A catalog match with strength, form, HSN, or ambiguity conflicts cannot be accepted");

    catalogItemIdsByLineIndex.set(decision.lineIndex, selected.catalogItemId);
    resolutions.push({
      ...base,
      decision: "ACCEPTED",
      catalogItemId: selected.catalogItemId,
      canonicalName: selected.canonicalName,
      matchLevel: selected.matchLevel,
      source: selected.source,
      reasons: selected.reasons,
      conflicts: selected.conflicts,
    });
  }

  return { resolutions, catalogItemIdsByLineIndex };
}

async function requirePurchaseOrderAccess(user: { id: number; role: "user" | "admin" | "consultant" | "staff" }) {
  if (user.role === "user") {
    throw new Error("You do not have permission to access purchase-order evidence");
  }
  if (!(await db.checkFeatureAccess(user.role, "purchase_orders"))) {
    throw new Error("You do not have permission to access purchase-order evidence");
  }
}

/** Catalog reads follow the existing PO/catalog feature-access boundary. Catalog writes are admin-only. */
async function requireCatalogReadAccess(user: { id: number; role: "user" | "admin" | "consultant" | "staff" }) {
  await requirePurchaseOrderAccess(user);
}

const optionalCatalogText = z.string().trim().max(255).nullable().optional();
const catalogItemInputSchema = z.object({
  canonicalName: z.string().trim().min(1).max(255),
  genericName: optionalCatalogText,
  brandName: optionalCatalogText,
  strength: z.string().trim().max(100).nullable().optional(),
  dosageForm: z.string().trim().max(100).nullable().optional(),
  manufacturer: optionalCatalogText,
  hsnCode: z.string().trim().max(32).nullable().optional(),
  gstRate: z.number().finite().min(0).max(100).nullable().optional(),
});

const catalogItemUpdateSchema = catalogItemInputSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one catalog field must be provided",
});

const catalogAliasInputSchema = z.object({
  catalogItemId: z.string().trim().min(1).max(50),
  vendorId: z.string().trim().max(50).optional(),
  aliasText: z.string().trim().min(1).max(255),
  source: z.enum(["MANUAL_CURATED", "VENDOR_CURATED"]),
});

function catalogAuditEntry(
  userId: number,
  actionType: string,
  tableName: "catalogItems" | "catalogItemAliases",
  recordId: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>,
) {
  return {
    logId: utils.generateAuditLogId(),
    userId: userId.toString(),
    actionType,
    tableName,
    recordId,
    oldValue: oldValue ? JSON.stringify(oldValue) : null,
    newValue: newValue ? JSON.stringify(newValue) : null,
    timestamp: new Date().toISOString(),
  };
}

function catalogItemAuditSnapshot(item: Record<string, unknown>) {
  return {
    catalogItemId: item.catalogItemId,
    canonicalName: item.canonicalName,
    normalizedName: item.normalizedName,
    genericName: item.genericName ?? null,
    brandName: item.brandName ?? null,
    strength: item.strength ?? null,
    dosageForm: item.dosageForm ?? null,
    manufacturer: item.manufacturer ?? null,
    hsnCode: item.hsnCode ?? null,
    gstRate: item.gstRate ?? null,
    active: item.active,
  };
}

function catalogAliasAuditSnapshot(alias: Record<string, unknown>) {
  return {
    aliasId: alias.aliasId,
    catalogItemId: alias.catalogItemId,
    vendorId: alias.vendorId,
    aliasText: alias.aliasText,
    normalizedAlias: alias.normalizedAlias,
    source: alias.source,
    active: alias.active,
  };
}

function safeCatalogWriteError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/duplicate|unique|ER_DUP_ENTRY/i.test(message)) return new Error("A catalog record with the same normalized identity already exists");
  console.error("[Catalog administration] Write failed:", message);
  return new Error("Catalog administration change could not be saved");
}

export const appRouter = router({
  system: systemRouter,

  ocr: router({
    extractDocument: protectedProcedure
      .input(z.object({
        data: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const provider = getOcrProvider();
          const result = await provider.extractDocument({
            data: input.data,
            mimeType: input.mimeType,
          });
          return result;
        } catch (error) {
          const errMessage = error instanceof Error ? error.message : String(error);
          console.error("[OCR Router] Extraction failed:", errMessage);

          if (isSafeOcrClientError(errMessage)) {
            throw new Error(errMessage);
          }

          throw new Error("OCR extraction failed");
        }
      }),
  }),

  poParsing: router({
    parseOcrText: protectedProcedure
      .input(z.object({
        fullText: z.string(),
      }))
      .mutation(async ({ input }) => {
        const parsed = parseOcrText(input.fullText);
        return reconcileDocument(parsed);
      }),
  }),

  catalogMatching: router({
    suggestMatches: protectedProcedure
      .input(z.object({
        lineDescription: z.string().trim().min(1).max(2_000),
        vendorId: z.string().trim().min(1).max(50).optional(),
        hsnCode: z.string().trim().min(1).max(32).optional(),
      }))
      .query(async ({ input, ctx }) => {
        await requirePurchaseOrderAccess(ctx.user);
        const [catalogItems, aliases] = await Promise.all([
          db.getActiveCatalogItems(),
          db.getActiveCatalogItemAliases(),
        ]);
        return suggestCatalogMatches(input, catalogItems, aliases);
      }),
  }),

  catalogAdmin: router({
    listItems: protectedProcedure
      .input(z.object({ query: z.string().trim().max(255).optional(), includeInactive: z.boolean().optional() }).optional())
      .query(async ({ input, ctx }) => {
        await requireCatalogReadAccess(ctx.user);
        return db.listCatalogItemsForAdmin(input ?? {});
      }),

    getItem: protectedProcedure
      .input(z.object({ catalogItemId: z.string().trim().min(1).max(50) }))
      .query(async ({ input, ctx }) => {
        await requireCatalogReadAccess(ctx.user);
        const item = await db.getCatalogItemById(input.catalogItemId);
        if (!item) throw new Error("Catalog item not found");
        return item;
      }),

    listAliases: protectedProcedure
      .input(z.object({ catalogItemId: z.string().trim().min(1).max(50), includeInactive: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        await requireCatalogReadAccess(ctx.user);
        return db.listCatalogAliasesForAdmin(input.catalogItemId, input.includeInactive ?? false);
      }),

    listVendors: protectedProcedure.query(async ({ ctx }) => {
      await requireCatalogReadAccess(ctx.user);
      return db.getAllVendors();
    }),

    createItem: adminProcedure
      .input(catalogItemInputSchema)
      .mutation(async ({ input, ctx }) => {
        const normalizedName = normalizeCatalogText(input.canonicalName);
        if (!normalizedName) throw new Error("Catalog name must contain searchable text");
        const existing = await db.getCatalogItemByNormalizedName(normalizedName);
        if (existing) throw new Error("A catalog item with the same normalized name already exists");

        const catalogItemId = utils.generateAuditLogId();
        const item = {
          catalogItemId,
          canonicalName: input.canonicalName,
          normalizedName,
          genericName: input.genericName ?? null,
          brandName: input.brandName ?? null,
          strength: input.strength ?? null,
          dosageForm: input.dosageForm ?? null,
          manufacturer: input.manufacturer ?? null,
          hsnCode: input.hsnCode ?? null,
          gstRate: input.gstRate === undefined || input.gstRate === null ? null : input.gstRate.toFixed(2),
        };

        try {
          await db.createCatalogItemWithAudit(item, catalogAuditEntry(
            ctx.user.id,
            "CATALOG_ITEM_CREATED",
            "catalogItems",
            catalogItemId,
            undefined,
            catalogItemAuditSnapshot({ ...item, active: 1 }),
          ));
        } catch (error) {
          throw safeCatalogWriteError(error);
        }
        return { ...item, active: 1 };
      }),

    updateItem: adminProcedure
      .input(z.object({ catalogItemId: z.string().trim().min(1).max(50), updates: catalogItemUpdateSchema }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getCatalogItemById(input.catalogItemId);
        if (!current) throw new Error("Catalog item not found");

        const canonicalName = input.updates.canonicalName ?? current.canonicalName;
        const normalizedName = normalizeCatalogText(canonicalName);
        if (!normalizedName) throw new Error("Catalog name must contain searchable text");
        const duplicate = await db.getCatalogItemByNormalizedName(normalizedName);
        if (duplicate && duplicate.catalogItemId !== input.catalogItemId) {
          throw new Error("A catalog item with the same normalized name already exists");
        }

        const updates = {
          ...input.updates,
          normalizedName,
          gstRate: input.updates.gstRate === undefined
            ? undefined
            : input.updates.gstRate === null ? null : input.updates.gstRate.toFixed(2),
        };
        const next = { ...current, ...updates };
        try {
          await db.updateCatalogItemWithAudit(
            input.catalogItemId,
            updates,
            catalogAuditEntry(
              ctx.user.id,
              "CATALOG_ITEM_UPDATED",
              "catalogItems",
              input.catalogItemId,
              catalogItemAuditSnapshot(current as unknown as Record<string, unknown>),
              catalogItemAuditSnapshot(next as unknown as Record<string, unknown>),
            ),
          );
        } catch (error) {
          throw safeCatalogWriteError(error);
        }
        return next;
      }),

    setItemActive: adminProcedure
      .input(z.object({ catalogItemId: z.string().trim().min(1).max(50), active: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getCatalogItemById(input.catalogItemId);
        if (!current) throw new Error("Catalog item not found");
        if (Boolean(current.active) === input.active) return { ...current, active: input.active ? 1 : 0 };

        const next = { ...current, active: input.active ? 1 : 0 };
        try {
          await db.setCatalogItemActiveWithAudit(
            input.catalogItemId,
            input.active,
            catalogAuditEntry(
              ctx.user.id,
              input.active ? "CATALOG_ITEM_REACTIVATED" : "CATALOG_ITEM_DEACTIVATED",
              "catalogItems",
              input.catalogItemId,
              catalogItemAuditSnapshot(current as unknown as Record<string, unknown>),
              catalogItemAuditSnapshot(next as unknown as Record<string, unknown>),
            ),
          );
        } catch (error) {
          throw safeCatalogWriteError(error);
        }
        return next;
      }),

    createAlias: adminProcedure
      .input(catalogAliasInputSchema)
      .mutation(async ({ input, ctx }) => {
        const item = await db.getCatalogItemById(input.catalogItemId);
        if (!item) throw new Error("Catalog item not found");
        if (!Boolean(item.active)) throw new Error("Aliases can be added only to an active catalog item");

        const vendorId = input.vendorId?.trim() ?? "";
        if (vendorId) {
          const vendor = await db.getVendorById(vendorId);
          if (!vendor) throw new Error("Vendor not found or inactive");
        }
        const normalizedAlias = normalizeCatalogText(input.aliasText);
        if (!normalizedAlias) throw new Error("Alias text must contain searchable text");
        const duplicate = await db.getCatalogAliasByVendorAndNormalizedAlias(vendorId, normalizedAlias);
        if (duplicate) throw new Error("An alias with the same vendor scope and normalized text already exists");

        const aliasId = utils.generateAuditLogId();
        const alias = {
          aliasId,
          catalogItemId: input.catalogItemId,
          vendorId,
          aliasText: input.aliasText,
          normalizedAlias,
          source: input.source,
          createdBy: ctx.user.id.toString(),
        };
        try {
          await db.createCatalogAliasWithAudit(alias, catalogAuditEntry(
            ctx.user.id,
            "CATALOG_ALIAS_CREATED",
            "catalogItemAliases",
            aliasId,
            undefined,
            catalogAliasAuditSnapshot({ ...alias, active: 1 }),
          ));
        } catch (error) {
          throw safeCatalogWriteError(error);
        }
        return { ...alias, active: 1 };
      }),

    setAliasActive: adminProcedure
      .input(z.object({ aliasId: z.string().trim().min(1).max(50), active: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const current = await db.getCatalogAliasById(input.aliasId);
        if (!current) throw new Error("Catalog alias not found");
        if (Boolean(current.active) === input.active) return { ...current, active: input.active ? 1 : 0 };

        const next = { ...current, active: input.active ? 1 : 0 };
        try {
          await db.setCatalogAliasActiveWithAudit(
            input.aliasId,
            input.active,
            catalogAuditEntry(
              ctx.user.id,
              input.active ? "CATALOG_ALIAS_REACTIVATED" : "CATALOG_ALIAS_DEACTIVATED",
              "catalogItemAliases",
              input.aliasId,
              catalogAliasAuditSnapshot(current as unknown as Record<string, unknown>),
              catalogAliasAuditSnapshot(next as unknown as Record<string, unknown>),
            ),
          );
        } catch (error) {
          throw safeCatalogWriteError(error);
        }
        return next;
      }),
  }),

  vendorAdmin: router({
    list: protectedProcedure
      .input(z.object({ includeInactive: z.boolean().optional() }).optional())
      .query(async ({ input, ctx }) => {
        await requirePurchaseOrderAccess(ctx.user);
        return db.listVendorsForAdmin(input?.includeInactive ?? false);
      }),
    create: adminProcedure
      .input(z.object({
        name: z.string().trim().min(1).max(150), contactNumber: z.string().trim().max(20).optional(),
        gstNumber: z.string().trim().max(50).optional(), email: z.string().email().optional(),
        address: z.string().trim().max(2_000).optional(), bankDetails: z.string().trim().max(2_000).optional(),
      }))
      .mutation(async ({ input, ctx }) => db.createVendorWithAudit(input, ctx.user.id.toString())),
    update: adminProcedure
      .input(z.object({
        vendorId: z.string().trim().min(1).max(50),
        values: z.object({
          name: z.string().trim().min(1).max(150), contactNumber: z.string().trim().max(20).optional(),
          gstNumber: z.string().trim().max(50).optional(), email: z.string().email().optional(),
          address: z.string().trim().max(2_000).optional(), bankDetails: z.string().trim().max(2_000).optional(),
        }),
      }))
      .mutation(async ({ input, ctx }) => db.updateVendorWithAudit(input.vendorId, input.values, ctx.user.id.toString())),
    setActive: adminProcedure
      .input(z.object({ vendorId: z.string().trim().min(1).max(50), active: z.boolean() }))
      .mutation(async ({ input, ctx }) => db.setVendorActiveWithAudit(input.vendorId, input.active, ctx.user.id.toString())),
  }),

  vendorResolution: router({
    resolve: protectedProcedure
      .input(z.object({ vendorName: z.string().trim().min(1).max(255), vendorGSTNumber: z.string().trim().max(50).optional() }))
      .query(async ({ input, ctx }) => {
        await requirePurchaseOrderAccess(ctx.user);
        const candidates = await db.findActiveVendorCandidates(input.vendorName, input.vendorGSTNumber);
        const resolution = (await import("./procurement")).resolveVendorMaster({ vendorName: input.vendorName, vendorGSTNumber: input.vendorGSTNumber }, candidates);
        return resolution;
      }),
  }),

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    loginWithPassword: publicProcedure
      .input(z.object({
        email: z.string().min(1),
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await db.authenticateUser(input.email, input.password);
          
          if (!user) {
            throw new Error("Invalid email or password");
          }
          
          // Log staff/consultant access for analytics
          if (user.role !== 'admin') {
            console.log(`[Analytics] Staff Login: user_id=${user.id}, role=${user.role}, email=${input.email}, timestamp=${new Date().toISOString()}, ip=${ctx.req.ip || 'unknown'}`);
          }

          // Ensure user has a valid openId for session token creation
          // First fetch the full user object to get openId
          const fullUser = await db.getUserById(user.id);
          let openId = fullUser?.openId;
          if (!openId || openId.startsWith('CONS-') || openId.startsWith('STAFF-')) {
            // Generate a unique openId for password-login users
            openId = `pwd-${user.id}-${Date.now()}`;
            // Update user with new openId
            await db.updateUserOpenId(user.id, openId);
          }

          const sessionToken = await sdk.createSessionToken(openId, {
            name: user.name || "",
            expiresInMs: 365 * 24 * 60 * 60 * 1000,
          });

          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });

          // Log successful login for analytics
          console.log(`[Analytics] Login Success: user_id=${user.id}, role=${user.role}, email=${input.email}, timestamp=${new Date().toISOString()}`);

          return {
            success: true,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            },
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error("[Auth] Password login failed:", errorMsg, error);
          // Throw the actual error instead of generic message for debugging
          throw new Error(errorMsg || "Login failed");
        }
      }),

    setPassword: protectedProcedure
      .input(z.object({
        password: z.string().min(8).max(128),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const existing = await db.getUserById(ctx.user.id as number);
          if (existing?.passwordHash) throw new Error("A password already exists; use Change Password instead");
          await db.setUserPassword(ctx.user.id as number, input.password);
          return { success: true };
        } catch (error) {
          console.error("[Auth] Set password failed:", error);
          throw new Error(error instanceof Error ? error.message : "Failed to set password");
        }
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8).max(128),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Bind the password change to the authenticated session identity, not
          // a caller-controlled or nullable email value. OAuth-only accounts may
          // legitimately have no local password hash yet; those accounts must use
          // setPassword instead of pretending a current password exists.
          const user = await db.getUserById(ctx.user.id as number);

          if (!user) {
            throw new Error("Authenticated user not found");
          }
          if (!user.passwordHash) {
            throw new Error("No local password is set. Use Set Password to create one.");
          }

          const isValid = await db.verifyPassword(input.currentPassword, user.passwordHash);
          
          if (!isValid) {
            throw new Error("Current password is incorrect");
          }

          await db.setUserPassword(ctx.user.id as number, input.newPassword);
          return { success: true };
        } catch (error) {
          console.error("[Auth] Change password failed:", error);
          throw error;
        }
      }),
  }),

  // ============ PATIENT REGISTRATION ============
  patients: router({
    register: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        age: z.string().min(1),
        gender: z.enum(["Male", "Female", "Other"]).optional(),
        contactNumber: z.string().min(10),
        email: z.string().optional(),
        address: z.string().optional(),
        consultantName: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return registerPatientWithTracking({
          firstName: input.firstName,
          lastName: input.lastName,
          age: Number(input.age),
          gender: input.gender,
          contactNumber: input.contactNumber,
          email: input.email,
          address: input.address,
        }, {
          auditActorId: ctx.user.id.toString(),
          notificationUserId: ctx.user.id,
          source: "cms",
        });
      }),

    getAll: protectedProcedure.query(async () => {
      return db.getAllPatients();
    }),

    exportCsv: adminProcedure.mutation(async ({ ctx }) => {
      const rows = await db.getAllPatients();
      const csv = toCsv(rows, [
        { header: "Patient ID", value: (row) => row.patientId },
        { header: "First Name", value: (row) => row.firstName },
        { header: "Last Name", value: (row) => row.lastName },
        { header: "Date of Birth", value: (row) => row.dateOfBirth },
        { header: "Gender", value: (row) => row.gender },
        { header: "Contact Number", value: (row) => row.contactNumber },
        { header: "Email", value: (row) => row.email },
        { header: "Address", value: (row) => row.address },
        { header: "Barcode Data", value: (row) => row.barcodeData },
        { header: "Registered At", value: (row) => row.createdAt },
        { header: "Updated At", value: (row) => row.updatedAt },
      ]);

      await db.createAuditLog({
        logId: utils.generateAuditLogId(),
        userId: ctx.user.id.toString(),
        actionType: "EXPORT",
        tableName: "patients",
        recordId: "patient-records-csv",
        newValue: JSON.stringify({ rowCount: rows.length, format: "csv" }),
        timestamp: new Date().toISOString(),
      });

      return csvResponse(csv, makeCsvFilename("patient-records"), rows.length);
    }),

    getById: protectedProcedure
      .input(z.object({ patientId: z.string() }))
      .query(async ({ input, ctx }) => {
        const patient = await db.getPatientById(input.patientId);
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "PHI_ACCESS",
          tableName: "patients",
          recordId: input.patientId,
          newValue: JSON.stringify({ accessType: "patient_profile_view" }),
          timestamp: new Date().toISOString(),
        });
        return patient;
      }),

    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input, ctx }) => {
        const results = await db.searchPatients(input.query);
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "PHI_ACCESS",
          tableName: "patients",
          recordId: "patient-search",
          newValue: JSON.stringify({ query: input.query, resultCount: results.length }),
          timestamp: new Date().toISOString(),
        });
        return results;
      }),

    getDetailsForBilling: protectedProcedure
      .input(z.object({ patientId: z.string() }))
      .query(async ({ input, ctx }) => {
        const patient = await db.getPatientById(input.patientId);
        if (!patient) {
          return null;
        }

        // Fetch last consultation date
        const consultations = await db.getConsultationsByPatientId(input.patientId);
        const lastConsultation = consultations.length > 0 ? consultations[0] : null;

        // Log PHI access for billing form lookup
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "PHI_ACCESS",
          tableName: "patients",
          recordId: input.patientId,
          newValue: JSON.stringify({ accessType: "billing_form_lookup" }),
          timestamp: new Date().toISOString(),
        });

        return {
          patientId: patient.patientId,
          firstName: patient.firstName,
          lastName: patient.lastName,
          contactNumber: patient.contactNumber,
          email: patient.email || undefined,
          address: patient.address || undefined,
          dateOfBirth: patient.dateOfBirth,
          lastConsultationDate: lastConsultation?.consultationDate || null,
        };
      }),
  }),

  // ============ CONSULTATIONS - AMBIENT SCRIBE ============
  consultations: router({
    uploadAudio: protectedProcedure
      .input(z.object({
        patientId: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.enum(["audio/mpeg", "audio/wav", "audio/mp4", "audio/webm", "audio/ogg", "audio/x-m4a", "audio/m4a"]),
        base64Content: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const fileExtension = input.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "audio";
        const fileKey = `audio/${input.patientId}/${Date.now()}-${nanoid(8)}.${fileExtension}`;
        const audioBuffer = Buffer.from(input.base64Content, "base64");

        if (audioBuffer.length > 16 * 1024 * 1024) {
          throw new Error("Audio upload exceeds the 16MB transcription limit");
        }

        const upload = await storagePut(fileKey, audioBuffer, input.mimeType);

        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "UPLOAD",
          tableName: "consultations",
          recordId: input.patientId,
          newValue: JSON.stringify({ fileKey: upload.key, mimeType: input.mimeType, sizeBytes: audioBuffer.length }),
          timestamp: new Date().toISOString(),
        });

        return { url: upload.url, key: upload.key };
      }),

    create: protectedProcedure
      .input(z.object({
        patientId: z.string(),
        consultantId: z.number().int().positive().optional(),
        audioFileUrl: z.string().optional(),
        audioFileKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const consultantId = ctx.user.role === "consultant"
          ? ctx.user.id
          : input.consultantId;
        if (!consultantId) throw new Error("An active consultant must be selected for a consultation");
        if (ctx.user.role === "consultant" && input.consultantId && input.consultantId !== ctx.user.id) {
          throw new Error("Consultants cannot create a consultation for another consultant");
        }
        await requireActiveConsultant(consultantId);
        const consultationId = utils.generateConsultationId();

        const consultation = await db.createConsultation({
          consultationId,
          patientId: input.patientId,
          consultantId,
          audioFileUrl: input.audioFileUrl,
          audioFileKey: input.audioFileKey,
          consultationDate: new Date().toISOString(),
        });

        return consultation;
      }),

    transcribeAndParse: protectedProcedure
      .input(z.object({
        consultationId: z.string(),
        audioUrl: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Transcribe audio using Whisper
        const transcriptionResult = await transcribeAudio({
          audioUrl: input.audioUrl,
          language: "en",
        });

        if ('error' in transcriptionResult) {
          throw new Error(`Transcription failed: ${transcriptionResult.error}`);
        }

        const rawTranscript = transcriptionResult.text;

        // Parse transcript using LLM into four sections
        const parseResponse = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a medical documentation expert. Parse the following doctor-patient conversation into exactly four sections with these labels: Clinical History, Present Complaints, Advised Investigations, Treatment Plan. Return the response as JSON with these exact keys: clinicalHistory, presentComplaints, advisedInvestigations, treatmentPlan",
            },
            {
              role: "user",
              content: `Please parse this medical consultation transcript:\n\n${rawTranscript}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "medical_consultation",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  clinicalHistory: { type: "string" },
                  presentComplaints: { type: "string" },
                  advisedInvestigations: { type: "string" },
                  treatmentPlan: { type: "string" },
                },
                required: ["clinicalHistory", "presentComplaints", "advisedInvestigations", "treatmentPlan"],
                additionalProperties: false,
              },
            },
          },
        });

        let parsedData;
        try {
          const messageContent = parseResponse.choices[0]?.message.content;
          let content: string;
          if (typeof messageContent === 'string') {
            content = messageContent;
          } else if (Array.isArray(messageContent)) {
            content = messageContent.find(c => c.type === 'text')?.text || "{}";
          } else {
            content = "{}";
          }
          parsedData = JSON.parse(content);
        } catch (e) {
          throw new Error("Failed to parse LLM response");
        }

        // Update consultation with parsed data
        await db.updateConsultation(input.consultationId, {
          rawTranscript,
          clinicalHistory: parsedData.clinicalHistory,
          presentComplaints: parsedData.presentComplaints,
          advisedInvestigations: parsedData.advisedInvestigations,
          treatmentPlan: parsedData.treatmentPlan,
        });

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "UPDATE",
          tableName: "consultations",
          recordId: input.consultationId,
          newValue: JSON.stringify(parsedData),
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          consultationId: input.consultationId,
          parsedData,
        };
      }),

    finalize: protectedProcedure
      .input(z.object({
        consultationId: z.string(),
        signature: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const consultation = await db.getConsultationById(input.consultationId);
        if (!consultation) throw new Error("Consultation not found");

        // Create digital signature
        const content = JSON.stringify({
          clinicalHistory: consultation.clinicalHistory,
          presentComplaints: consultation.presentComplaints,
          advisedInvestigations: consultation.advisedInvestigations,
          treatmentPlan: consultation.treatmentPlan,
        });

        const digitalSignature = utils.createDigitalSignature(content, process.env.JWT_SECRET || "secret");

        await db.updateConsultation(input.consultationId, {
          digitalSignature,
          isFinalized: 1,
        });

        return { success: true };
      }),

    getById: protectedProcedure
      .input(z.object({ consultationId: z.string() }))
      .query(async ({ input, ctx }) => {
        const consultation = await db.getConsultationById(input.consultationId);
        if (!consultation) return null;
        if (ctx.user.role === "consultant" && consultation.consultantId !== ctx.user.id) {
          throw new Error("You are not authorized to access this consultation");
        }
        return consultation;
      }),

    getByPatientId: protectedProcedure
      .input(z.object({ patientId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "consultant") {
          return db.getConsultationsByPatientAndConsultant(input.patientId, ctx.user.id);
        }
        return db.getConsultationsByPatientId(input.patientId);
      }),

    getBrandedPrintData: protectedProcedure
      .input(z.object({ consultationId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const printData = await db.getConsultationPrintData(input.consultationId);
        if (!printData) throw new Error("Consultation print data not found");
        assertConsultantSelfOrAdmin(ctx, printData.consultantId ?? 0);
        if (ctx.user.role === "staff" && !await db.checkFeatureAccess("staff", "patient_records")) {
          throw new Error("You are not authorized to print this consultation");
        }

        const consultantLogo = printData.consultantLogoKey ? await storageGet(printData.consultantLogoKey) : null;
        const signature = printData.signatureKey ? await storageGet(printData.signatureKey) : null;
        const { consultantLogoKey: _consultantLogoKey, signatureKey: _signatureKey, ...safePrintData } = printData;
        const printableConsultantName = safePrintData.consultantName ?? `Consultant ${safePrintData.consultantId}`;
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CONSULTATION_OP_PRINT_VIEWED",
          tableName: "consultations",
          recordId: input.consultationId,
          newValue: JSON.stringify({ consultantId: printData.consultantId, hasLogo: Boolean(consultantLogo), hasSignature: Boolean(signature), hasLocation: Boolean(printData.consultantLocation), hasTimings: Boolean(printData.consultantTimings) }),
          timestamp: new Date().toISOString(),
        });
        return {
          ...safePrintData,
          consultantName: printableConsultantName,
          consultantLogoUrl: consultantLogo?.url,
          signatureUrl: signature?.url,
          facility: FIXED_CLINIC_BRANDING,
        };
      }),
  }),

  // ============ PHARMACY INVENTORY ============
  inventory: router({
    add: protectedProcedure
      .input(z.object({
        itemName: z.string(),
        batchNumber: z.string(),
        expiryDate: z.string(),
        quantityAvailable: z.number(),
        reorderLevel: z.number(),
        unitPrice: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const itemId = utils.generateInventoryItemId();

        const item = await db.createInventoryItem({
          itemId,
          itemName: input.itemName,
          batchNumber: input.batchNumber,
          expiryDate: input.expiryDate,
          quantityAvailable: input.quantityAvailable,
          reorderLevel: input.reorderLevel,
          unitPrice: input.unitPrice as any,
        });

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CREATE",
          tableName: "inventory",
          recordId: itemId,
          newValue: JSON.stringify(item),
          timestamp: new Date().toISOString(),
        });

        if (input.quantityAvailable <= input.reorderLevel) {
          await db.createNotification({
            notificationId: utils.generateNotificationId(),
            userId: ctx.user.id,
            title: "Low Stock Alert",
            content: `${input.itemName} (Batch: ${input.batchNumber}) is running low. Current quantity: ${input.quantityAvailable}`,
            notificationType: "low_stock",
          });
          await safeNotifyOwner(
            "Low Stock Alert",
            `${input.itemName} (Batch: ${input.batchNumber}) is at ${input.quantityAvailable}, below or equal to reorder level ${input.reorderLevel}.`,
          );
        }

        return item;
      }),

    getAll: protectedProcedure.query(async () => {
      return db.getAllInventoryItems();
    }),

    getLowStock: protectedProcedure.query(async () => {
      // This read path is intentionally side-effect-free so dashboard polling
      // does not create duplicate low-stock notifications every 30 seconds.
      return db.getLowStockItems();
    }),

    update: protectedProcedure
      .input(z.object({
        itemId: z.string(),
        itemName: z.string().min(1).optional(),
        batchNumber: z.string().min(1).optional(),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        quantityAvailable: z.number().optional(),
        reorderLevel: z.number().optional(),
        unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const oldItem = await db.getInventoryItemById(input.itemId);

        const inventoryUpdates = {
          itemName: input.itemName,
          batchNumber: input.batchNumber,
          expiryDate: input.expiryDate,
          quantityAvailable: input.quantityAvailable,
          reorderLevel: input.reorderLevel,
          unitPrice: input.unitPrice as any,
        };

        const sanitizedUpdates = Object.fromEntries(
          Object.entries(inventoryUpdates).filter(([, value]) => value !== undefined)
        );

        await db.updateInventoryItem(input.itemId, sanitizedUpdates);

        const nextQuantity = input.quantityAvailable ?? oldItem?.quantityAvailable;
        const nextReorderLevel = input.reorderLevel ?? oldItem?.reorderLevel;
        if (oldItem && typeof nextQuantity === "number" && typeof nextReorderLevel === "number" && nextQuantity <= nextReorderLevel) {
          await db.createNotification({
            notificationId: utils.generateNotificationId(),
            userId: ctx.user.id,
            title: "Low Stock Alert",
            content: `${oldItem.itemName} (Batch: ${oldItem.batchNumber}) is running low. Current quantity: ${nextQuantity}`,
            notificationType: "low_stock",
          });
          await safeNotifyOwner(
            "Low Stock Alert",
            `${oldItem.itemName} (Batch: ${oldItem.batchNumber}) is at ${nextQuantity}, below or equal to reorder level ${nextReorderLevel}.`,
          );
        }

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "UPDATE",
          tableName: "inventory",
          recordId: input.itemId,
          oldValue: JSON.stringify(oldItem),
          newValue: JSON.stringify(sanitizedUpdates),
          timestamp: new Date().toISOString(),
        });

        return { success: true };
      }),
  }),

  // ============ BILLING ============
  bills: router({
    create: protectedProcedure
      .input(z.object({
        patientId: z.string(),
        consultationId: z.string().optional(),
        items: z.array(z.object({
          itemType: z.string(),
          description: z.string(),
          quantity: z.number(),
          unitPrice: z.string(),
        })),
        discountAmount: z.string().optional(),
        taxAmount: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const billId = utils.generateBillId();

        // Calculate total
        let totalAmount = 0;
        for (const item of input.items) {
          totalAmount += parseFloat(item.unitPrice) * item.quantity;
        }

        const discountAmount = parseFloat(input.discountAmount || "0");
        const taxAmount = parseFloat(input.taxAmount || "0");
        const finalAmount = totalAmount - discountAmount + taxAmount;

        // Create bill and its itemized lines.
        const bill = await db.createBill({
          billId,
          patientId: input.patientId,
          consultationId: input.consultationId ?? null,
          totalAmount: totalAmount.toString() as any,
          discountAmount: discountAmount.toString() as any,
          taxAmount: taxAmount.toString() as any,
          finalAmount: finalAmount.toString() as any,
          paymentStatus: "Pending",
        });

        const invoiceItems = [] as Array<{ description: string; quantity: number; unitPrice: number; subtotal: number }>;
        for (const item of input.items) {
          const billItemId = utils.generateBillItemId();
          const unitPrice = parseFloat(item.unitPrice);
          const subtotal = unitPrice * item.quantity;

          invoiceItems.push({
            description: item.description,
            quantity: item.quantity,
            unitPrice,
            subtotal,
          });

          await db.createBillItem({
            billItemId,
            billId,
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice as any,
            subtotal: subtotal.toString() as any,
          });
        }

        const patient = await db.getPatientById(input.patientId);
        
        // Fetch consultant information if consultation exists
        let consultantName: string | undefined;
        let consultantRegistrationNumber: string | undefined;
        let consultantStateCounsilSection: string | undefined;
        
        if (input.consultationId) {
          const consultation = await db.getConsultationById(input.consultationId);
          if (consultation && consultation.consultantId) {
            const consultant = await db.getUserById(consultation.consultantId);
            if (consultant) {
              consultantName = consultant.name || undefined;
              consultantRegistrationNumber = consultant.registrationNumber || undefined;
              consultantStateCounsilSection = consultant.stateCounsilSection || undefined;
            }
          }
        }
        
        const invoicePdf = await invoiceGen.generateAndStoreInvoicePDF({
          billId,
          patientId: input.patientId,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : input.patientId,
          patientContact: patient?.contactNumber || "N/A",
          consultationDate: new Date(),
          items: invoiceItems,
          totalAmount,
          discountAmount,
          taxAmount,
          finalAmount,
          paymentStatus: "Pending",
          consultantName,
          consultantRegistrationNumber,
          consultantStateCounsilSection,
        });

        await db.updateBill(billId, {
          invoicePdfUrl: invoicePdf.url,
          invoicePdfKey: invoicePdf.key,
        });

        const billWithInvoice = {
          ...bill,
          invoicePdfUrl: invoicePdf.url,
          invoicePdfKey: invoicePdf.key,
        };

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CREATE",
          tableName: "bills",
          recordId: billId,
          newValue: JSON.stringify(billWithInvoice),
          timestamp: new Date().toISOString(),
        });

        // Trigger in-app and owner-channel notification.
        await db.createNotification({
          notificationId: utils.generateNotificationId(),
          userId: ctx.user.id,
          title: "Invoice Generated",
          content: `Invoice ${billId} has been generated for patient ${input.patientId}. Amount: ${finalAmount}`,
          notificationType: "invoice_generated",
        });
        await safeNotifyOwner(
          "Invoice Generated",
          `Invoice ${billId} has been generated for patient ${input.patientId}. Amount: ${finalAmount.toFixed(2)}.`,
        );

        return billWithInvoice;
      }),

    createEncounter: protectedProcedure
      .input(z.object({
        consultationId: z.string().trim().min(1),
        appointmentId: z.string().trim().min(1).optional(),
        encounterId: z.string().trim().min(1).optional(),
        items: z.array(z.object({ itemType: z.string().trim().min(1), description: z.string().trim().min(1), quantity: z.number().int().positive(), unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/) })).min(1),
        discountAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
        taxAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
      }))
      .mutation(async ({ input, ctx }) => {
        const consultation = await db.getConsultationById(input.consultationId);
        if (!consultation) throw new Error("Encounter billing context is invalid");
        if (!input.appointmentId && !input.encounterId) throw new Error("Encounter billing context is invalid");
        const encounter = input.encounterId ? await db.getEncounterById(input.encounterId) : null;
        if (input.encounterId && (!encounter || consultation.encounterId !== input.encounterId)) throw new Error("Encounter billing context is invalid");
        const appointment = input.appointmentId ? await requireAccessibleAppointment(ctx, input.appointmentId) : null;
        if (input.appointmentId && consultation.appointmentId !== input.appointmentId) throw new Error("Encounter billing context is invalid");
        if (ctx.user.role === "consultant" && consultation.consultantId !== ctx.user.id) throw new Error("Consultants cannot bill another consultant's encounter");
        const patient = await db.getPatientById(consultation.patientId);
        if (!patient) throw new Error("Patient not found");
        const totalAmount = input.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
        const discountAmount = Number(input.discountAmount);
        const taxAmount = Number(input.taxAmount);
        const finalAmount = totalAmount - discountAmount + taxAmount;
        const billId = utils.generateBillId();
        const result = await db.createEncounterBillAndCloseVisit({
          bill: { billId, patientId: consultation.patientId, consultationId: consultation.consultationId, totalAmount: totalAmount.toFixed(2) as any, discountAmount: discountAmount.toFixed(2) as any, taxAmount: taxAmount.toFixed(2) as any, finalAmount: finalAmount.toFixed(2) as any, paymentStatus: "Pending" },
          items: input.items.map((item) => ({ billItemId: utils.generateBillItemId(), billId, itemType: item.itemType, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice as any, subtotal: (Number(item.unitPrice) * item.quantity).toFixed(2) as any })),
          appointmentId: appointment?.appointmentId,
          encounterId: encounter?.encounterId,
          actorId: String(ctx.user.id),
        });
        return { ...result, patientId: consultation.patientId, consultationId: consultation.consultationId, appointmentId: appointment?.appointmentId ?? null, encounterId: encounter?.encounterId ?? null };
      }),

    getEncounterCandidatesByDate: protectedProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD") }))
      .query(async ({ input, ctx }) => {
        const rows = await db.getBillingCandidatesByDate(input.date);
        return rows
          .filter(({ appointment }) => ctx.user.role !== "consultant" || appointment.consultantId === ctx.user.id)
          .map(({ appointment, patient, consultation, bill, consultant, encounter }) => {
            const readyForBilling = Boolean(consultation && isReadyForBilling(consultation.isFinalized, Boolean(bill)));
            const status = bill
              ? "Billed"
              : readyForBilling
                ? "Ready for Billing"
                : appointment.status === "Completed"
                  ? "Completed"
                  : appointment.status;
            return {
              appointmentId: appointment.appointmentId,
              encounterId: encounter?.encounterId ?? null,
              appointmentDate: appointment.appointmentDate,
              appointmentTime: appointment.appointmentTime,
              appointmentStatus: appointment.status,
              patientId: appointment.patientId,
              patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown Patient",
              age: patient?.age ?? null,
              gender: patient?.gender ?? null,
              consultationId: consultation?.consultationId ?? null,
              consultantId: appointment.consultantId,
              consultantName: consultant?.name ?? `Consultant ${appointment.consultantId}`,
              isFinalized: consultation?.isFinalized ?? null,
              billId: bill?.billId ?? null,
              displayStatus: status,
              canRaiseBill: readyForBilling,
            };
          });
      }),

    getAll: protectedProcedure.query(async () => {
      const bills = await db.getAllBills();
      return Promise.all(
        bills.map(async (bill) => {
          const patient = await db.getPatientById(bill.patientId);
          return {
            ...bill,
            patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown Patient",
            patientContact: patient?.contactNumber || "",
          };
        })
      );
    }),

    getById: protectedProcedure
      .input(z.object({ billId: z.string() }))
      .query(async ({ input }) => {
        const bill = await db.getBillById(input.billId);
        const items = bill ? await db.getBillItemsByBillId(input.billId) : [];
        return { bill, items };
      }),

    getByPatientId: protectedProcedure
      .input(z.object({ patientId: z.string() }))
      .query(async ({ input }) => {
        return db.getBillsByPatientId(input.patientId);
      }),

    exportCsv: adminProcedure.mutation(async ({ ctx }) => {
      const bills = await db.getAllBills();
      const rows = await Promise.all(
        bills.map(async (bill) => {
          const patient = await db.getPatientById(bill.patientId);
          const items = await db.getBillItemsByBillId(bill.billId);
          const itemSummary = items
            .map((item) => `${item.itemType}: ${item.description || "N/A"} x${item.quantity || 0} @ ${item.unitPrice || "0.00"}`)
            .join(" | ");

          return {
            ...bill,
            patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Unknown Patient",
            patientContact: patient?.contactNumber || "",
            patientEmail: patient?.email || "",
            itemCount: items.length,
            itemSummary,
          };
        })
      );

      const csv = toCsv(rows, [
        { header: "Bill ID", value: (row) => row.billId },
        { header: "Patient ID", value: (row) => row.patientId },
        { header: "Patient Name", value: (row) => row.patientName },
        { header: "Patient Contact", value: (row) => row.patientContact },
        { header: "Patient Email", value: (row) => row.patientEmail },
        { header: "Consultation ID", value: (row) => row.consultationId },
        { header: "Total Amount", value: (row) => row.totalAmount },
        { header: "Discount Amount", value: (row) => row.discountAmount },
        { header: "Tax Amount", value: (row) => row.taxAmount },
        { header: "Final Amount", value: (row) => row.finalAmount },
        { header: "Payment Status", value: (row) => row.paymentStatus },
        { header: "Item Count", value: (row) => row.itemCount },
        { header: "Item Summary", value: (row) => row.itemSummary },
        { header: "Invoice PDF URL", value: (row) => row.invoicePdfUrl },
        { header: "Created At", value: (row) => row.createdAt },
        { header: "Updated At", value: (row) => row.updatedAt },
      ]);

      await db.createAuditLog({
        logId: utils.generateAuditLogId(),
        userId: ctx.user.id.toString(),
        actionType: "EXPORT",
        tableName: "bills",
        recordId: "billing-history-csv",
        newValue: JSON.stringify({ rowCount: rows.length, format: "csv" }),
        timestamp: new Date().toISOString(),
      });

      return csvResponse(csv, makeCsvFilename("billing-history"), rows.length);
    }),

    updatePaymentStatus: protectedProcedure
      .input(z.object({
        billId: z.string(),
        paymentStatus: z.enum(["Pending", "Paid", "Partial"]),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.updateBill(input.billId, {
          paymentStatus: input.paymentStatus,
        });

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "UPDATE",
          tableName: "bills",
          recordId: input.billId,
          newValue: JSON.stringify({ paymentStatus: input.paymentStatus }),
          timestamp: new Date().toISOString(),
        });

        return { success: true };
      }),

    getConsultationNotes: protectedProcedure
      .input(z.object({ consultationId: z.string() }))
      .query(async ({ input, ctx }) => {
        const consultation = await db.getConsultationById(input.consultationId);
        if (!consultation) {
          return null;
        }

        // Log PHI access
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "PHI_ACCESS",
          tableName: "consultations",
          recordId: input.consultationId,
          newValue: JSON.stringify({ accessType: "billing_form_lookup" }),
          timestamp: new Date().toISOString(),
        });

        return {
          consultationId: consultation.consultationId,
          patientId: consultation.patientId,
          appointmentId: consultation.appointmentId,
          consultantId: consultation.consultantId,
          isFinalized: consultation.isFinalized,
          consultationDate: consultation.consultationDate,
          clinicalHistory: consultation.clinicalHistory,
          presentComplaints: consultation.presentComplaints,
          advisedInvestigations: consultation.advisedInvestigations,
          treatmentPlan: consultation.treatmentPlan,
        };
      }),

    generateReceipt: protectedProcedure
      .input(z.object({ billId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const bill = await db.getBillById(input.billId);
        if (!bill) throw new Error("Bill not found");

        const patient = await db.getPatientById(bill.patientId);
        const items = await db.getBillItemsByBillId(input.billId);

        const receiptPdf = await invoiceGen.generateAndStoreInvoicePDF({
          billId: input.billId,
          patientId: bill.patientId,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : bill.patientId,
          patientContact: patient?.contactNumber || "N/A",
          consultationDate: new Date(),
          items: items.map((item) => ({
            description: item.description || "Item",
            quantity: item.quantity || 1,
            unitPrice: parseFloat(String(item.unitPrice || 0)),
            subtotal: parseFloat(String(item.subtotal || 0)),
          })),
          totalAmount: parseFloat(String(bill.totalAmount)),
          discountAmount: parseFloat(String(bill.discountAmount || 0)),
          taxAmount: parseFloat(String(bill.taxAmount || 0)),
          finalAmount: parseFloat(String(bill.finalAmount)),
          paymentStatus: (bill.paymentStatus || "Pending") as "Pending" | "Paid" | "Partial",
        });

        await db.updateBillReceipt(input.billId, receiptPdf.url, receiptPdf.key);

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CREATE",
          tableName: "bills",
          recordId: input.billId,
          newValue: JSON.stringify({ receiptGenerated: true, receiptUrl: receiptPdf.url }),
          timestamp: new Date().toISOString(),
        });

        return { success: true, receiptUrl: receiptPdf.url };
      }),

    sendReceipt: protectedProcedure
      .input(z.object({
        billId: z.string(),
        method: z.enum(["Email", "SMS", "Both"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const bill = await db.getBillById(input.billId);
        if (!bill) throw new Error("Bill not found");

        const patient = await db.getPatientById(bill.patientId);
        if (!patient) throw new Error("Patient not found");

        // Check if receipt PDF exists
        if (!bill.receiptPdfUrl && !bill.receiptPdfKey) {
          throw new Error("Receipt PDF not generated yet. Generate receipt first.");
        }

        try {
          // Update delivery status to pending
          await db.updateReceiptDelivery(input.billId, "Pending", input.method);

          // Simulate sending receipt (in production, integrate with SMS/Email service)
          // For now, we'll just mark it as sent
          await db.updateReceiptDelivery(input.billId, "Sent", input.method);

          // Log audit trail
          await db.createAuditLog({
            logId: utils.generateAuditLogId(),
            userId: ctx.user.id.toString(),
            actionType: "UPDATE",
            tableName: "bills",
            recordId: input.billId,
            newValue: JSON.stringify({ receiptDelivered: true, method: input.method }),
            timestamp: new Date().toISOString(),
          });

          return { success: true, message: `Receipt sent via ${input.method}` };
        } catch (error) {
          await db.updateReceiptDelivery(input.billId, "Failed", input.method);
          throw error;
        }
      }),

    exportPDF: protectedProcedure
      .input(z.object({
        billId: z.string(),
      }))
      .query(async ({ input }) => {
        const bill = await db.getBillById(input.billId);
        if (!bill) throw new Error("Bill not found");
        if (!bill.invoicePdfUrl || !bill.invoicePdfKey) throw new Error("PDF not available for this bill");
        return {
          pdfUrl: bill.invoicePdfUrl,
          pdfKey: bill.invoicePdfKey,
          billId: input.billId,
        };
      }),
  }),

  // ============ PHARMACY PURCHASE ORDERS ============
  purchaseOrders: router({
    create: protectedProcedure
      .input(purchaseOrderCreateInputSchema)
      .mutation(async ({ input, ctx }) => {
        const governedInput = await canonicalizeLinkedVendorPurchaseOrder(input);
        const { purchaseOrderId, totalAmount, items, purchaseOrder } = buildPendingApprovalPurchaseOrder(governedInput);

        await db.createPurchaseOrderWithItems(purchaseOrder, items);

        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CREATE",
          tableName: "purchaseOrders",
          recordId: purchaseOrderId,
          newValue: JSON.stringify({ vendorId: governedInput.vendorId, vendorName: governedInput.vendorName, totalAmount, approvalStatus: "Pending Approval" }),
          timestamp: new Date().toISOString(),
        });

        await db.createPurchaseOrderHistory({
          historyId: utils.generateAuditLogId(),
          purchaseOrderId,
          eventType: "CREATED_PENDING_APPROVAL",
          actorId: ctx.user.id.toString(),
          actorName: ctx.user.name ?? null,
          eventSummary: "Purchase order created and submitted for approval.",
          details: JSON.stringify({ vendorId: governedInput.vendorId, vendorName: governedInput.vendorName, totalAmount, authorizationNotes: governedInput.authorizationNotes ?? null }),
        });

        await safeNotifyOwner(
          "Purchase Order Pending Approval",
          `PO #${purchaseOrderId} from ${governedInput.vendorName} for ₹${totalAmount} is awaiting approval.`,
        );

        return { success: true, purchaseOrderId, approvalStatus: "Pending Approval" as const };
      }),

    createFromReviewedExtraction: protectedProcedure
      .input(purchaseOrderCreateInputSchema.extend({
        reviewSubmissionId: z.string().uuid(),
        extractionProvider: z.enum(["google-cloud-vision", "mock-ocr"]),
        review: purchaseOrderReviewPrefillSchema,
        catalogResolutions: z.array(catalogResolutionInputSchema).max(100).default([]),
      }))
      .mutation(async ({ input, ctx }) => {
        await requirePurchaseOrderAccess(ctx.user);

        const duplicate = await db.getPurchaseOrderExtractionReviewBySubmissionId(input.reviewSubmissionId);
        if (duplicate) throw new Error("This reviewed extraction has already been submitted");

        const governedInput = await canonicalizeLinkedVendorPurchaseOrder(input);
        const finalReview = applySubmittedPurchaseOrderValues(input.review as PurchaseOrderReviewPrefill, {
          vendorName: governedInput.vendorName,
          vendorGSTNumber: governedInput.vendorGSTNumber,
          items: governedInput.items,
        });
        const reviewedAt = new Date().toISOString();
        const catalogEvidence = await buildCatalogResolutionEvidence(input.catalogResolutions, finalReview, reviewedAt);
        const { purchaseOrderId, totalAmount, items, purchaseOrder } = buildPendingApprovalPurchaseOrder(governedInput, catalogEvidence.catalogItemIdsByLineIndex);
        const reviewEvidence = createExtractionReviewEvidence(finalReview);
        const reviewId = utils.generateAuditLogId();

        try {
          await db.createPurchaseOrderWithItemsAndExtractionReview(purchaseOrder, items, {
            review: {
              reviewId,
              purchaseOrderId,
              reviewSubmissionId: input.reviewSubmissionId,
              extractionProvider: input.extractionProvider,
              documentType: reviewEvidence.documentType,
              reviewStatus: "CONFIRMED",
              reviewerUserId: ctx.user.id.toString(),
              reviewerName: ctx.user.name ?? null,
              reviewedAt,
              createdAt: reviewedAt,
              extractedHeaderJson: JSON.stringify(reviewEvidence.extractedHeader),
              extractedItemsJson: JSON.stringify(reviewEvidence.extractedItems),
              extractedTotalsJson: JSON.stringify(reviewEvidence.extractedTotals),
              reconciliationJson: JSON.stringify(reviewEvidence.reconciliation),
              warningsJson: JSON.stringify(reviewEvidence.warnings),
              correctedFieldsJson: JSON.stringify(reviewEvidence.correctedFields),
              finalReviewedValuesJson: JSON.stringify(reviewEvidence.finalReviewedValues),
              catalogResolutionsJson: JSON.stringify(catalogEvidence.resolutions),
            },
            auditLog: {
              logId: utils.generateAuditLogId(),
              userId: ctx.user.id.toString(),
              actionType: "CREATE",
              tableName: "purchaseOrderExtractionReviews",
              recordId: reviewId,
              newValue: JSON.stringify({ purchaseOrderId, reviewId, reviewStatus: "CONFIRMED", acceptedCatalogMatchCount: catalogEvidence.resolutions.filter((resolution) => resolution.decision === "ACCEPTED").length }),
              timestamp: reviewedAt,
            },
            history: {
              historyId: utils.generateAuditLogId(),
              purchaseOrderId,
              eventType: "EXTRACTION_REVIEW_CONFIRMED",
              actorId: ctx.user.id.toString(),
              actorName: ctx.user.name ?? null,
              eventSummary: "Reviewed OCR/parser extraction evidence recorded with pending-approval PO submission.",
              details: JSON.stringify({ reviewId, correctedFieldCount: reviewEvidence.correctedFields.length, documentType: reviewEvidence.documentType, acceptedCatalogMatchCount: catalogEvidence.resolutions.filter((resolution) => resolution.decision === "ACCEPTED").length }),
              createdAt: reviewedAt,
            },
          });
        } catch (error) {
          console.error("[PO evidence] Reviewed submission transaction failed", error);
          throw new Error("Unable to create the reviewed purchase order and its evidence record");
        }

        await safeNotifyOwner(
          "Purchase Order Pending Approval",
          `PO #${purchaseOrderId} from ${governedInput.vendorName} for ₹${totalAmount} is awaiting approval. Reviewed extraction evidence was recorded.`,
        );

        return { success: true, purchaseOrderId, reviewId, approvalStatus: "Pending Approval" as const, evidenceRecorded: true as const };
      }),

    getAll: protectedProcedure.query(async () => {
      return db.getAllPurchaseOrdersWithReceiptState();
    }),

    getMetrics: protectedProcedure.query(async () => {
      return db.getPurchaseOrderMetrics();
    }),

    getById: protectedProcedure
      .input(z.object({ purchaseOrderId: z.string() }))
      .query(async ({ input }) => {
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) return null;
        const items = await db.getPurchaseOrderItems(input.purchaseOrderId);
        return { ...po, items };
      }),

    getExtractionReview: protectedProcedure
      .input(z.object({ purchaseOrderId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        await requirePurchaseOrderAccess(ctx.user);
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) throw new Error("Purchase Order not found");
        return db.getPurchaseOrderExtractionReview(input.purchaseOrderId);
      }),

    getReceiptSummary: protectedProcedure
      .input(z.object({ purchaseOrderId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "user" || !(await db.checkFeatureAccess(ctx.user.role, "purchase_orders"))) {
          throw new Error("You do not have permission to receive stock");
        }
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) throw new Error("Purchase Order not found");
        const items = await db.getPurchaseOrderReceiptSummary(input.purchaseOrderId);
        return { purchaseOrder: po, items };
      }),

    getGoodsReceipts: protectedProcedure
      .input(z.object({ purchaseOrderId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role === "user" || !(await db.checkFeatureAccess(ctx.user.role, "purchase_orders"))) {
          throw new Error("You do not have permission to view goods receipts");
        }
        return db.getGoodsReceiptsByPurchaseOrderId(input.purchaseOrderId);
      }),

    receiveStock: protectedProcedure
      .input(z.object({
        goodsReceiptId: z.string().min(8).max(64),
        purchaseOrderId: z.string().min(1),
        lines: z.array(z.object({
          poItemId: z.string().min(1),
          receivedQuantity: z.number().int().positive(),
          batchNumber: z.string().trim().min(1).max(100),
          expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          unitCost: z.string().optional(),
        })).min(1).max(100),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role === "user" || !(await db.checkFeatureAccess(ctx.user.role, "purchase_orders"))) {
          throw new Error("You do not have permission to receive stock");
        }
        return db.createGoodsReceipt({
          ...input,
          receivedBy: ctx.user.id.toString(),
          receivedByName: ctx.user.name ?? null,
        });
      }),

    getHistory: protectedProcedure
      .input(z.object({ purchaseOrderId: z.string() }))
      .query(async ({ input }) => {
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) throw new Error("Purchase Order not found");
        return db.getPurchaseOrderHistory(input.purchaseOrderId);
      }),

    updatePaymentStatus: protectedProcedure
      .input(z.object({
        purchaseOrderId: z.string(),
        paymentStatus: z.enum(["Pending", "Paid", "Partial"]),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.updatePurchaseOrder(input.purchaseOrderId, {
          paymentStatus: input.paymentStatus,
        });

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "UPDATE",
          tableName: "purchaseOrders",
          recordId: input.purchaseOrderId,
          newValue: JSON.stringify({ paymentStatus: input.paymentStatus }),
          timestamp: new Date().toISOString(),
        });

        await db.createPurchaseOrderHistory({
          historyId: utils.generateAuditLogId(),
          purchaseOrderId: input.purchaseOrderId,
          eventType: "PAYMENT_STATUS_CHANGED",
          actorId: ctx.user.id.toString(),
          actorName: ctx.user.name ?? null,
          eventSummary: `Payment status set to ${input.paymentStatus}.`,
          details: JSON.stringify({ paymentStatus: input.paymentStatus }),
        });

        return { success: true };
      }),

    approve: adminProcedure
      .input(z.object({ purchaseOrderId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const po = await db.approvePurchaseOrderWithAudit(input.purchaseOrderId, {
          actorId: ctx.user.id.toString(), actorName: ctx.user.name ?? null,
        });

		await safeNotifyOwner(
			"Purchase Order Approved",
			`PO #${input.purchaseOrderId} from ${po.vendorName} has been approved.`,
		);

        return { success: true };
      }),

    reject: adminProcedure
      .input(z.object({
        purchaseOrderId: z.string(),
        rejectionReason: z.string().min(5),
      }))
      .mutation(async ({ input, ctx }) => {
        const po = await db.rejectPurchaseOrderWithAudit(input.purchaseOrderId, input.rejectionReason, {
          actorId: ctx.user.id.toString(), actorName: ctx.user.name ?? null,
        });

		await safeNotifyOwner(
			"Purchase Order Rejected",
			`PO #${input.purchaseOrderId} from ${po.vendorName} has been rejected. Reason: ${input.rejectionReason}`,
		);

        return { success: true };
      }),

    recordCorrectionReview: protectedProcedure
      .input(z.object({
        purchaseOrderId: z.string(),
        verifiedFields: z.array(z.string().min(1).max(100)).min(1).max(100),
        confidenceSnapshot: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) throw new Error("Purchase Order not found");

        await db.createPurchaseOrderHistory({
          historyId: utils.generateAuditLogId(),
          purchaseOrderId: input.purchaseOrderId,
          eventType: "OCR_CORRECTION_REVIEWED",
          actorId: ctx.user.id.toString(),
          actorName: ctx.user.name ?? null,
          eventSummary: `${input.verifiedFields.length} OCR field(s) manually verified before PO submission.`,
          details: JSON.stringify({ verifiedFields: input.verifiedFields, confidenceSnapshot: input.confidenceSnapshot ?? null }),
        });

        return { success: true };
      }),

    uploadPoImage: protectedProcedure
      .input(z.object({
        imageData: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Convert base64 to buffer
          const base64Data = input.imageData.split(',')[1] || input.imageData;
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Upload to storage
          const { storagePut } = await import("./storage");
          const fileKey = `po-scans/${Date.now()}-${input.fileName}`;
          const { url: relativeUrl } = await storagePut(fileKey, buffer, 'image/jpeg');
          
          // Convert relative URL to absolute URL for OCR extraction
          const protocol = ctx.req.protocol || 'https';
          const host = ctx.req.get('host') || 'localhost:3000';
          const absoluteUrl = `${protocol}://${host}${relativeUrl}`;
          
          return { url: absoluteUrl, key: fileKey };
        } catch (error) {
          console.error("[PO Upload] Failed:", error);
          throw new Error(`Failed to upload PO image: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }),

    extractFromImage: protectedProcedure
      .input(z.object({
        imageUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        try {
          const poOcr = await import("./_core/poOcr");
          const extractedData = await poOcr.extractPOFromImage(input.imageUrl);
          return extractedData;
        } catch (error) {
          console.error("[PO OCR] Extraction failed:", error);
          throw new Error(`Failed to extract PO data: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }),
    validateExtractedData: protectedProcedure
      .input(z.object({
        vendorName: z.string(),
        vendorGstNumber: z.string(),
        vendorContactNumber: z.string(),
        vendorAddress: z.string(),
        poToName: z.string(),
        items: z.array(z.object({
          name: z.string(),
          quantity: z.string(),
          valuePerItem: z.string(),
          totalValue: z.string(),
        })),
        totalValue: z.string(),
        confidence: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const validation = await import("./_core/invoiceValidation");
          const result = validation.validateInvoice(input);
          return result;
        } catch (error) {
          console.error("[Invoice Validation] Validation failed:", error);
          throw new Error(`Failed to validate invoice: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }),
  }),

  // ============ RBAC USER MANAGEMENT ============
  // ============ CONSULTANTS ============
  consultants: router({
    getAll: protectedProcedure.query(async () => {
      try {
        const consultants = await db.getAllStaffUsers();
        return consultants
          .filter(u => u.role === 'consultant' && Boolean(u.isActive))
          .map(u => ({
            id: u.id,
            userId: u.userId,
            name: u.name,
            email: u.email,
            phone: u.phone,
            department: u.department,
            role: u.role,
            isActive: u.isActive,
            stateCounsilSection: u.stateCounsilSection,
            registrationNumber: u.registrationNumber,
            qualifications: u.qualifications,
            specialization: u.specialization,
            designation: u.designation,
            createdAt: u.createdAt,
          }));
      } catch (error) {
        console.error("[Consultants] Get all failed:", error);
        throw new Error("Failed to fetch consultants");
      }
    }),

    getById: protectedProcedure
      .input(z.object({ consultantId: z.number() }))
      .query(async ({ input }) => {
        try {
          const consultant = await db.getUserById(input.consultantId);
          if (!consultant || consultant.role !== 'consultant') {
            throw new Error("Consultant not found");
          }
          return {
            id: consultant.id,
            userId: consultant.userId,
            name: consultant.name,
            email: consultant.email,
            phone: consultant.phone,
            department: consultant.department,
            role: consultant.role,
            isActive: consultant.isActive,
            stateCounsilSection: consultant.stateCounsilSection,
            registrationNumber: consultant.registrationNumber,
            qualifications: consultant.qualifications,
            specialization: consultant.specialization,
            designation: consultant.designation,
            prescriptionHeaderText: consultant.prescriptionHeaderText,
            createdAt: consultant.createdAt,
          };
        } catch (error) {
          console.error("[Consultants] Get by ID failed:", error);
          throw new Error("Failed to fetch consultant");
        }
      }),

    getMyProfile: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "consultant") {
        throw new Error("Only consultants can access a consultant profile");
      }
      const consultant = await db.getConsultantProfileById(ctx.user.id);
      if (!consultant) throw new Error("Consultant profile not found");
      return {
        id: consultant.id,
        name: consultant.name,
        email: consultant.email,
        phone: consultant.phone,
        department: consultant.department,
        stateCounsilSection: consultant.stateCounsilSection,
        registrationNumber: consultant.registrationNumber,
        qualifications: consultant.qualifications,
        specialization: consultant.specialization,
        designation: consultant.designation,
        prescriptionHeaderText: consultant.prescriptionHeaderText,
        isActive: consultant.isActive,
      };
    }),

    updateProfile: adminProcedure
      .input(z.object({
        consultantId: z.number().int().positive(),
        name: z.string().min(2).max(255).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(20).optional(),
        department: z.string().max(100).optional(),
        qualifications: z.string().max(255).optional(),
        specialization: z.string().max(255).optional(),
        designation: z.string().max(255).optional(),
        stateCounsilSection: z.string().max(100).optional(),
        registrationNumber: z.string().max(100).optional(),
        prescriptionHeaderText: z.string().max(2_000).optional(),
        consultantLocation: z.string().max(500).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const existing = await db.getConsultantProfileById(input.consultantId);
        if (!existing) throw new Error("Consultant not found");
        const { consultantId, isActive, ...profileUpdates } = input;
        const updates = isActive === undefined
          ? profileUpdates
          : { ...profileUpdates, isActive: isActive ? 1 : 0 };
        await db.updateConsultantProfileById(consultantId, updates);
        const actionType = isActive === false
          ? "CONSULTANT_DEACTIVATED"
          : isActive === true && !existing.isActive
            ? "CONSULTANT_ACTIVATED"
            : "CONSULTANT_PROFILE_UPDATED";
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType,
          tableName: "users",
          recordId: consultantId.toString(),
          oldValue: JSON.stringify({ name: existing.name, isActive: existing.isActive, registrationNumber: existing.registrationNumber }),
          newValue: JSON.stringify({ ...updates, consultantId }),
          timestamp: new Date().toISOString(),
        });
        return { success: true };
      }),

    uploadAsset: adminProcedure
      .input(z.object({
        consultantId: z.number().int().positive(),
        assetType: z.enum(["logo", "signature"]),
        dataUrl: z.string().max(2_100_000),
      }))
      .mutation(async ({ input, ctx }) => {
        const consultant = await db.getConsultantProfileById(input.consultantId);
        if (!consultant) throw new Error("Consultant not found");
        const stored = await storeConsultantImage(input);
        await db.updateConsultantProfileById(input.consultantId, input.assetType === "logo"
          ? { consultantLogoKey: stored.key }
          : { signatureKey: stored.key });
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: input.assetType === "logo" ? "CONSULTANT_LOGO_UPDATED" : "CONSULTANT_SIGNATURE_UPDATED",
          tableName: "users",
          recordId: input.consultantId.toString(),
          newValue: JSON.stringify({ assetType: input.assetType, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes }),
          timestamp: new Date().toISOString(),
        });
        return {
          success: true,
          asset: {
            key: stored.key,
            url: stored.url,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
          },
        };
      }),
  }),

  rbac: router({
    createStaffUser: adminProcedure
      .input(z.object({
        role: z.enum(["consultant", "staff"]),
        name: z.string().trim().min(2).max(150),
        password: z.string().min(8).max(128),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        department: z.string().optional(),
        stateCounsilSection: z.string().max(100).optional(),
        registrationNumber: z.string().max(100).optional(),
        qualifications: z.string().max(255).optional(),
        specialization: z.string().max(255).optional(),
        designation: z.string().max(255).optional(),
        prescriptionHeaderText: z.string().max(2_000).optional(),
        consultantLocation: z.string().max(500).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const sequence = await db.getNextUserSequence(input.role);
          const userId = utils.generateUserId(input.role, sequence);
          const username = userId.toLowerCase();
          if (await db.getUserByUsername(username)) throw new Error("A user with this login ID already exists");
          if (input.email && await db.getUserByEmail(input.email)) throw new Error("A user with this email already exists");
          const passwordHash = await utils.hashPassword(input.password);

          const userData = {
            openId: `local-${userId}`,
            name: input.name,
            email: input.email,
            phone: input.phone,
            department: input.department,
            role: input.role,
            userId,
            username,
            passwordHash,
            isActive: 1,
            createdBy: ctx.user.id,
            loginMethod: "local",
            stateCounsilSection: input.stateCounsilSection,
            registrationNumber: input.registrationNumber,
            qualifications: input.qualifications,
            specialization: input.specialization,
            designation: input.designation,
            prescriptionHeaderText: input.prescriptionHeaderText,
            consultantLocation: input.consultantLocation,
          };

          await db.createStaffUser(userData);
          if (input.role === "consultant") {
            const createdConsultant = await db.getStaffUserById(userId);
            await db.createAuditLog({
              logId: utils.generateAuditLogId(),
              userId: ctx.user.id.toString(),
              actionType: "CONSULTANT_PROFILE_CREATED",
              tableName: "users",
              recordId: createdConsultant?.id?.toString() || userId,
              newValue: JSON.stringify({ userId, name: input.name, registrationNumber: input.registrationNumber }),
              timestamp: new Date().toISOString(),
            });
          }

          await safeNotifyOwner(
            `New ${input.role} created`,
            `${input.name} (${userId}) has been added to the system. The administrator supplied the initial password.`
          );

          return {
            success: true,
            userId,
            username,
          };
        } catch (error) {
          console.error("[RBAC] Create staff user failed:", error);
          const message = error instanceof Error ? error.message : "Failed to create staff user";
          if (message.includes("already exists")) throw new Error(message);
          throw new Error("Failed to create staff user");
        }
      }),

    listStaffUsers: adminProcedure.query(async () => {
      try {
        const staffUsers = await db.getAllStaffUsers();
        return Promise.all(staffUsers.map(async u => ({
          id: u.id,
          userId: u.userId,
          name: u.name,
          email: u.email,
          phone: u.phone,
          department: u.department,
          role: u.role,
          isActive: u.isActive,
          stateCounsilSection: u.stateCounsilSection,
          registrationNumber: u.registrationNumber,
          qualifications: u.qualifications,
          specialization: u.specialization,
          designation: u.designation,
          prescriptionHeaderText: u.prescriptionHeaderText,
          consultantLocation: u.consultantLocation,
          consultantLogoUrl: u.consultantLogoKey ? (await storageGet(u.consultantLogoKey)).url : null,
          signatureUrl: u.signatureKey ? (await storageGet(u.signatureKey)).url : null,
          createdAt: u.createdAt,
        })));
      } catch (error) {
        console.error("[RBAC] List staff users failed:", error);
        throw new Error("Failed to list staff users");
      }
    }),

    updateStaffUser: adminProcedure
      .input(z.object({
        userId: z.string(),
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        department: z.string().optional(),
        role: z.enum(["consultant", "staff"]).optional(),
        stateCounsilSection: z.string().optional(),
        registrationNumber: z.string().optional(),
        qualifications: z.string().max(255).optional(),
        specialization: z.string().max(255).optional(),
        designation: z.string().max(255).optional(),
        prescriptionHeaderText: z.string().max(2_000).optional(),
        consultantLocation: z.string().max(500).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const existing = await db.getStaffUserById(input.userId);
          if (!existing) throw new Error("User not found");
          const updates: Record<string, any> = {};
          if (input.name !== undefined) updates.name = input.name;
          if (input.email !== undefined) {
            const duplicate = await db.getUserByEmail(input.email);
            if (duplicate && duplicate.id !== existing.id) throw new Error("A user with this email already exists");
            updates.email = input.email;
          }
          if (input.phone !== undefined) updates.phone = input.phone;
          if (input.department !== undefined) updates.department = input.department;
          if (input.role !== undefined) updates.role = input.role;
          if (input.stateCounsilSection !== undefined) updates.stateCounsilSection = input.stateCounsilSection;
          if (input.registrationNumber !== undefined) updates.registrationNumber = input.registrationNumber;
          if (input.qualifications !== undefined) updates.qualifications = input.qualifications;
          if (input.specialization !== undefined) updates.specialization = input.specialization;
          if (input.designation !== undefined) updates.designation = input.designation;
          if (input.prescriptionHeaderText !== undefined) updates.prescriptionHeaderText = input.prescriptionHeaderText;
          if (input.consultantLocation !== undefined) updates.consultantLocation = input.consultantLocation;
          if (input.isActive !== undefined) updates.isActive = input.isActive;

          await db.updateStaffUser(input.userId, updates);
          if (existing.role === "consultant" || input.role === "consultant") {
            await db.createAuditLog({
              logId: utils.generateAuditLogId(),
              userId: ctx.user.id.toString(),
              actionType: input.isActive === false ? "CONSULTANT_DEACTIVATED" : input.isActive === true && !existing.isActive ? "CONSULTANT_ACTIVATED" : "CONSULTANT_PROFILE_UPDATED",
              tableName: "users",
              recordId: existing.id.toString(),
              oldValue: JSON.stringify({ name: existing.name, isActive: existing.isActive, registrationNumber: existing.registrationNumber }),
              newValue: JSON.stringify(updates),
              timestamp: new Date().toISOString(),
            });
          }
          return { success: true };
        } catch (error) {
          console.error("[RBAC] Update staff user failed:", error);
          const message = error instanceof Error ? error.message : "Failed to update staff user";
          if (message.includes("already exists")) throw new Error(message);
          throw new Error("Failed to update staff user");
        }
      }),

    resetUserPassword: adminProcedure
      .input(z.object({ userId: z.string().trim().min(1), password: z.string().min(8).max(128) }))
      .mutation(async ({ input, ctx }) => {
        const target = await db.getStaffUserById(input.userId);
        if (!target) throw new Error("User not found");
        await db.updateUserPassword(target.id, await utils.hashPassword(input.password));
        await db.createAuditLog({
          logId: utils.generateAuditLogId(), userId: ctx.user.id.toString(), actionType: "USER_PASSWORD_RESET",
          tableName: "users", recordId: target.id.toString(),
          newValue: JSON.stringify({ targetUserId: input.userId }), timestamp: new Date().toISOString(),
        });
        return { success: true, userId: input.userId };
      }),

    deleteStaffUser: adminProcedure
      .input(z.object({ userId: z.string().trim().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const target = await db.getStaffUserById(input.userId);
          if (!target) throw new Error("User not found");
          if (target.role === "admin" && target.isActive && await db.getActiveAdminCount() <= 1) {
            throw new Error("The last active administrator cannot be deleted");
          }
          const references = await db.getUserReferenceSummary(target.id);
          if (references.total > 0) throw new Error("This user is referenced by historical or operational records and cannot be deleted; deactivate the account instead.");
          await db.deleteStaffUser(input.userId);
          await db.createAuditLog({
            logId: utils.generateAuditLogId(), userId: ctx.user.id.toString(), actionType: "USER_DELETED",
            tableName: "users", recordId: target.id.toString(),
            oldValue: JSON.stringify({ userId: target.userId, role: target.role, name: target.name }), timestamp: new Date().toISOString(),
          });
          return { success: true };
        } catch (error) {
          console.error("[RBAC] Delete staff user failed:", error);
          throw new Error(error instanceof Error ? error.message : "Failed to delete staff user");
        }
      }),

    loginWithQRCode: publicProcedure
      .input(z.object({ encodedData: z.string() }))
      .mutation(async ({ input, ctx }) => {
        try {
          const { userId, password } = utils.decodeQRCodeLogin(input.encodedData);
          // Try to find user by username (case-insensitive)
          let user = await db.getStaffUserByUsername(userId.toLowerCase());
          if (!user) {
            // Try by userId field directly
            user = await db.getStaffUserById(userId);
          }

          if (!user || !user.passwordHash) {
            throw new Error("Invalid credentials");
          }

          const isPasswordValid = await utils.verifyPassword(password, user.passwordHash);
          if (!isPasswordValid) {
            throw new Error("Invalid credentials");
          }

          if (!user.isActive) {
            throw new Error("User account is inactive");
          }

          // Update last signed in
          await db.updateStaffUser(user.userId!, { lastSignedIn: new Date().toISOString() });

          // Create session token and set cookie
          const sessionToken = await sdk.createSessionToken(user.openId || `local-${user.userId}`, {
            name: user.name || "",
          });

          // Set session cookie with correct cookie name
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });

          return {
            success: true,
            user: {
              id: user.id,
              userId: user.userId,
              name: user.name,
              role: user.role,
              department: user.department,
            },
          };
        } catch (error) {
          console.error("[RBAC] QR code login failed:", error);
          throw new Error("QR code login failed");
        }
      }),

    loginWithCredentials: publicProcedure
      .input(z.object({
        userId: z.string(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          console.log(`[RBAC] Login attempt with credentials - userId: ${input.userId}`);
          
          // Try to find user by username (case-insensitive)
          let user = await db.getStaffUserByUsername(input.userId.toLowerCase());
          console.log(`[RBAC] User lookup by username(${input.userId.toLowerCase()}):`, user ? 'found' : 'not found');
          
          if (!user) {
            // Try by userId field directly
            user = await db.getStaffUserById(input.userId);
            console.log(`[RBAC] User lookup by userId(${input.userId}):`, user ? 'found' : 'not found');
          }

          if (!user || !user.passwordHash) {
            console.log(`[RBAC] User not found or no password hash`);
            throw new Error("Invalid credentials");
          }

          console.log(`[RBAC] User found: ${user.username}, verifying password...`);
          const isPasswordValid = await utils.verifyPassword(input.password, user.passwordHash);
          console.log(`[RBAC] Password valid: ${isPasswordValid}`);
          if (!isPasswordValid) {
            throw new Error("Invalid credentials");
          }

          if (!user.isActive) {
            throw new Error("User account is inactive");
          }

          // Update last signed in
          await db.updateStaffUser(user.userId!, { lastSignedIn: new Date().toISOString() });

          // Create session token and set cookie
          const sessionToken = await sdk.createSessionToken(user.openId || `local-${user.userId}`, {
            name: user.name || "",
          });

          // Set session cookie with correct cookie name
          const cookieOptions = getSessionCookieOptions(ctx.req);
          ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });

          return {
            success: true,
            user: {
              id: user.id,
              userId: user.userId,
              name: user.name,
              role: user.role,
              department: user.department,
            },
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("[RBAC] Credential login failed:", errorMessage, error);
          throw new Error(`Login failed: ${errorMessage}`);
        }
      }),
  }),

  // ============ PROTECTED FILE LINKS ============
  files: router({
    getArtifactLink: protectedProcedure
      .input(z.object({
        key: z.string().optional(),
        url: z.string().optional(),
        patientId: z.string().optional(),
        recordId: z.string().optional(),
        artifactType: z.enum(["barcode", "qr_code", "audio", "invoice_pdf"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const storageKey = resolveArtifactStorageKey(input);
        if (!storageKey) throw new Error("Storage key is required for protected artifact retrieval");

        const artifact = await storageGet(storageKey);
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "PHI_FILE_ACCESS",
          tableName: "storage_artifacts",
          recordId: input.recordId || input.patientId || storageKey,
          newValue: JSON.stringify({ artifactType: input.artifactType, patientId: input.patientId, key: artifact.key }),
          timestamp: new Date().toISOString(),
        });

        return artifact;
      }),
  }),

  // ============ AUDIT LOGS ============
  auditLogs: router({
    getAll: adminProcedure.query(async () => {
      return db.getAuditLogs(500);
    }),
  }),

  // ============ NOTIFICATIONS ============
  notifications: router({
    getByUserId: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return db.getNotificationsByUserId(input.userId);
      }),
    markAsRead: protectedProcedure
      .input(z.object({ notificationId: z.string() }))
      .mutation(async ({ input }) => {
        await db.markNotificationAsRead(input.notificationId);
        return { success: true };
      }),
  }),
  // ============ DAILY EXPORT ============
  dailyExport: router({
    exportDailyReport: adminProcedure
      .input(z.object({ date: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const { getDailyData, generatePDFReport, generateExcelReport, saveDailyExport } = await import('./dailyExport');
          const data = await getDailyData(input.date);
          const pdfBuffer = await generatePDFReport(data);
          const excelBuffer = await generateExcelReport(data);
          const { pdfUrl, excelUrl } = await saveDailyExport(input.date, pdfBuffer, excelBuffer);
          return {
            success: true,
            date: input.date,
            pdfUrl,
            excelUrl,
            summary: {
              patientsRegistered: data.patientsRegistered,
              consultationsCompleted: data.consultationsCompleted,
              totalBilling: data.totalBilling,
            },
          };
        } catch (error) {
          console.error('Daily export failed:', error);
          throw new Error('Failed to generate daily export');
        }
      }),
  }),

  // ============ FEATURE ACCESS CONTROL ============
  featureAccess: router({
    // Get all feature permissions for a specific role
    getPermissions: adminProcedure
      .input(z.object({ role: z.enum(["consultant", "staff"]) }))
      .query(async ({ input }) => {
        // Get stored permissions or return defaults
        const stored = await db.getFeaturePermissions(input.role);
        return stored || getDefaultPermissions(input.role);
      }),

    // Update feature permissions for a role
    updatePermissions: adminProcedure
      .input(z.object({
        role: z.enum(["consultant", "staff"]),
        permissions: z.record(z.string(), z.boolean()),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.setFeaturePermissions(input.role, input.permissions);
        
        // Log audit entry
        await db.createAuditLog({
          logId: nanoid(),
          userId: String(ctx.user.id),
          actionType: "UPDATE_FEATURE_ACCESS",
          tableName: "featureAccess",
          recordId: input.role,
          oldValue: JSON.stringify(await db.getFeaturePermissions(input.role)),
          newValue: JSON.stringify(input.permissions),
          timestamp: new Date().toISOString(),
        });

        return { success: true };
      }),

    // Check if a specific feature is enabled for a role
    checkAccess: protectedProcedure
      .input(z.object({
        role: z.enum(["consultant", "staff"]),
        featureKey: z.string(),
      }))
      .query(async ({ input }) => {
        const permissions = await db.getFeaturePermissions(input.role);
        const defaultPerms = getDefaultPermissions(input.role);
        const perms = permissions || defaultPerms;
        return perms[input.featureKey] ?? false;
      }),

    // Get current user's feature permissions (for non-admin users)
    getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "consultant" || ctx.user.role === "staff") {
        const stored = await db.getFeaturePermissions(ctx.user.role);
        return stored || getDefaultPermissions(ctx.user.role);
      }
      return {};
    }),

    getTemplates: protectedProcedure.query(async () => {
      return {
        consultant: {
          name: "Consultant",
          description: "Full access to clinical features",
          permissions: getDefaultPermissions("consultant"),
        },
        staff: {
          name: "Staff",
          description: "Limited access to administrative features",
          permissions: getDefaultPermissions("staff"),
        },
      };
    }),

    applyTemplate: adminProcedure
      .input(z.object({
        role: z.enum(["consultant", "staff"]),
        template: z.enum(["consultant", "staff"]),
      }))
      .mutation(async ({ input, ctx }) => {
        const templatePermissions = getDefaultPermissions(input.template as "consultant" | "staff");
        await db.setFeaturePermissions(input.role, templatePermissions);
        
        await db.createAuditLog({
          logId: nanoid(),
          userId: String(ctx.user.id),
          actionType: "UPDATE",
          tableName: "rolePermissions",
          recordId: input.role,
          oldValue: "",
          newValue: JSON.stringify(templatePermissions),
          timestamp: new Date().toISOString(),
        });

        return { success: true };
      }),
  }),

  opForm: router({
    getTemplate: protectedProcedure.query(async () => {
      const template = await db.getOPFormTemplate();
      return template;
    }),

    updateTemplate: protectedProcedure
      .input(z.object({
        clinicName: z.string(),
        clinicSubtitle: z.string().optional(),
        headerFields: z.array(z.object({
          id: z.string(),
          label: z.string(),
          fieldType: z.enum(["text", "date", "dropdown", "checkbox", "textarea"]),
          required: z.boolean(),
          placeholder: z.string().optional(),
          options: z.array(z.string()).optional(),
        })),
        blankAreaHeight: z.number().min(50).max(500),
        footerText: z.string().optional(),
        showQRCode: z.boolean(),
        showBarcode: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.setOPFormTemplate(input);
        
        await db.createAuditLog({
          logId: nanoid(),
          userId: String(ctx.user.id),
          actionType: "UPDATE",
          tableName: "opFormTemplate",
          recordId: "default",
          oldValue: "",
          newValue: JSON.stringify(input),
          timestamp: new Date().toISOString(),
        });

        return { success: true };
      }),

    resetTemplate: protectedProcedure.mutation(async ({ ctx }) => {
      await db.resetOPFormTemplate();
      
      await db.createAuditLog({
        logId: nanoid(),
        userId: String(ctx.user.id),
        actionType: "UPDATE",
        tableName: "opFormTemplate",
        recordId: "default",
        oldValue: "",
        newValue: "reset_to_default",
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    }),

    getFeaturePermissions: adminProcedure
      .input(z.object({ role: z.enum(["consultant", "staff", "admin"]) }))
      .query(async ({ input }) => {
        try {
          return await db.getFeaturePermissions(input.role);
        } catch (error) {
          console.error("[RBAC] Get feature permissions failed:", error);
          throw new Error("Failed to get feature permissions");
        }
      }),

    setFeaturePermission: adminProcedure
      .input(z.object({ role: z.enum(["consultant", "staff"]), featureKey: z.string(), isEnabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        try {
          await db.setFeaturePermission(input.role, input.featureKey, input.isEnabled);
          await db.createAuditLog({
            logId: nanoid(),
            userId: String(ctx.user.id),
            actionType: "UPDATE",
            tableName: "rolePermissions",
            recordId: `${input.role}-${input.featureKey}`,
            oldValue: { isEnabled: !input.isEnabled },
            newValue: { isEnabled: input.isEnabled },
            timestamp: new Date().toISOString(),
          });
          return { success: true };
        } catch (error) {
          console.error("[RBAC] Set feature permission failed:", error);
          throw new Error("Failed to set feature permission");
        }
      }),

    initializeDefaultPermissions: adminProcedure.mutation(async () => {
      try {
        await db.initializeDefaultPermissions();
        return { success: true, message: "Default permissions initialized" };
      } catch (error) {
        console.error("[RBAC] Initialize default permissions failed:", error);
        throw new Error("Failed to initialize default permissions");
      }
    }),


  }),

  visits: router({
    activeConsultants: protectedProcedure.query(async ({ ctx }) => {
      await assertAppointmentWorkflowAccess(ctx);
      if (ctx.user.role === "consultant") {
        const consultant = await requireActiveConsultant(ctx.user.id);
        return [consultant];
      }
      return db.getActiveConsultants();
    }),

    patientCandidates: protectedProcedure
      .input(z.object({ query: z.string().trim().min(1).max(100) }))
      .query(async ({ input, ctx }) => {
        await assertAppointmentWorkflowAccess(ctx);
        const patients = await db.searchPatients(input.query);
        const ranked = rankPatientCandidates(input.query, patients);
        await db.createAuditLog({
          logId: utils.generateAuditLogId(), userId: String(ctx.user.id), actionType: "PHI_ACCESS", tableName: "patients", recordId: "visit-patient-search",
          newValue: JSON.stringify({ resultCount: ranked.length }), timestamp: new Date().toISOString(),
        });
        return ranked.map(({ patientId, firstName, lastName, age, gender, contactNumber, matchStrength }) => ({ patientId, firstName, lastName, age, gender, contactNumber, matchStrength }));
      }),

    registerPatient: protectedProcedure
      .input(z.object({
        firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), age: z.number().int().min(0).max(130).optional(),
        gender: z.enum(["Male", "Female", "Other"]).optional(), contactNumber: z.string().trim().min(10).max(20), email: z.string().trim().email().optional(), address: z.string().trim().max(1000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await assertAppointmentWorkflowAccess(ctx);
        const normalizedContactNumber = normalizeIndianMobile(input.contactNumber);
        if (!normalizedContactNumber) throw new Error("A valid Indian mobile number is required");
        const conflicts = await db.getPatientsByNormalizedContactNumber(normalizedContactNumber);
        if (hasStrongDuplicate(normalizedContactNumber, conflicts)) {
          return { created: false as const, requiresResolution: true as const, candidates: conflicts.map(({ patientId, firstName, lastName, age, gender, contactNumber }) => ({ patientId, firstName, lastName, age, gender, contactNumber })) };
        }
        const result = await registerPatientWithTracking(input, { auditActorId: String(ctx.user.id), notificationUserId: ctx.user.id, source: "cms" });
        return { created: true as const, requiresResolution: false as const, patient: result.patient };
      }),

    createEncounter: protectedProcedure
      .input(z.object({ patientId: z.string().trim().min(1), consultantId: z.number().int().positive(), source: z.enum(["WALK_IN", "PHONE", "MANUAL"]) }))
      .mutation(async ({ input, ctx }) => {
        await assertAppointmentWorkflowAccess(ctx);
        const patient = await db.getPatientById(input.patientId);
        if (!patient) throw new Error("Selected patient was not found");
        const consultantId = ctx.user.role === "consultant" ? ctx.user.id : input.consultantId;
        if (ctx.user.role === "consultant" && input.consultantId !== ctx.user.id) throw new Error("Consultants cannot create an encounter for another consultant");
        await requireActiveConsultant(consultantId);
        return db.createDirectEncounterWithAudit({ patientId: patient.patientId, consultantId, source: input.source, actorId: String(ctx.user.id) });
      }),

    checkInEncounter: protectedProcedure
      .input(z.object({ encounterId: z.string().trim().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const encounter = await db.getEncounterById(input.encounterId);
        if (!encounter) throw new Error("Encounter not found");
        if (ctx.user.role === "consultant" && encounter.consultantId !== ctx.user.id) throw new Error("Consultants can access only their own encounters");
        return db.checkInEncounterWithAudit(input.encounterId, String(ctx.user.id));
      }),

    generateEncounterOp: protectedProcedure
      .input(z.object({ encounterId: z.string().trim().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const encounter = await db.getEncounterById(input.encounterId);
        if (!encounter) throw new Error("Encounter not found");
        if (ctx.user.role === "consultant" && encounter.consultantId !== ctx.user.id) throw new Error("Consultants can access only their own encounters");
        const result = await db.startEncounterConsultationWithAudit(input.encounterId, String(ctx.user.id));
        return { consultation: result.consultation, created: result.created, encounterId: input.encounterId };
      }),

    createAppointment: protectedProcedure
      .input(z.object({ patientId: z.string().trim().min(1), consultantId: z.number().int().positive(), appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), appointmentTime: z.string().regex(/^\d{2}:\d{2}$/), appointmentSource: z.enum(["MANUAL", "WALK_IN", "PHONE"]), notes: z.string().trim().max(2000).optional() }))
      .mutation(async ({ input, ctx }) => {
        await assertAppointmentWorkflowAccess(ctx);
        const patient = await db.getPatientById(input.patientId);
        if (!patient) throw new Error("Selected patient was not found");
        if (ctx.user.role === "consultant" && input.consultantId !== ctx.user.id) throw new Error("Consultants cannot create an appointment for another consultant");
        const consultantId = ctx.user.role === "consultant" ? ctx.user.id : input.consultantId;
        await requireActiveConsultant(consultantId);
        const appointmentId = await db.createVisitAppointmentWithAudit({ ...input, consultantId, actorId: String(ctx.user.id) });
        return { appointmentId, patientId: patient.patientId, consultantId };
      }),

    checkIn: protectedProcedure
      .input(z.object({ appointmentId: z.string().trim().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const appointment = await requireAccessibleAppointment(ctx, input.appointmentId);
        const checkedIn = await db.checkInAppointmentWithAudit(input.appointmentId, String(ctx.user.id));
        const encounter = await db.createEncounterForAppointmentWithAudit({ appointmentId: input.appointmentId, actorId: String(ctx.user.id), appointment });
        return { ...checkedIn, encounterId: encounter.encounter.encounterId };
      }),

    startConsultation: protectedProcedure
      .input(z.object({ appointmentId: z.string().trim().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await requireAccessibleAppointment(ctx, input.appointmentId);
		return db.startAppointmentConsultationWithAudit(input.appointmentId, String(ctx.user.id));
		}),

		generateOp: protectedProcedure
		  .input(z.object({ appointmentId: z.string().trim().min(1) }))
		  .mutation(async ({ input, ctx }) => {
		    const appointment = await requireAccessibleAppointment(ctx, input.appointmentId);
		    if (appointment.status !== "Checked-in") throw new Error("Appointment must be checked in before generating an OP");
		    const result = await db.startAppointmentConsultationWithAudit(input.appointmentId, String(ctx.user.id));
		    return { consultation: result.consultation, created: result.created };
		  }),

		completeConsultation: protectedProcedure
		  .input(z.object({ consultationId: z.string().trim().min(1) }))
		  .mutation(async ({ input, ctx }) => {
		    const consultation = await db.getConsultationById(input.consultationId);
		    if (!consultation) throw new Error("Consultation not found");
		    if (ctx.user.role !== "admin" && ctx.user.role !== "consultant") throw new Error("Only the assigned consultant or an admin can complete an encounter");
		    if (ctx.user.role === "consultant" && consultation.consultantId !== ctx.user.id) throw new Error("Consultants can complete only their own encounters");
		    return db.completeConsultationWithAudit(input.consultationId, String(ctx.user.id), ctx.user.role === "admin");
		  }),

		getVisitChain: protectedProcedure
		  .input(z.object({ patientId: z.string().trim().min(1) }))
		  .query(async ({ input, ctx }) => {
		    await assertAppointmentWorkflowAccess(ctx);
		    if (ctx.user.role === "consultant") {
		      const chains = await db.getPatientVisitChain(input.patientId);
		      return chains.filter((chain) => chain.appointment.consultantId === ctx.user.id);
		    }
		    return db.getPatientVisitChain(input.patientId);
		  }),
	  }),

  appointments: router({
    // Get all appointments for a consultant or all appointments for admin
    list: protectedProcedure
      .input(z.object({
        consultantId: z.number().optional(),
        patientId: z.string().optional(),
        status: z.enum(["Scheduled", "Checked-in", "Completed", "Cancelled", "No-show"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        try {
          await assertAppointmentWorkflowAccess(ctx);
          let appointments: any[] = [];
          const requestedConsultantId = input.consultantId;
          if (ctx.user.role === "consultant" && requestedConsultantId && requestedConsultantId !== ctx.user.id) {
            throw new Error("Consultants cannot list another consultant's appointments");
          }
          const effectiveConsultantId = ctx.user.role === "consultant" ? ctx.user.id : requestedConsultantId;

          if (effectiveConsultantId) {
            appointments = await db.getAppointmentsByConsultant(effectiveConsultantId);
            if (input.patientId) appointments = appointments.filter((appointment) => appointment.patientId === input.patientId);
          } else if (input.patientId) {
            appointments = await db.getAppointmentsByPatient(input.patientId);
          } else {
            appointments = await db.getAllAppointments();
          }
          
          if (input.status) {
            appointments = appointments.filter((a: any) => a.status === input.status);
          }
          
          if (input.dateFrom) {
            appointments = appointments.filter((a: any) => a.appointmentDate >= input.dateFrom!);
          }
          
          if (input.dateTo) {
            appointments = appointments.filter((a: any) => a.appointmentDate <= input.dateTo!);
          }
          
          return appointments;
        } catch (error) {
          console.error("[Appointments] List failed:", error);
          throw new Error("Failed to fetch appointments");
        }
      }),

    // Create a new appointment
    create: protectedProcedure
      .input(z.object({
        patientId: z.string(),
        consultantId: z.number(),
        appointmentDate: z.string(),
        appointmentTime: z.string(),
        reason: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await assertAppointmentWorkflowAccess(ctx);
          if (ctx.user.role === "consultant" && input.consultantId !== ctx.user.id) {
            throw new Error("Consultants cannot create an appointment for another consultant");
          }
          const consultantId = ctx.user.role === "consultant" ? ctx.user.id : input.consultantId;
          await requireActiveConsultant(consultantId);
          // Check for conflicts
          const conflict = await db.checkAppointmentConflict(
            consultantId,
            input.appointmentDate,
            input.appointmentTime
          );
          
          if (conflict) {
            throw new Error("Time slot already booked");
          }
          
          const appointmentId = await db.createAppointmentSafely({
            patientId: input.patientId,
            consultantId,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            notes: input.notes,
          });
          
          return { appointmentId, consultantId };
        } catch (error) {
          console.error("[Appointments] Create failed:", error);
          throw new Error(error instanceof Error ? error.message : "Failed to create appointment");
        }
      }),

    // Reschedule an appointment
    reschedule: protectedProcedure
      .input(z.object({
        appointmentId: z.string(),
        newDate: z.string(),
        newTime: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const appointment = await requireAccessibleAppointment(ctx, input.appointmentId);
          
          const conflict = await db.checkAppointmentConflict(
            appointment.consultantId,
            input.newDate,
            input.newTime
          );
          
          if (conflict) {
            throw new Error("New time slot already booked");
          }
          
          await db.rescheduleAppointment(
            input.appointmentId,
            input.newDate,
            input.newTime
          );
          
          return { success: true };
        } catch (error) {
          console.error("[Appointments] Reschedule failed:", error);
          throw new Error(error instanceof Error ? error.message : "Failed to reschedule appointment");
        }
      }),

    // Cancel an appointment
    cancel: protectedProcedure
      .input(z.object({
        appointmentId: z.string(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await requireAccessibleAppointment(ctx, input.appointmentId);
          await db.cancelAppointment(input.appointmentId);
          return { success: true };
        } catch (error) {
          console.error("[Appointments] Cancel failed:", error);
          throw new Error("Failed to cancel appointment");
        }
      }),

    // Mark appointment as no-show
    markNoShow: protectedProcedure
      .input(z.object({
        appointmentId: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await requireAccessibleAppointment(ctx, input.appointmentId);
          await db.updateAppointmentStatus(input.appointmentId, "No-show");
          return { success: true };
        } catch (error) {
          console.error("[Appointments] Mark no-show failed:", error);
          throw new Error("Failed to mark appointment as no-show");
        }
      }),

    // Complete an appointment
    complete: protectedProcedure
      .input(z.object({
        appointmentId: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await requireAccessibleAppointment(ctx, input.appointmentId);
          await db.updateAppointmentStatus(input.appointmentId, "Completed");
          return { success: true };
        } catch (error) {
          console.error("[Appointments] Complete failed:", error);
          throw new Error("Failed to complete appointment");
        }
      }),

    // Get available slots for a consultant on a specific date
    getAvailableSlots: publicProcedure
      .input(z.object({
        consultantId: z.number(),
        date: z.string(),
      }))
      .query(async ({ input }) => {
        try {
          await requireActiveConsultant(input.consultantId);
          const slots = await db.getAvailableSlots(input.consultantId, input.date);
          return slots;
        } catch (error) {
          console.error("[Appointments] Get available slots failed:", error);
          throw new Error("Failed to fetch available slots");
        }
      }),
  }),

  billTemplates: router({
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        items: z.array(z.object({
          itemType: z.string(),
          description: z.string(),
          quantity: z.number().min(1),
          unitPrice: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const templateId = utils.generateBillTemplateId();
        await db.createBillTemplate({
          templateId,
          name: input.name,
          description: input.description,
          itemsJson: input.items,
          createdBy: ctx.user.id,
        });
        return { templateId };
      }),

    getAll: protectedProcedure
      .query(async () => {
        return db.getAllBillTemplates();
      }),

    getById: protectedProcedure
      .input(z.object({ templateId: z.string() }))
      .query(async ({ input }) => {
        return db.getBillTemplateById(input.templateId);
      }),

    update: adminProcedure
      .input(z.object({
        templateId: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        items: z.array(z.object({
          itemType: z.string(),
          description: z.string(),
          quantity: z.number().min(1),
          unitPrice: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const updates: any = {};
        if (input.name) updates.name = input.name;
        if (input.description) updates.description = input.description;
        if (input.items) updates.itemsJson = input.items;
        await db.updateBillTemplate(input.templateId, updates);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ templateId: z.string() }))
      .mutation(async ({ input }) => {
        await db.deleteBillTemplate(input.templateId);
        return { success: true };
      }),
  }),

});

// Default feature permissions by role
function getDefaultPermissions(role: "consultant" | "staff"): Record<string, boolean> {
  const defaults: Record<string, Record<string, boolean>> = {
    consultant: {
      patient_records: true,
      ambient_scribe: true,
      pharmacy: true,
      billing: true,
      purchase_orders: false,
      appointments: true,
      notifications: true,
      audit_trail: false,
      daily_export: false,
      user_management: false,
    },
    staff: {
      patient_records: true,
      ambient_scribe: false,
      pharmacy: true,
      billing: false,
      purchase_orders: true,
      appointments: false,
      notifications: true,
      audit_trail: false,
      daily_export: false,
      user_management: false,
    },
  };
  return defaults[role] || {};
}

export type AppRouter = typeof appRouter;
