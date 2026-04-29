import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ============ PATIENT REGISTRATION ============
  patients: router({
    register: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        gender: z.enum(["Male", "Female", "Other"]).optional(),
        contactNumber: z.string().min(10),
        email: z.string().email().optional(),
        address: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Generate unique patient ID
        const patientId = utils.generatePatientId(input.firstName, input.lastName, input.dateOfBirth);
        
        // Check if patient already exists
        const existingPatient = await db.getPatientById(patientId);
        if (existingPatient) {
          throw new Error("Patient already registered");
        }

        // Generate OPD tracking barcode and QR code, then persist images in cloud storage.
        const barcodeData = utils.generateBarcodeData(patientId);
        const barcodeAssets = await barcodeGen.generatePatientBarcodes(patientId);
        const [qrUpload, barcodeUpload] = await Promise.all([
          storagePut(`barcodes/${patientId}-qr.png`, barcodeAssets.qrCodePngBuffer, "image/png"),
          storagePut(`barcodes/${patientId}-barcode.png`, barcodeAssets.barcodePngBuffer, "image/png"),
        ]);

        // Create patient record
        const patient = await db.createPatient({
          patientId,
          firstName: input.firstName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          contactNumber: input.contactNumber,
          email: input.email,
          address: input.address,
          barcodeData,
          barcodeImageUrl: barcodeUpload.url,
          barcodeImageKey: barcodeUpload.key,
          qrcodeImageUrl: qrUpload.url,
          qrcodeImageKey: qrUpload.key,
        });

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CREATE",
          tableName: "patients",
          recordId: patientId,
          newValue: JSON.stringify(patient),
          timestamp: new Date(),
        });

        // Trigger in-app and owner-channel notifications for the clinic owner.
        await db.createNotification({
          notificationId: utils.generateNotificationId(),
          userId: ctx.user.id,
          title: "New Patient Registration",
          content: `${input.firstName} ${input.lastName} has been registered.`,
          notificationType: "patient_registration",
        });
        await safeNotifyOwner(
          "New Patient Registration",
          `${input.firstName} ${input.lastName} has been registered with Patient ID ${patientId}.`,
        );

        return {
          success: true,
          patientId,
          barcodeData,
          barcodeImageUrl: barcodeUpload.url,
          qrcodeImageUrl: qrUpload.url,
          barcodeImageKey: barcodeUpload.key,
          qrcodeImageKey: qrUpload.key,
        };
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
        timestamp: new Date(),
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
          timestamp: new Date(),
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
          timestamp: new Date(),
        });
        return results;
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
          timestamp: new Date(),
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
          consultationDate: new Date(),
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
          timestamp: new Date(),
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
          isFinalized: true,
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
          timestamp: new Date(),
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
        quantityAvailable: z.number().optional(),
        reorderLevel: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const oldItem = await db.getInventoryItemById(input.itemId);

        await db.updateInventoryItem(input.itemId, {
          quantityAvailable: input.quantityAvailable,
          reorderLevel: input.reorderLevel,
        });

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
          newValue: JSON.stringify({ quantityAvailable: input.quantityAvailable, reorderLevel: input.reorderLevel }),
          timestamp: new Date(),
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
          consultationId: input.consultationId,
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
          timestamp: new Date(),
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
        timestamp: new Date(),
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
          timestamp: new Date(),
        });

        return { success: true };
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
          timestamp: new Date(),
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
});

export type AppRouter = typeof appRouter;
