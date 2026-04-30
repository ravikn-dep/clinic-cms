import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as utils from "./utils";
import * as barcode from "./barcode";
import * as invoiceGen from "./invoice";
import { storagePut } from "./storage";

/**
 * Enhanced patient registration with barcode/QR generation
 */
export const patientRegistrationRouter = router({
  registerWithBarcodes: protectedProcedure
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
      // Generate a daily sequential OP patient ID in the requested clinic format.
      const registrationDate = new Date();
      const patientIdPrefix = utils.generatePatientIdPrefix(registrationDate);
      let dailySequence = (await db.countPatientsByPatientIdPrefix(patientIdPrefix)) + 1;
      let patientId = utils.generatePatientId(dailySequence, registrationDate);

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const existingPatient = await db.getPatientById(patientId);
        if (!existingPatient) break;
        dailySequence += 1;
        patientId = utils.generatePatientId(dailySequence, registrationDate);

        if (attempt === 99) {
          throw new Error("Unable to allocate a unique daily Patient ID. Please retry registration.");
        }
      }

      // Generate barcodes
      const barcodes = await barcode.generatePatientBarcodes(patientId);

      // Store QR code image
      const qrCodeBuffer = Buffer.from(barcodes.qrCodeDataUrl.split(",")[1] || "", "base64");
      const { url: qrCodeUrl, key: qrCodeKey } = await storagePut(
        `barcodes/${patientId}-qr.png`,
        qrCodeBuffer,
        "image/png"
      );

      // Create patient record with barcode URLs
      const patient = await db.createPatient({
        patientId,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        contactNumber: input.contactNumber,
        email: input.email,
        address: input.address,
        barcodeData: patientId,
        qrcodeImageUrl: qrCodeUrl,
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

      // Trigger notification
      await db.createNotification({
        notificationId: utils.generateNotificationId(),
        userId: ctx.user.id,
        title: "New Patient Registration",
        content: `${input.firstName} ${input.lastName} has been registered with ID ${patientId}.`,
        notificationType: "patient_registration",
      });

      return {
        success: true,
        patientId,
        qrCodeUrl,
        barcodeData: patientId,
      };
    }),
});

/**
 * Enhanced billing with PDF invoice generation
 */
export const billingRouter = router({
  createWithPDF: protectedProcedure
    .input(z.object({
      patientId: z.string(),
      patientName: z.string(),
      patientContact: z.string(),
      consultationId: z.string().optional(),
      items: z.array(z.object({
        description: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
      })),
      discountAmount: z.number().optional(),
      taxAmount: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const billId = utils.generateBillId();

      // Calculate totals
      let totalAmount = 0;
      const billItems = input.items.map((item) => {
        const subtotal = item.quantity * item.unitPrice;
        totalAmount += subtotal;
        return {
          ...item,
          subtotal,
        };
      });

      const discountAmount = input.discountAmount || 0;
      const taxAmount = input.taxAmount || 0;
      const finalAmount = totalAmount - discountAmount + taxAmount;

      // Create bill in database
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
      for (const item of billItems) {
        await db.createBillItem({
          billItemId: utils.generateBillItemId(),
          billId,
          itemType: "Service",
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString() as any,
          subtotal: item.subtotal.toString() as any,
        });
      }

      // Generate PDF invoice
      const invoiceData = {
        billId,
        patientId: input.patientId,
        patientName: input.patientName,
        patientContact: input.patientContact,
        consultationDate: new Date(),
        items: billItems,
        totalAmount,
        discountAmount,
        taxAmount,
        finalAmount,
        paymentStatus: "Pending" as const,
      };

      const { url: invoiceUrl, key: invoiceKey } = await invoiceGen.generateAndStoreInvoicePDF(invoiceData);

      // Update bill with PDF URL
      await db.updateBill(billId, {
        invoicePdfUrl: invoiceUrl,
        invoicePdfKey: invoiceKey,
      });

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
        userId: ctx.user.id,
        title: "Invoice Generated",
        content: `Invoice ${billId} generated for ${input.patientName}. Amount: ₹${finalAmount.toFixed(2)}`,
        notificationType: "invoice_generated",
      });

      return {
        success: true,
        billId,
        invoiceUrl,
        finalAmount,
      };
    }),
});
