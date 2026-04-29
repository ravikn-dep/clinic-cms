import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as utils from "./utils";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { nanoid } from "nanoid";
import * as barcodeGen from "./barcode";
import * as invoiceGen from "./invoice";

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

        // Generate barcode data
        const barcodeData = utils.generateBarcodeData(patientId);

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

        // Trigger notification for clinic owner
        const ownerNotification = await db.createNotification({
          notificationId: utils.generateNotificationId(),
          userId: ctx.user.id, // In production, use clinic owner's ID
          title: "New Patient Registration",
          content: `${input.firstName} ${input.lastName} has been registered.`,
          notificationType: "patient_registration",
        });

        return {
          success: true,
          patientId,
          barcodeData,
        };
      }),

    getAll: protectedProcedure.query(async () => {
      return db.getAllPatients();
    }),

    getById: protectedProcedure
      .input(z.object({ patientId: z.string() }))
      .query(async ({ input }) => {
        return db.getPatientById(input.patientId);
      }),

    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        return db.searchPatients(input.query);
      }),
  }),

  // ============ CONSULTATIONS - AMBIENT SCRIBE ============
  consultations: router({
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

        return item;
      }),

    getAll: protectedProcedure.query(async () => {
      return db.getAllInventoryItems();
    }),

    getLowStock: protectedProcedure.query(async () => {
      const lowStockItems = await db.getLowStockItems();
      
      // Trigger notifications for low stock
      for (const item of lowStockItems) {
        await db.createNotification({
          notificationId: utils.generateNotificationId(),
          userId: 1, // Clinic owner
          title: "Low Stock Alert",
          content: `${item.itemName} (Batch: ${item.batchNumber}) is running low. Current quantity: ${item.quantityAvailable}`,
          notificationType: "low_stock",
        });
      }

      return lowStockItems;
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

        // Create bill
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

        // Create bill items
        for (const item of input.items) {
          const billItemId = utils.generateBillItemId();
          const subtotal = parseFloat(item.unitPrice) * item.quantity;

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

        // Log audit trail
        await db.createAuditLog({
          logId: utils.generateAuditLogId(),
          userId: ctx.user.id.toString(),
          actionType: "CREATE",
          tableName: "bills",
          recordId: billId,
          newValue: JSON.stringify(bill),
          timestamp: new Date(),
        });

        // Trigger notification
        await db.createNotification({
          notificationId: utils.generateNotificationId(),
          userId: 1,
          title: "Invoice Generated",
          content: `Invoice ${billId} has been generated for patient ${input.patientId}. Amount: ${finalAmount}`,
          notificationType: "invoice_generated",
        });

        return bill;
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

  // ============ AUDIT LOGS ============
  auditLogs: router({
    getAll: protectedProcedure.query(async () => {
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
