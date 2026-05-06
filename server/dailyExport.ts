import { getDb } from "./db";
import { eq, gte, lte } from "drizzle-orm";
import { patients, consultations, bills, inventory } from "../drizzle/schema";
import { jsPDF } from "jspdf";
import ExcelJS from "exceljs";
import { storagePut } from "./storage";

interface DailyExportData {
  date: string;
  patientsRegistered: number;
  consultationsCompleted: number;
  totalBilling: number;
  patients: any[];
  consultations: any[];
  bills: any[];
  inventory: any[];
}

export async function getDailyData(date: string): Promise<DailyExportData> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startOfDay = new Date(`${date}T00:00:00Z`);
  const endOfDay = new Date(`${date}T23:59:59Z`);

  try {
    // Fetch patients registered today
    const patientsData = await db
      .select()
      .from(patients)
      .where(
        gte(patients.createdAt, startOfDay) && lte(patients.createdAt, endOfDay)
      );

    // Fetch consultations today
    const consultationsData = await db
      .select()
      .from(consultations)
      .where(
        gte(consultations.createdAt, startOfDay) &&
          lte(consultations.createdAt, endOfDay)
      );

    // Fetch bills today
    const billsData = await db
      .select()
      .from(bills)
      .where(gte(bills.createdAt, startOfDay) && lte(bills.createdAt, endOfDay));

    // Calculate total billing
    const totalBilling = billsData.reduce(
      (sum, bill) => sum + (parseFloat(bill.totalAmount) || 0),
      0
    );

    // Fetch current inventory
    const inventoryData = await db.select().from(inventory);

    return {
      date,
      patientsRegistered: patientsData.length,
      consultationsCompleted: consultationsData.length,
      totalBilling,
      patients: patientsData,
      consultations: consultationsData,
      bills: billsData,
      inventory: inventoryData,
    };
  } catch (error) {
    console.error("Error fetching daily data:", error);
    throw error;
  }
}

export async function generatePDFReport(data: DailyExportData): Promise<Buffer> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPosition = 10;

  // Header
  doc.setFontSize(16);
  doc.text("Dr. Deepthi's Ortho Clinic - Daily Report", pageWidth / 2, yPosition, {
    align: "center",
  });
  yPosition += 10;

  doc.setFontSize(10);
  doc.text(`Date: ${data.date}`, 10, yPosition);
  yPosition += 8;

  // Summary Section
  doc.setFontSize(12);
  doc.text("Daily Summary", 10, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.text(`Patients Registered: ${data.patientsRegistered}`, 15, yPosition);
  yPosition += 6;
  doc.text(`Consultations Completed: ${data.consultationsCompleted}`, 15, yPosition);
  yPosition += 6;
  doc.text(`Total Billing: ₹${data.totalBilling.toFixed(2)}`, 15, yPosition);
  yPosition += 10;

  // Patients Table
  if (data.patients.length > 0) {
    doc.setFontSize(11);
    doc.text("Patients Registered Today", 10, yPosition);
    yPosition += 6;

    const patientHeaders = ["Patient ID", "Name", "Contact", "Gender"];
    const patientRows = data.patients.map((p) => [
      p.patientId,
      `${p.firstName} ${p.lastName}`,
      p.contactNumber,
      p.gender || "—",
    ]);

    (doc as any).autoTable({
      head: [patientHeaders],
      body: patientRows,
      startY: yPosition,
      margin: 10,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 128, 128] },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 5;
  }

  // Check if we need a new page
  if (yPosition > pageHeight - 40) {
    doc.addPage();
    yPosition = 10;
  }

  // Billing Table
  if (data.bills.length > 0) {
    doc.setFontSize(11);
    doc.text("Billing Records", 10, yPosition);
    yPosition += 6;

    const billHeaders = ["Bill ID", "Patient ID", "Amount", "Status"];
    const billRows = data.bills.map((b) => [
      b.billId,
      b.patientId,
      `₹${parseFloat(b.totalAmount).toFixed(2)}`,
      b.paymentStatus,
    ]);

    (doc as any).autoTable({
      head: [billHeaders],
      body: billRows,
      startY: yPosition,
      margin: 10,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 128, 128] },
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export async function generateExcelReport(data: DailyExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Summary Sheet
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 30 },
    { header: "Value", key: "value", width: 20 },
  ];
  summarySheet.addRows([
    { metric: "Date", value: data.date },
    { metric: "Patients Registered", value: data.patientsRegistered },
    { metric: "Consultations Completed", value: data.consultationsCompleted },
    { metric: "Total Billing", value: `₹${data.totalBilling.toFixed(2)}` },
  ]);

  // Patients Sheet
  if (data.patients.length > 0) {
    const patientsSheet = workbook.addWorksheet("Patients");
    patientsSheet.columns = [
      { header: "Patient ID", key: "patientId", width: 15 },
      { header: "First Name", key: "firstName", width: 15 },
      { header: "Last Name", key: "lastName", width: 15 },
      { header: "DOB", key: "dateOfBirth", width: 12 },
      { header: "Gender", key: "gender", width: 10 },
      { header: "Contact", key: "contactNumber", width: 15 },
      { header: "Email", key: "email", width: 20 },
    ];
    patientsSheet.addRows(data.patients);
  }

  // Consultations Sheet
  if (data.consultations.length > 0) {
    const consultationsSheet = workbook.addWorksheet("Consultations");
    consultationsSheet.columns = [
      { header: "Consultation ID", key: "consultationId", width: 15 },
      { header: "Patient ID", key: "patientId", width: 15 },
      { header: "Consultant", key: "consultantName", width: 20 },
      { header: "Diagnosis", key: "diagnosis", width: 25 },
      { header: "Date", key: "createdAt", width: 15 },
    ];
    consultationsSheet.addRows(data.consultations);
  }

  // Billing Sheet
  if (data.bills.length > 0) {
    const billsSheet = workbook.addWorksheet("Billing");
    billsSheet.columns = [
      { header: "Bill ID", key: "billId", width: 15 },
      { header: "Patient ID", key: "patientId", width: 15 },
      { header: "Amount", key: "totalAmount", width: 12 },
      { header: "Status", key: "paymentStatus", width: 12 },
      { header: "Date", key: "createdAt", width: 15 },
    ];
    billsSheet.addRows(data.bills);
  }

  // Inventory Sheet
  if (data.inventory.length > 0) {
    const inventorySheet = workbook.addWorksheet("Inventory");
    inventorySheet.columns = [
      { header: "Item ID", key: "itemId", width: 15 },
      { header: "Item Name", key: "itemName", width: 25 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Unit Price", key: "unitPrice", width: 12 },
      { header: "Reorder Level", key: "reorderLevel", width: 12 },
      { header: "Expiry Date", key: "expiryDate", width: 15 },
    ];
    inventorySheet.addRows(data.inventory);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function saveDailyExport(
  date: string,
  pdfBuffer: Buffer,
  excelBuffer: Buffer
): Promise<{ pdfUrl: string; excelUrl: string }> {
  const pdfKey = `exports/daily-report-${date}.pdf`;
  const excelKey = `exports/daily-report-${date}.xlsx`;

  const [pdfResult, excelResult] = await Promise.all([
    storagePut(pdfKey, pdfBuffer, "application/pdf"),
    storagePut(excelKey, excelBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  ]);

  return {
    pdfUrl: pdfResult.url,
    excelUrl: excelResult.url,
  };
}
