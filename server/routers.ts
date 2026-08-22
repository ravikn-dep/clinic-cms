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
import { getOcrProvider } from "./ocr/provider";
import { parseOcrText } from "./poParsing/parser";
import { reconcileDocument } from "./poParsing/reconcile";
import { applySubmittedPurchaseOrderValues, createExtractionReviewEvidence } from "../shared/poExtractionReview";
import type { PurchaseOrderReviewPrefill } from "../shared/poReviewPrefill";

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

const purchaseOrderCreateInputSchema = z.object({
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

function buildPendingApprovalPurchaseOrder(input: z.infer<typeof purchaseOrderCreateInputSchema>) {
  const purchaseOrderId = utils.generateAuditLogId();
  const totalAmount = Number(input.totalAmount);
  const items = input.items.map((item) => {
    const poItemId = utils.generateAuditLogId();
    const unitPrice = Number(item.unitPrice);
    return {
      poItemId,
      purchaseOrderId,
      itemName: item.itemName.trim(),
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

async function requirePurchaseOrderAccess(user: { id: number; role: "user" | "admin" | "consultant" | "staff" }) {
  if (user.role === "user") {
    throw new Error("You do not have permission to access purchase-order evidence");
  }
  if (!(await db.checkFeatureAccess(user.role, "purchase_orders"))) {
    throw new Error("You do not have permission to access purchase-order evidence");
  }
}

export const appRouter = router({
  system: systemRouter,

  ocr: router({
    extractDocument: protectedProcedure
      .input(z.object({
        data: z.string(),
        mimeType: z.string(),
        maxSizeMb: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const provider = getOcrProvider();
          const result = await provider.extractDocument({
            data: input.data,
            mimeType: input.mimeType,
            maxSizeMb: input.maxSizeMb,
          });
          return result;
        } catch (error) {
          const errMessage = error instanceof Error ? error.message : String(error);
          console.error("[OCR Router] Extraction failed:", errMessage);

          const isSafeValidation =
            errMessage.includes("Unsupported MIME type") ||
            errMessage.includes("PDF OCR is not supported") ||
            errMessage.includes("Cannot process empty file") ||
            errMessage.includes("exceeds maximum allowed limit") ||
            errMessage.includes("OCR input data is required") ||
            errMessage.includes("Malformed data URI");

          if (isSafeValidation) {
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
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await db.setUserPassword(ctx.user.id as number, input.password);
          return { success: true };
        } catch (error) {
          console.error("[Auth] Set password failed:", error);
          throw new Error("Failed to set password");
        }
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const user = await db.getUserByEmail(ctx.user.email || "");
          
          if (!user || !user.passwordHash) {
            throw new Error("User not found or password not set");
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
        audioFileUrl: z.string().optional(),
        audioFileKey: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const consultationId = utils.generateConsultationId();

        const consultation = await db.createConsultation({
          consultationId,
          patientId: input.patientId,
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
      .query(async ({ input }) => {
        return db.getConsultationById(input.consultationId);
      }),

    getByPatientId: protectedProcedure
      .input(z.object({ patientId: z.string() }))
      .query(async ({ input }) => {
        return db.getConsultationsByPatientId(input.patientId);
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
          consultantId: consultation.consultantId,
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
        const { purchaseOrderId, totalAmount, items, purchaseOrder } = buildPendingApprovalPurchaseOrder(input);

        await db.createPurchaseOrderWithItems(purchaseOrder, items);

        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CREATE",
          tableName: "purchaseOrders",
          recordId: purchaseOrderId,
          newValue: JSON.stringify({ vendorName: input.vendorName, totalAmount, approvalStatus: "Pending Approval" }),
          timestamp: new Date().toISOString(),
        });

        await db.createPurchaseOrderHistory({
          historyId: utils.generateAuditLogId(),
          purchaseOrderId,
          eventType: "CREATED_PENDING_APPROVAL",
          actorId: ctx.user.id.toString(),
          actorName: ctx.user.name ?? null,
          eventSummary: "Purchase order created and submitted for approval.",
          details: JSON.stringify({ vendorName: input.vendorName, totalAmount, authorizationNotes: input.authorizationNotes ?? null }),
        });

        await safeNotifyOwner(
          "Purchase Order Pending Approval",
          `PO #${purchaseOrderId} from ${input.vendorName} for ₹${totalAmount} is awaiting approval.`,
        );

        return { success: true, purchaseOrderId, approvalStatus: "Pending Approval" as const };
      }),

    createFromReviewedExtraction: protectedProcedure
      .input(purchaseOrderCreateInputSchema.extend({
        reviewSubmissionId: z.string().uuid(),
        extractionProvider: z.enum(["google-cloud-vision", "mock-ocr"]),
        review: purchaseOrderReviewPrefillSchema,
      }))
      .mutation(async ({ input, ctx }) => {
        await requirePurchaseOrderAccess(ctx.user);

        const duplicate = await db.getPurchaseOrderExtractionReviewBySubmissionId(input.reviewSubmissionId);
        if (duplicate) throw new Error("This reviewed extraction has already been submitted");

        const { purchaseOrderId, totalAmount, items, purchaseOrder } = buildPendingApprovalPurchaseOrder(input);
        const finalReview = applySubmittedPurchaseOrderValues(input.review as PurchaseOrderReviewPrefill, {
          vendorName: input.vendorName,
          vendorGSTNumber: input.vendorGSTNumber,
          items: input.items,
        });
        const reviewEvidence = createExtractionReviewEvidence(finalReview);
        const reviewedAt = new Date().toISOString();
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
            },
            auditLog: {
              logId: utils.generateAuditLogId(),
              userId: ctx.user.id.toString(),
              actionType: "CREATE",
              tableName: "purchaseOrderExtractionReviews",
              recordId: reviewId,
              newValue: JSON.stringify({ purchaseOrderId, reviewId, reviewStatus: "CONFIRMED" }),
              timestamp: reviewedAt,
            },
            history: {
              historyId: utils.generateAuditLogId(),
              purchaseOrderId,
              eventType: "EXTRACTION_REVIEW_CONFIRMED",
              actorId: ctx.user.id.toString(),
              actorName: ctx.user.name ?? null,
              eventSummary: "Reviewed OCR/parser extraction evidence recorded with pending-approval PO submission.",
              details: JSON.stringify({ reviewId, correctedFieldCount: reviewEvidence.correctedFields.length, documentType: reviewEvidence.documentType }),
              createdAt: reviewedAt,
            },
          });
        } catch (error) {
          console.error("[PO evidence] Reviewed submission transaction failed", error);
          throw new Error("Unable to create the reviewed purchase order and its evidence record");
        }

        await safeNotifyOwner(
          "Purchase Order Pending Approval",
          `PO #${purchaseOrderId} from ${input.vendorName} for ₹${totalAmount} is awaiting approval. Reviewed extraction evidence was recorded.`,
        );

        return { success: true, purchaseOrderId, reviewId, approvalStatus: "Pending Approval" as const, evidenceRecorded: true as const };
      }),

    getAll: protectedProcedure.query(async () => {
      return db.getAllPurchaseOrders();
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
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) throw new Error("Purchase Order not found");

        if (po.approvalStatus !== "Pending Approval") {
          throw new Error(`Cannot approve a PO with status: ${po.approvalStatus}`);
        }

        await db.approvePurchaseOrder(input.purchaseOrderId, ctx.user.name || ctx.user.id.toString());

        // Notify owner
        await notifyOwner({
          title: "Purchase Order Approved",
          content: `PO #${input.purchaseOrderId} from ${po.vendorName} has been approved.`,
        });

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "UPDATE",
          tableName: "purchaseOrders",
          recordId: input.purchaseOrderId,
          newValue: JSON.stringify({ approvalStatus: "Approved" }),
          timestamp: new Date().toISOString(),
        });

        await db.createPurchaseOrderHistory({
          historyId: utils.generateAuditLogId(),
          purchaseOrderId: input.purchaseOrderId,
          eventType: "APPROVED",
          actorId: ctx.user.id.toString(),
          actorName: ctx.user.name ?? null,
          eventSummary: "Purchase order approved.",
          details: JSON.stringify({ previousStatus: po.approvalStatus, approvalStatus: "Approved" }),
        });

        return { success: true };
      }),

    reject: adminProcedure
      .input(z.object({
        purchaseOrderId: z.string(),
        rejectionReason: z.string().min(5),
      }))
      .mutation(async ({ input, ctx }) => {
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) throw new Error("Purchase Order not found");

        if (po.approvalStatus !== "Pending Approval") {
          throw new Error(`Cannot reject a PO with status: ${po.approvalStatus}`);
        }

        await db.rejectPurchaseOrder(
          input.purchaseOrderId,
          input.rejectionReason,
          ctx.user.name || ctx.user.id.toString()
        );

        // Notify owner
        await notifyOwner({
          title: "Purchase Order Rejected",
          content: `PO #${input.purchaseOrderId} from ${po.vendorName} has been rejected. Reason: ${input.rejectionReason}`,
        });

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "UPDATE",
          tableName: "purchaseOrders",
          recordId: input.purchaseOrderId,
          newValue: JSON.stringify({ approvalStatus: "Rejected", rejectionReason: input.rejectionReason }),
          timestamp: new Date().toISOString(),
        });

        await db.createPurchaseOrderHistory({
          historyId: utils.generateAuditLogId(),
          purchaseOrderId: input.purchaseOrderId,
          eventType: "REJECTED",
          actorId: ctx.user.id.toString(),
          actorName: ctx.user.name ?? null,
          eventSummary: "Purchase order rejected.",
          details: JSON.stringify({ previousStatus: po.approvalStatus, approvalStatus: "Rejected", rejectionReason: input.rejectionReason }),
        });

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
          .filter(u => u.role === 'consultant')
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
            createdAt: consultant.createdAt,
          };
        } catch (error) {
          console.error("[Consultants] Get by ID failed:", error);
          throw new Error("Failed to fetch consultant");
        }
      }),
  }),

  rbac: router({
    createStaffUser: adminProcedure
      .input(z.object({
        role: z.enum(["consultant", "staff"]),
        name: z.string().min(2),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        department: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Generate user ID and temporary password
          const sequence = await db.getNextUserSequence(input.role);
          const userId = utils.generateUserId(input.role, sequence);
          const tempPassword = utils.generateTemporaryPassword();
          const passwordHash = await utils.hashPassword(tempPassword);
          const username = userId.toLowerCase();

          // Generate QR code for login
          const qrcodeLoginUrl = await utils.generateQRCodeForLogin(username, tempPassword);

          // Create user
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
            qrcodeLoginUrl,
            createdBy: ctx.user.id,
            loginMethod: "local",
          };

          await db.createStaffUser(userData);

          // Notify owner
          await safeNotifyOwner(
            `New ${input.role} created`,
            `${input.name} (${userId}) has been added to the system. Temporary password: ${tempPassword}`
          );

          return {
            success: true,
            userId,
            username,
            tempPassword,
            qrcodeLoginUrl,
          };
        } catch (error) {
          console.error("[RBAC] Create staff user failed:", error);
          throw new Error("Failed to create staff user");
        }
      }),

    listStaffUsers: adminProcedure.query(async () => {
      try {
        const staffUsers = await db.getAllStaffUsers();
        return staffUsers.map(u => ({
          id: u.id,
          userId: u.userId,
          name: u.name,
          email: u.email,
          phone: u.phone,
          department: u.department,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt,
        }));
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
        role: z.enum(["admin", "consultant", "staff", "user"]).optional(),
        stateCounsilSection: z.string().optional(),
        registrationNumber: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const updates: Record<string, any> = {};
          if (input.name) updates.name = input.name;
          if (input.email) updates.email = input.email;
          if (input.phone) updates.phone = input.phone;
          if (input.department) updates.department = input.department;
          if (input.role) updates.role = input.role;
          if (input.stateCounsilSection) updates.stateCounsilSection = input.stateCounsilSection;
          if (input.registrationNumber) updates.registrationNumber = input.registrationNumber;
          if (input.isActive !== undefined) updates.isActive = input.isActive;

          await db.updateStaffUser(input.userId, updates);
          return { success: true };
        } catch (error) {
          console.error("[RBAC] Update staff user failed:", error);
          throw new Error("Failed to update staff user");
        }
      }),

    deleteStaffUser: adminProcedure
      .input(z.object({ userId: z.string() }))
      .mutation(async ({ input }) => {
        try {
          await db.deleteStaffUser(input.userId);
          await safeNotifyOwner("Staff user deleted", `User ${input.userId} has been removed from the system`);
          return { success: true };
        } catch (error) {
          console.error("[RBAC] Delete staff user failed:", error);
          throw new Error("Failed to delete staff user");
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

  appointments: router({
    // Get all appointments for a consultant or all appointments for admin
    list: protectedProcedure
      .input(z.object({
        consultantId: z.number().optional(),
        patientId: z.string().optional(),
        status: z.enum(["Scheduled", "Completed", "Cancelled", "No-show"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        try {
          let appointments: any[] = [];
          
          if (input.patientId) {
            appointments = await db.getAppointmentsByPatient(input.patientId);
          } else if (input.consultantId) {
            appointments = await db.getAppointmentsByConsultant(input.consultantId);
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
          // Check for conflicts
          const conflict = await db.checkAppointmentConflict(
            input.consultantId,
            input.appointmentDate,
            input.appointmentTime
          );
          
          if (conflict) {
            throw new Error("Time slot already booked");
          }
          
          const appointment = await db.createAppointment({
            patientId: input.patientId,
            consultantId: input.consultantId,
            appointmentDate: input.appointmentDate,
            appointmentTime: input.appointmentTime,
            notes: input.notes,
          });
          
          return appointment;
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
      .mutation(async ({ input }) => {
        try {
          const appointment = await db.getAppointmentById(input.appointmentId);
          if (!appointment) throw new Error("Appointment not found");
          
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
      .mutation(async ({ input }) => {
        try {
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
      .mutation(async ({ input }) => {
        try {
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
      .mutation(async ({ input }) => {
        try {
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
