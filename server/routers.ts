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
          console.error("[Auth] Password login failed:", error);
          throw new Error("Login failed");
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
        // Generate a daily sequential OP patient ID in the requested clinic format.
        const registrationDate = new Date();
        const patientIdPrefix = utils.generatePatientIdPrefix(registrationDate);
        let dailySequence = (await db.countPatientsByPatientIdPrefix(patientIdPrefix)) + 1;
        let patientId = utils.generatePatientId(dailySequence, registrationDate);

        // Guard against rare concurrent-registration collisions by advancing the sequence.
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const existingPatient = await db.getPatientById(patientId);
          if (!existingPatient) break;
          dailySequence += 1;
          patientId = utils.generatePatientId(dailySequence, registrationDate);

          if (attempt === 99) {
            throw new Error("Unable to allocate a unique daily Patient ID. Please retry registration.");
          }
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
          dateOfBirth: null,
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
          timestamp: new Date(),
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
          timestamp: new Date(),
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
          timestamp: new Date(),
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
            timestamp: new Date(),
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
      .input(z.object({
        vendorName: z.string().min(1),
        vendorContactNumber: z.string().min(10),
        vendorEmail: z.string().email().optional(),
        vendorGSTNumber: z.string().optional(),
        vendorBankDetails: z.string().optional(),
        vendorAddress: z.string().optional(),
        totalAmount: z.string(),
        expectedDeliveryDate: z.string().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          itemName: z.string(),
          quantity: z.number(),
          unitPrice: z.string(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const purchaseOrderId = utils.generateAuditLogId();
        const totalAmount = parseFloat(input.totalAmount);

        const po = await db.createPurchaseOrder({
          purchaseOrderId,
          vendorName: input.vendorName,
          vendorContactNumber: input.vendorContactNumber,
          vendorEmail: input.vendorEmail,
          vendorGSTNumber: input.vendorGSTNumber,
          vendorBankDetails: input.vendorBankDetails,
          vendorAddress: input.vendorAddress,
          totalAmount: totalAmount.toString() as any,
          paymentStatus: "Pending",
          expectedDeliveryDate: input.expectedDeliveryDate,
          notes: input.notes,
        });

        for (const item of input.items) {
          const poItemId = utils.generateAuditLogId();
          const unitPrice = parseFloat(item.unitPrice);
          const subtotal = unitPrice * item.quantity;

          await db.createPurchaseOrderItem({
            poItemId,
            purchaseOrderId,
            itemName: item.itemName,
            quantity: item.quantity,
            unitPrice: unitPrice.toString() as any,
            subtotal: subtotal.toString() as any,
          });

          // Auto-add to pharmacy inventory when PO is created (Pending status)
          try {
            const existingItem = await db.getInventoryByName(item.itemName);
            
            if (existingItem) {
              // Update existing item quantity (even if current quantity is 0)
              const currentQuantity = existingItem.quantityAvailable || 0;
              const newQuantity = currentQuantity + item.quantity;
              await db.updateInventoryItem(existingItem.itemId, { quantityAvailable: newQuantity });
            } else {
              // Create new inventory item
              const itemId = utils.generateAuditLogId();
              const futureDate = new Date();
              futureDate.setFullYear(futureDate.getFullYear() + 1);
              await db.createInventoryItem({
                itemId,
                itemName: item.itemName,
                quantityAvailable: item.quantity,
                unitPrice: unitPrice.toString() as any,
                reorderLevel: Math.ceil(item.quantity * 0.2),
                batchNumber: `PO-${purchaseOrderId}`,
                expiryDate: futureDate.toISOString().split('T')[0],
              });
            }

            // Log inventory addition
            await db.createAuditLog({
              logId: utils.generateAuditLogId(),
              userId: ctx.user.id.toString(),
              actionType: "CREATE",
              tableName: "inventory",
              recordId: item.itemName,
              newValue: JSON.stringify({ itemName: item.itemName, quantity: item.quantity, source: `PO-${purchaseOrderId}` }),
              timestamp: new Date(),
            });
          } catch (error) {
            console.error(`Failed to add inventory for ${item.itemName}:`, error);
          }
        }

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CREATE",
          tableName: "purchaseOrders",
          recordId: purchaseOrderId,
          newValue: JSON.stringify({ vendorName: input.vendorName, totalAmount }),
          timestamp: new Date(),
        });

        await safeNotifyOwner(
          "New Purchase Order Created",
          `Purchase order for ${input.vendorName} (${purchaseOrderId}) has been created with total amount ${totalAmount}.`,
        );

        // Notify owner that PO requires approval
        await safeNotifyOwner(
          "Purchase Order Pending Approval",
          `PO #${purchaseOrderId} from ${input.vendorName} for ₹${totalAmount} is awaiting approval.`,
        );

        return { success: true, purchaseOrderId };
      }),

    getAll: protectedProcedure.query(async () => {
      return db.getAllPurchaseOrders();
    }),

    getById: protectedProcedure
      .input(z.object({ purchaseOrderId: z.string() }))
      .query(async ({ input }) => {
        const po = await db.getPurchaseOrderById(input.purchaseOrderId);
        if (!po) return null;
        const items = await db.getPurchaseOrderItems(input.purchaseOrderId);
        return { ...po, items };
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
          timestamp: new Date(),
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
          timestamp: new Date(),
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
          timestamp: new Date(),
        });

        return { success: true };
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
            isActive: true,
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
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const updates: Record<string, any> = {};
          if (input.name) updates.name = input.name;
          if (input.email) updates.email = input.email;
          if (input.phone) updates.phone = input.phone;
          if (input.department) updates.department = input.department;
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
          await db.updateStaffUser(user.userId!, { lastSignedIn: new Date() });

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
          await db.updateStaffUser(user.userId!, { lastSignedIn: new Date() });

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
          console.error("[RBAC] Credential login failed:", error);
          throw new Error("Login failed. Please check your credentials.");
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
          timestamp: new Date(),
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
          timestamp: new Date(),
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
          timestamp: new Date(),
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
        timestamp: new Date(),
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
            timestamp: new Date(),
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
