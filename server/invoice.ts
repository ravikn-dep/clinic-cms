import * as jsPDFModule from "jspdf";
import { storagePut } from "./storage";

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface InvoiceData {
  billId: string;
  patientId: string;
  patientName: string;
  patientContact: string;
  consultationDate: Date;
  items: InvoiceItem[];
  totalAmount: number;
  discountAmount: number;
  taxAmount: number;
  finalAmount: number;
  paymentStatus: "Pending" | "Paid" | "Partial";
}

/**
 * Generate PDF invoice
 */
function createJsPDFDocument() {
  const moduleShape = jsPDFModule as unknown as {
    jsPDF?: unknown;
    default?: unknown;
  };
  const defaultShape = moduleShape.default as { jsPDF?: unknown } | undefined;
  const JsPDFConstructor = moduleShape.jsPDF ?? defaultShape?.jsPDF ?? moduleShape.default;

  if (typeof JsPDFConstructor !== "function") {
    throw new Error("jsPDF constructor is unavailable in the server runtime");
  }

  const JsPDFCtor = JsPDFConstructor as new (options: { orientation: string; unit: string; format: string }) => any;

  return new JsPDFCtor({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });
}

export async function generateInvoicePDF(invoiceData: InvoiceData): Promise<Buffer> {
  const doc = createJsPDFDocument();

  // Ensure proper font encoding
  (doc.setFont as any)("helvetica", "normal");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  let yPosition = margin;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(33, 33, 33);
  doc.text("CLINIC INVOICE", margin, yPosition);

  yPosition += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Invoice ID: ${invoiceData.billId}`, margin, yPosition);
  yPosition += 5;
  doc.text(`Date: ${invoiceData.consultationDate.toLocaleDateString()}`, margin, yPosition);

  // Patient Information
  yPosition += 12;
  doc.setFontSize(11);
  doc.setTextColor(33, 33, 33);
  doc.text("Patient Information", margin, yPosition);

  yPosition += 7;
  doc.setFontSize(10);
  doc.setTextColor(66, 66, 66);
  doc.text(`Name: ${invoiceData.patientName}`, margin, yPosition);
  yPosition += 5;
  doc.text(`Patient ID: ${invoiceData.patientId}`, margin, yPosition);
  yPosition += 5;
  doc.text(`Contact: ${invoiceData.patientContact}`, margin, yPosition);

  // Items Table
  yPosition += 12;
  doc.setFontSize(11);
  doc.setTextColor(33, 33, 33);
  doc.text("Services & Items", margin, yPosition);

  yPosition += 8;
  const tableStartY = yPosition;
  const colWidth = contentWidth / 4;

  // Table Header
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPosition, contentWidth, 6, "F");
  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  doc.text("Description", margin + 2, yPosition + 4);
  doc.text("Qty", margin + colWidth + 2, yPosition + 4);
  doc.text("Unit Price", margin + colWidth * 2 + 2, yPosition + 4);
  doc.text("Subtotal", margin + colWidth * 3 + 2, yPosition + 4);

  yPosition += 8;

  // Table Rows
  invoiceData.items.forEach((item) => {
    doc.setTextColor(66, 66, 66);
    doc.text(item.description, margin + 2, yPosition);
    doc.text(item.quantity.toString(), margin + colWidth + 2, yPosition);
    const unitPriceText = `Rs ${item.unitPrice.toFixed(2)}`;
    const subtotalText = `Rs ${item.subtotal.toFixed(2)}`;
    doc.text(unitPriceText, margin + colWidth * 2 + 2, yPosition);
    doc.text(subtotalText, margin + colWidth * 3 + 2, yPosition);
    yPosition += 6;
  });

  // Summary Section
  yPosition += 5;
  const summaryX = margin + contentWidth - 60;

  doc.setFontSize(10);
  doc.setTextColor(66, 66, 66);
  doc.text("Subtotal:", summaryX, yPosition);
  const subtotalText = `Rs ${invoiceData.totalAmount.toFixed(2)}`;
  doc.text(subtotalText, summaryX + 40, yPosition, {
    align: "right",
  });

  yPosition += 6;
  if (invoiceData.discountAmount > 0) {
    doc.text("Discount:", summaryX, yPosition);
    const discountText = `-Rs ${invoiceData.discountAmount.toFixed(2)}`;
    doc.text(discountText, summaryX + 40, yPosition, {
      align: "right",
    });
    yPosition += 6;
  }

  if (invoiceData.taxAmount > 0) {
    doc.text("Tax (GST):", summaryX, yPosition);
    const taxText = `Rs ${invoiceData.taxAmount.toFixed(2)}`;
    doc.text(taxText, summaryX + 40, yPosition, {
      align: "right",
    });
    yPosition += 6;
  }

  // Final Amount
  yPosition += 2;
  doc.setFontSize(12);
  doc.setTextColor(33, 33, 33);
  (doc.setFont as any)(undefined, "bold");
  doc.text("Final Amount:", summaryX, yPosition);
  const finalAmountText = `Rs ${invoiceData.finalAmount.toFixed(2)}`;
  doc.text(finalAmountText, summaryX + 40, yPosition);

  // Payment Status
  yPosition += 10;
  doc.setFontSize(10);
  (doc.setFont as any)(undefined, "normal");
  const statusColor: [number, number, number] =
    invoiceData.paymentStatus === "Paid"
      ? [34, 139, 34]
      : invoiceData.paymentStatus === "Partial"
        ? [255, 165, 0]
        : [220, 20, 60];
  doc.setTextColor(statusColor[0]!, statusColor[1]!, statusColor[2]!);
  doc.text(`Payment Status: ${invoiceData.paymentStatus}`, margin, yPosition);

  // Footer
  yPosition = pageHeight - 15;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("This is a computer-generated invoice. No signature required.", margin, yPosition);
  doc.text(
    `Generated on ${new Date().toLocaleString()}`,
    pageWidth - margin,
    yPosition
  );

  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * Generate and store invoice PDF
 */
export async function generateAndStoreInvoicePDF(
  invoiceData: InvoiceData
): Promise<{ url: string; key: string }> {
  try {
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Store in S3
    const fileKey = `invoices/${invoiceData.billId}.pdf`;
    const { url, key } = await storagePut(fileKey, pdfBuffer, "application/pdf");

    return { url, key };
  } catch (error) {
    console.error("Failed to generate and store invoice:", error);
    throw new Error("Invoice generation failed");
  }
}
