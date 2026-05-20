import { describe, expect, it } from "vitest";
import { generateInvoicePDF } from "./invoice";

describe("invoice PDF generation", () => {
  it("generates a valid PDF buffer for a sample clinic invoice", async () => {
    const pdf = await generateInvoicePDF({
      billId: "BILL-TEST-001",
      patientId: "PAT-TEST-001",
      patientName: "Test Patient",
      patientContact: "+91 90000 00000",
      consultationDate: new Date("2026-04-29T09:00:00.000Z"),
      items: [
        {
          description: "General Consultation",
          quantity: 1,
          unitPrice: 500,
          subtotal: 500,
        },
      ],
      totalAmount: 500,
      discountAmount: 0,
      taxAmount: 0,
      finalAmount: 500,
      paymentStatus: "Pending",
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
