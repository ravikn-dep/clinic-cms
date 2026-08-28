import { count, desc, eq, like, lte, inArray, sql, and, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { users, patients, consultations, inventory, bills, billItems, billTemplates, auditLogs, notifications, purchaseOrders, purchaseOrderItems, purchaseOrderHistory, purchaseOrderExtractionReviews, goodsReceipts, goodsReceiptItems, stockMovements, appointments, consultantAvailability, notificationPreferences, rolePermissions, vendors, catalogItems, catalogItemAliases, appointmentBookingLocks, enquiries, externalApiAuditLogs, externalIdempotencyKeys, externalRequestReplays, procurementPostingLocks, encounters, patientIdSequences } from "../drizzle/schema";
import { ENV } from './_core/env';
import bcrypt from 'bcrypt';
import { nanoid } from "nanoid";
import { normalizeIndianMobile } from "./external/validation";
import { normalizeGstNumber, normalizeVendorName, receiptStateForLines, type VendorMasterRecord } from "./procurement";
import { canCheckInAppointment, canStartAppointmentConsultation } from "./visitWorkflow";
import { canCheckInEncounter, canGenerateEncounterOp } from "./paperFirstWorkflow";

const SALT_ROUNDS = 10;
type InsertUser = typeof users.$inferInsert;

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create a pool so a transient serverless/network disconnect does not
// leave the process holding one permanently closed connection.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = mysql.createPool(process.env.DATABASE_URL);
      _db = drizzle(pool as any);
    } catch (error) {
      console.warn("[Database] Failed to initialize pool:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date().toISOString();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date().toISOString();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ PATIENT QUERIES ============

export async function createPatient(patientData: typeof patients.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const now = new Date().toISOString();
  const dataWithTimestamps = {
    ...patientData,
    createdAt: patientData.createdAt || now,
    updatedAt: patientData.updatedAt || now,
  };
  
  await db.insert(patients).values(dataWithTimestamps);
  return dataWithTimestamps;
}

export async function getPatientById(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(patients).where(eq(patients.patientId, patientId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllPatients() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(patients).orderBy(desc(patients.createdAt));
}

export async function reserveDailyPatientSequence(sequenceDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.execute(sql`INSERT INTO patientIdSequences (sequenceDate, nextSequence) VALUES (${sequenceDate}, 2) ON DUPLICATE KEY UPDATE nextSequence = nextSequence + 1`);
  const result = await db.execute(sql`SELECT nextSequence - 1 AS allocatedSequence FROM patientIdSequences WHERE sequenceDate = ${sequenceDate}`);
  const row = (result as any)[0]?.[0] as { allocatedSequence?: number } | undefined;
  if (!row?.allocatedSequence || row.allocatedSequence < 1) throw new Error("Unable to allocate a daily Patient ID");
  return Number(row.allocatedSequence);
}

export async function countPatientsByPatientIdPrefix(patientIdPrefix: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({ value: count() })
    .from(patients)
    .where(like(patients.patientId, `${patientIdPrefix}%`));

  return Number(result[0]?.value ?? 0);
}

export async function searchPatients(query: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const mobile = normalizeIndianMobile(trimmedQuery);
  const searchPattern = `%${trimmedQuery.replace(/[\\%_]/g, "\\$&")}%`;
  const results = await db.select().from(patients).where(or(
    like(patients.patientId, searchPattern),
    like(patients.firstName, searchPattern),
    like(patients.lastName, searchPattern),
    ...(mobile ? [eq(patients.normalizedContactNumber, mobile)] : []),
  )).limit(50);

  const lowerQuery = trimmedQuery.toLocaleLowerCase("en-IN");
	return results.filter((patient) => {
    const fullName = `${patient.firstName} ${patient.lastName}`.toLocaleLowerCase("en-IN");
    return patient.patientId.toLocaleLowerCase("en-IN").includes(lowerQuery)
      || fullName.includes(lowerQuery)
      || (mobile !== null && patient.normalizedContactNumber === mobile);
	});
}

export async function getPatientsByNormalizedContactNumber(normalizedContactNumber: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(patients).where(eq(patients.normalizedContactNumber, normalizedContactNumber)).limit(10);
}

// ============ EXTERNAL INTEGRATION QUERIES ============

export async function createEnquiry(data: typeof enquiries.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(enquiries).values(data);
  return data;
}

export async function linkEnquiryToPatient(enquiryId: string, patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(enquiries).set({ patientId, updatedAt: new Date().toISOString() }).where(eq(enquiries.enquiryId, enquiryId));
}

export async function linkEnquiryToAppointment(enquiryId: string, appointmentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(enquiries).set({ appointmentId, lifecycleStage: "BOOKED", updatedAt: new Date().toISOString() }).where(eq(enquiries.enquiryId, enquiryId));
}

export async function updateEnquiryStageForAppointment(
  appointmentId: string,
  lifecycleStage: typeof enquiries.$inferInsert.lifecycleStage,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(enquiries).set({ lifecycleStage, updatedAt: new Date().toISOString() }).where(eq(enquiries.appointmentId, appointmentId));
}

export async function createExternalApiAuditLog(data: typeof externalApiAuditLogs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(externalApiAuditLogs).values(data);
}

export async function getExternalIdempotencyRecord(operation: string, idempotencyKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(externalIdempotencyKeys).where(and(
    eq(externalIdempotencyKeys.operation, operation),
    eq(externalIdempotencyKeys.idempotencyKey, idempotencyKey),
  )).limit(1);
  return result[0] ?? null;
}

export async function createExternalIdempotencyRecord(data: typeof externalIdempotencyKeys.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(externalIdempotencyKeys).values(data);
  return data;
}

export async function completeExternalIdempotencyRecord(
  operation: string,
  idempotencyKey: string,
  responseStatus: number,
  responseBody: Record<string, unknown>,
  resourceType: string,
  resourceId: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(externalIdempotencyKeys).set({
    responseStatus,
    responseBody,
    resourceType,
    resourceId,
  }).where(and(
    eq(externalIdempotencyKeys.operation, operation),
    eq(externalIdempotencyKeys.idempotencyKey, idempotencyKey),
  ));
}

export async function deleteExternalIdempotencyReservation(operation: string, idempotencyKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(externalIdempotencyKeys).where(and(
    eq(externalIdempotencyKeys.operation, operation),
    eq(externalIdempotencyKeys.idempotencyKey, idempotencyKey),
  ));
}

export async function getActiveConsultants() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select({
    id: users.id,
    userId: users.userId,
    name: users.name,
    department: users.department,
		qualifications: users.qualifications,
		specialization: users.specialization,
    registrationNumber: users.registrationNumber,
  }).from(users).where(and(eq(users.role, "consultant"), eq(users.isActive, 1)));
}

export async function getConsultantProfileById(consultantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(users).where(and(eq(users.id, consultantId), eq(users.role, "consultant"))).limit(1);
  return result[0] ?? null;
}

export async function getActiveConsultantById(consultantId: number) {
  const consultant = await getConsultantProfileById(consultantId);
  return consultant?.isActive ? consultant : null;
}

export async function updateConsultantProfileById(
  consultantId: number,
  updates: Partial<Pick<typeof users.$inferInsert,
    "name" | "email" | "phone" | "department" | "stateCounsilSection" | "registrationNumber" |
    "qualifications" | "specialization" | "designation" | "prescriptionHeaderText" |
    "consultantLogoKey" | "signatureKey" | "consultantLocation" | "isActive"
  >>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set(updates).where(and(eq(users.id, consultantId), eq(users.role, "consultant")));
}

// ============ CONSULTATION QUERIES ============

export async function createConsultation(consultationData: typeof consultations.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(consultations).values(consultationData);
  return consultationData;
}

export async function getConsultationById(consultationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(consultations).where(eq(consultations.consultationId, consultationId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getConsultationsByPatientId(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(consultations).where(eq(consultations.patientId, patientId)).orderBy(desc(consultations.consultationDate));
}

export async function getConsultationsByPatientAndConsultant(patientId: string, consultantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(consultations).where(and(
    eq(consultations.patientId, patientId),
    eq(consultations.consultantId, consultantId),
  )).orderBy(desc(consultations.consultationDate));
}

const CONSULTANT_AVAILABILITY_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function formatAvailabilityTime(value: string): string {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatConsultantAvailability(rows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>): string | null {
  if (!rows.length) return null;
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const day = CONSULTANT_AVAILABILITY_DAYS[row.dayOfWeek] ?? `Day ${row.dayOfWeek}`;
    const range = `${formatAvailabilityTime(row.startTime)}–${formatAvailabilityTime(row.endTime)}`;
    const existing = grouped.get(day) || [];
    existing.push(range);
    grouped.set(day, existing);
  }
  return Array.from(grouped.entries())
    .map(([day, ranges]) => `${day.slice(0, 3)}: ${ranges.join(" & ")}`)
    .join(" · ");
}

export async function getConsultationPrintData(consultationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select({
    consultationId: consultations.consultationId,
    consultationDate: consultations.consultationDate,
    consultantId: consultations.consultantId,
    clinicalHistory: consultations.clinicalHistory,
    presentComplaints: consultations.presentComplaints,
    advisedInvestigations: consultations.advisedInvestigations,
    treatmentPlan: consultations.treatmentPlan,
    patientId: patients.patientId,
    firstName: patients.firstName,
    lastName: patients.lastName,
    age: patients.age,
    gender: patients.gender,
    contactNumber: patients.contactNumber,
    address: patients.address,
    consultantName: users.name,
    qualifications: users.qualifications,
    specialization: users.specialization,
    designation: users.designation,
    registrationCouncil: users.stateCounsilSection,
    registrationNumber: users.registrationNumber,
    prescriptionHeaderText: users.prescriptionHeaderText,
    consultantLogoKey: users.consultantLogoKey,
    signatureKey: users.signatureKey,
    consultantLocation: users.consultantLocation,
  }).from(consultations)
    .innerJoin(patients, eq(consultations.patientId, patients.patientId))
    .leftJoin(users, eq(consultations.consultantId, users.id))
    .where(eq(consultations.consultationId, consultationId))
    .limit(1);
  const printData = result[0];
  if (!printData || !printData.consultantId) return null;
  const availabilityRows = await db.select({
    dayOfWeek: consultantAvailability.dayOfWeek,
    startTime: consultantAvailability.startTime,
    endTime: consultantAvailability.endTime,
  }).from(consultantAvailability).where(and(
    eq(consultantAvailability.consultantId, printData.consultantId),
    eq(consultantAvailability.isActive, 1),
  )).orderBy(consultantAvailability.dayOfWeek, consultantAvailability.startTime);
  return {
    ...printData,
    consultantName: printData.consultantName ?? `Consultant ${printData.consultantId}`,
    consultantTimings: formatConsultantAvailability(availabilityRows),
  };
}

export async function updateConsultation(consultationId: string, updates: Partial<typeof consultations.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(consultations).set(updates).where(eq(consultations.consultationId, consultationId));
}

// ============ PURCHASE ORDERS QUERIES ============

export async function createPurchaseOrder(poData: typeof purchaseOrders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(purchaseOrders).values(poData);
  return poData;
}

export async function getPurchaseOrderById(purchaseOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(purchaseOrders).where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllPurchaseOrders() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
}

/** Receipt state is derived from line quantities and never persisted as a second source of truth. */
export async function getAllPurchaseOrdersWithReceiptState() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [orders, items] = await Promise.all([
    db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt)),
    db.select().from(purchaseOrderItems),
  ]);
  return orders.map((order) => ({
    ...order,
    receiptStatus: receiptStateForLines(items.filter((item) => item.purchaseOrderId === order.purchaseOrderId)),
  }));
}

export async function getPurchaseOrderMetrics() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [metrics] = await db.select({
    totalOrders: sql<number>`count(distinct ${purchaseOrders.purchaseOrderId})`,
    pendingApprovals: sql<number>`coalesce(sum(case when ${purchaseOrders.approvalStatus} = 'Pending Approval' then 1 else 0 end), 0)`,
    orderedUnits: sql<number>`coalesce(sum(${purchaseOrderItems.quantity}), 0)`,
    receivedUnits: sql<number>`coalesce(sum(${purchaseOrderItems.receivedQuantity}), 0)`,
  }).from(purchaseOrders).leftJoin(
    purchaseOrderItems,
    eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.purchaseOrderId),
  );

  const orderedUnits = Number(metrics?.orderedUnits ?? 0);
  const receivedUnits = Number(metrics?.receivedUnits ?? 0);
  return {
    totalOrders: Number(metrics?.totalOrders ?? 0),
    pendingApprovals: Number(metrics?.pendingApprovals ?? 0),
    orderedUnits,
    receivedUnits,
    receiptProgressPercent: orderedUnits > 0 ? Math.min(100, Math.round((receivedUnits / orderedUnits) * 100)) : 0,
  };
}

export async function updatePurchaseOrder(purchaseOrderId: string, updates: Partial<typeof purchaseOrders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(purchaseOrders).set(updates).where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
}

export async function createPurchaseOrderItem(poItemData: typeof purchaseOrderItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(purchaseOrderItems).values(poItemData);
  return poItemData;
}

export async function createPurchaseOrderWithItems(
  poData: typeof purchaseOrders.$inferInsert,
  items: Array<typeof purchaseOrderItems.$inferInsert>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (transaction) => {
    await transaction.insert(purchaseOrders).values(poData);
    if (items.length > 0) {
      await transaction.insert(purchaseOrderItems).values(items);
    }
  });
  return poData;
}

export type ReviewedExtractionPersistence = {
  review: typeof purchaseOrderExtractionReviews.$inferInsert;
  auditLog: typeof auditLogs.$inferInsert;
  history: typeof purchaseOrderHistory.$inferInsert;
};

/**
 * The only Step 4 write boundary: PO, items, immutable review evidence, and
 * their audit/history records commit together or roll back together.
 */
export async function createPurchaseOrderWithItemsAndExtractionReview(
  poData: typeof purchaseOrders.$inferInsert,
  items: Array<typeof purchaseOrderItems.$inferInsert>,
  persistence: ReviewedExtractionPersistence,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (transaction) => {
    await transaction.insert(purchaseOrders).values(poData);
    if (items.length > 0) {
      await transaction.insert(purchaseOrderItems).values(items);
    }
    await transaction.insert(purchaseOrderExtractionReviews).values(persistence.review);
    await transaction.insert(auditLogs).values(persistence.auditLog);
    await transaction.insert(purchaseOrderHistory).values(persistence.history);
  });
  return { purchaseOrder: poData, review: persistence.review };
}

export async function getPurchaseOrderExtractionReview(purchaseOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const records = await db.select()
    .from(purchaseOrderExtractionReviews)
    .where(eq(purchaseOrderExtractionReviews.purchaseOrderId, purchaseOrderId))
    .limit(1);
  return records[0] ?? null;
}

export async function getPurchaseOrderExtractionReviewBySubmissionId(reviewSubmissionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const records = await db.select()
    .from(purchaseOrderExtractionReviews)
    .where(eq(purchaseOrderExtractionReviews.reviewSubmissionId, reviewSubmissionId))
    .limit(1);
  return records[0] ?? null;
}

export async function getPurchaseOrderItems(purchaseOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
}

export async function createPurchaseOrderHistory(entry: typeof purchaseOrderHistory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(purchaseOrderHistory).values(entry);
  return entry;
}

export async function getPurchaseOrderHistory(purchaseOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(purchaseOrderHistory)
    .where(eq(purchaseOrderHistory.purchaseOrderId, purchaseOrderId))
    .orderBy(desc(purchaseOrderHistory.createdAt));
}

export async function getPurchaseOrderReceiptSummary(purchaseOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
  return items.map((item) => ({
    ...item,
    orderedQuantity: Number(item.quantity ?? 0),
    receivedQuantity: Number(item.receivedQuantity ?? 0),
    remainingQuantity: Math.max(0, Number(item.quantity ?? 0) - Number(item.receivedQuantity ?? 0)),
  }));
}

export type GoodsReceiptLineInput = {
	poItemId: string;
	receivedQuantity: number;
	batchNumber: string;
	expiryDate: string;
	unitCost?: string;
};

async function lockPurchaseOrderForReceiptPosting(transaction: any, purchaseOrderId: string) {
	await transaction.execute(sql`
		INSERT INTO ${procurementPostingLocks} (${procurementPostingLocks.purchaseOrderId})
		VALUES (${purchaseOrderId})
		ON DUPLICATE KEY UPDATE ${procurementPostingLocks.updatedAt} = NOW()
	`);
}

export async function createGoodsReceipt(input: {
	goodsReceiptId: string;
	purchaseOrderId: string;
	receivedBy: string;
	receivedByName?: string | null;
	lines: GoodsReceiptLineInput[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

	return db.transaction(async (transaction) => {
		await lockPurchaseOrderForReceiptPosting(transaction, input.purchaseOrderId);
		const existingReceipt = await transaction.select()
      .from(goodsReceipts)
      .where(eq(goodsReceipts.goodsReceiptId, input.goodsReceiptId))
      .limit(1);
    if (existingReceipt.length > 0) {
      throw new Error("Goods receipt ID has already been posted");
    }

    const poRows = await transaction.select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.purchaseOrderId, input.purchaseOrderId))
      .limit(1);
    const po = poRows[0];
    if (!po) throw new Error("Purchase Order not found");
    if (po.approvalStatus !== "Approved") {
      throw new Error("Goods can only be received against an approved purchase order");
    }
    if (input.lines.length === 0) throw new Error("At least one goods receipt line is required");

    const poItems = await transaction.select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, input.purchaseOrderId));
    const poItemById = new Map(poItems.map((item) => [item.poItemId, item]));
    const seenItems = new Set<string>();

    await transaction.insert(goodsReceipts).values({
      goodsReceiptId: input.goodsReceiptId,
      purchaseOrderId: input.purchaseOrderId,
      receivedBy: input.receivedBy,
      status: "Posted",
    });

		const postedLines: Array<{
			goodsReceiptItemId: string;
			poItemId: string;
			catalogItemId: string;
			itemName: string;
      receivedQuantity: number;
      batchNumber: string;
      expiryDate: string;
      resultingQuantity: number;
    }> = [];

    for (const line of input.lines) {
      if (seenItems.has(line.poItemId)) {
        throw new Error(`Duplicate receipt line for PO item ${line.poItemId}`);
      }
      seenItems.add(line.poItemId);

		const poItem = poItemById.get(line.poItemId);
		if (!poItem) throw new Error(`PO item ${line.poItemId} does not belong to this purchase order`);
		if (!poItem.catalogItemId) {
			throw new Error(`A governed catalog identity is required before receiving ${poItem.itemName}`);
		}
		const orderedQuantity = Number(poItem.quantity ?? 0);
      const previouslyReceived = Number(poItem.receivedQuantity ?? 0);
      if (!Number.isInteger(line.receivedQuantity) || line.receivedQuantity <= 0) {
        throw new Error("Received quantity must be a positive whole number");
      }
      if (previouslyReceived + line.receivedQuantity > orderedQuantity) {
        throw new Error(`Receipt quantity exceeds the remaining quantity for ${poItem.itemName}`);
      }
      if (!line.batchNumber.trim()) throw new Error(`Batch number is required for ${poItem.itemName}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(line.expiryDate)) {
        throw new Error(`Expiry date must use YYYY-MM-DD for ${poItem.itemName}`);
      }
      const expiry = new Date(`${line.expiryDate}T00:00:00.000Z`);
      if (Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== line.expiryDate) {
        throw new Error(`Expiry date is invalid for ${poItem.itemName}`);
      }

		const matchingInventory = await transaction.select()
			.from(inventory)
			.where(and(
				eq(inventory.catalogItemId, poItem.catalogItemId),
				eq(inventory.batchNumber, line.batchNumber.trim()),
				eq(inventory.expiryDate, line.expiryDate),
			))
			.limit(1);
		const currentInventory = matchingInventory[0];
		if (!currentInventory) {
			const legacyInventory = await transaction.select()
				.from(inventory)
				.where(and(
					eq(inventory.itemName, poItem.itemName),
					eq(inventory.batchNumber, line.batchNumber.trim()),
					eq(inventory.expiryDate, line.expiryDate),
				))
				.limit(1);
			if (legacyInventory[0]) {
				throw new Error(`Existing batch stock for ${poItem.itemName} requires explicit catalog reconciliation before posting`);
			}
		}
		const previousQuantity = Number(currentInventory?.quantityAvailable ?? 0);
      const resultingQuantity = previousQuantity + line.receivedQuantity;
      const inventoryItemId = currentInventory?.itemId ?? nanoid(20);
      const unitPrice = line.unitCost ?? String(poItem.unitPrice ?? "0");

      if (currentInventory) {
        await transaction.update(inventory)
          .set({
            quantityAvailable: resultingQuantity,
            unitPrice: unitPrice as any,
            sourcePurchaseOrderId: input.purchaseOrderId,
            sourceGoodsReceiptId: input.goodsReceiptId,
            lastRestocked: new Date().toISOString(),
          })
          .where(eq(inventory.itemId, currentInventory.itemId));
      } else {
		await transaction.insert(inventory).values({
			itemId: inventoryItemId,
			itemName: poItem.itemName,
			catalogItemId: poItem.catalogItemId,
			batchNumber: line.batchNumber.trim(),
          expiryDate: line.expiryDate,
          quantityAvailable: line.receivedQuantity,
          unitPrice: unitPrice as any,
          reorderLevel: 10,
          sourcePurchaseOrderId: input.purchaseOrderId,
          sourceGoodsReceiptId: input.goodsReceiptId,
          lastRestocked: new Date().toISOString(),
        });
      }

      const goodsReceiptItemId = nanoid(20);
      await transaction.insert(goodsReceiptItems).values({
        goodsReceiptItemId,
        goodsReceiptId: input.goodsReceiptId,
        purchaseOrderId: input.purchaseOrderId,
        poItemId: line.poItemId,
        itemName: poItem.itemName,
        receivedQuantity: line.receivedQuantity,
        batchNumber: line.batchNumber.trim(),
        expiryDate: line.expiryDate,
        unitCost: unitPrice as any,
      });

      await transaction.update(purchaseOrderItems)
        .set({ receivedQuantity: previouslyReceived + line.receivedQuantity })
        .where(eq(purchaseOrderItems.poItemId, line.poItemId));

		await transaction.insert(stockMovements).values({
        movementId: nanoid(20),
        goodsReceiptId: input.goodsReceiptId,
        goodsReceiptItemId,
        purchaseOrderId: input.purchaseOrderId,
			inventoryItemId,
			catalogItemId: poItem.catalogItemId,
			itemName: poItem.itemName,
        batchNumber: line.batchNumber.trim(),
        quantityAdded: line.receivedQuantity,
        previousQuantity,
        resultingQuantity,
        actorId: input.receivedBy,
      });

		postedLines.push({
			goodsReceiptItemId,
			poItemId: line.poItemId,
			catalogItemId: poItem.catalogItemId,
			itemName: poItem.itemName,
        receivedQuantity: line.receivedQuantity,
        batchNumber: line.batchNumber.trim(),
        expiryDate: line.expiryDate,
        resultingQuantity,
      });
    }

	await transaction.insert(purchaseOrderHistory).values({
		historyId: nanoid(20),
		purchaseOrderId: input.purchaseOrderId,
		eventType: "GOODS_RECEIPT_POSTED",
		actorId: input.receivedBy,
		actorName: input.receivedByName ?? null,
		eventSummary: `Goods receipt ${input.goodsReceiptId} posted for ${postedLines.length} item(s).`,
		details: JSON.stringify({ goodsReceiptId: input.goodsReceiptId, lineCount: postedLines.length }),
	});

    await transaction.insert(auditLogs).values({
      logId: nanoid(20),
      userId: input.receivedBy,
		actionType: "GOODS_RECEIPT_POSTED",
      tableName: "goodsReceipts",
      recordId: input.goodsReceiptId,
		newValue: JSON.stringify({ purchaseOrderId: input.purchaseOrderId, goodsReceiptId: input.goodsReceiptId, lineCount: postedLines.length, actorId: input.receivedBy }),
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      goodsReceiptId: input.goodsReceiptId,
      purchaseOrderId: input.purchaseOrderId,
      lines: postedLines,
    };
  });
}

export async function getGoodsReceiptsByPurchaseOrderId(purchaseOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const receipts = await db.select().from(goodsReceipts).where(eq(goodsReceipts.purchaseOrderId, purchaseOrderId));
  const lines = await db.select().from(goodsReceiptItems).where(eq(goodsReceiptItems.purchaseOrderId, purchaseOrderId));
  return receipts.map((receipt) => ({
    ...receipt,
    lines: lines.filter((line) => line.goodsReceiptId === receipt.goodsReceiptId),
  }));
}

export async function updateBillConsultationNotes(billId: string, consultationNotes: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bills).set({ consultationNotes }).where(eq(bills.billId, billId));
}

export async function updateBillReceipt(billId: string, receiptPdfUrl: string | null, receiptPdfKey: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bills).set({ receiptPdfUrl, receiptPdfKey }).where(eq(bills.billId, billId));
}

export async function updateReceiptDelivery(billId: string, status: "Not Sent" | "Sent" | "Failed" | "Pending", method?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bills).set({
    receiptDeliveryStatus: status,
    receiptDeliveryMethod: method,
    receiptDeliveryTimestamp: status === "Sent" ? new Date().toISOString() : undefined,
  }).where(eq(bills.billId, billId));
}

export async function approvePurchaseOrder(poId: string, approvedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(purchaseOrders).set({
    approvalStatus: "Approved",
    approvedBy,
    approvalTimestamp: new Date().toISOString(),
  }).where(eq(purchaseOrders.purchaseOrderId, poId));
}

export async function rejectPurchaseOrder(poId: string, rejectionReason: string, approvedBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(purchaseOrders).set({
    approvalStatus: "Rejected",
    rejectionReason,
    approvedBy,
    approvalTimestamp: new Date().toISOString(),
	}).where(eq(purchaseOrders.purchaseOrderId, poId));
}

export type PurchaseOrderLifecycleActor = { actorId: string; actorName?: string | null };

export async function approvePurchaseOrderWithAudit(purchaseOrderId: string, actor: PurchaseOrderLifecycleActor) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const approvedAt = new Date().toISOString();
	return db.transaction(async (transaction) => {
		await lockPurchaseOrderForReceiptPosting(transaction, purchaseOrderId);
		const rows = await transaction.select().from(purchaseOrders).where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId)).limit(1);
		const po = rows[0];
		if (!po) throw new Error("Purchase Order not found");
		if (po.approvalStatus !== "Pending Approval") throw new Error(`Cannot approve a PO with status: ${po.approvalStatus}`);

		await transaction.update(purchaseOrders).set({
			approvalStatus: "Approved",
			approvedBy: actor.actorName || actor.actorId,
			approvalTimestamp: approvedAt,
		}).where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
		await transaction.insert(auditLogs).values({
			logId: nanoid(20), userId: actor.actorId, actionType: "PURCHASE_ORDER_APPROVED", tableName: "purchaseOrders", recordId: purchaseOrderId,
			oldValue: JSON.stringify({ approvalStatus: "Pending Approval" }),
			newValue: JSON.stringify({ approvalStatus: "Approved", approvedAt }), timestamp: approvedAt,
		});
		await transaction.insert(purchaseOrderHistory).values({
			historyId: nanoid(20), purchaseOrderId, eventType: "APPROVED", actorId: actor.actorId, actorName: actor.actorName ?? null,
			eventSummary: "Purchase order approved.", details: JSON.stringify({ previousStatus: "Pending Approval", approvalStatus: "Approved" }), createdAt: approvedAt,
		});
		return po;
	});
}

export async function rejectPurchaseOrderWithAudit(purchaseOrderId: string, rejectionReason: string, actor: PurchaseOrderLifecycleActor) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const rejectedAt = new Date().toISOString();
	return db.transaction(async (transaction) => {
		await lockPurchaseOrderForReceiptPosting(transaction, purchaseOrderId);
		const rows = await transaction.select().from(purchaseOrders).where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId)).limit(1);
		const po = rows[0];
		if (!po) throw new Error("Purchase Order not found");
		if (po.approvalStatus !== "Pending Approval") throw new Error(`Cannot reject a PO with status: ${po.approvalStatus}`);

		await transaction.update(purchaseOrders).set({
			approvalStatus: "Rejected", rejectionReason, approvedBy: actor.actorName || actor.actorId, approvalTimestamp: rejectedAt,
		}).where(eq(purchaseOrders.purchaseOrderId, purchaseOrderId));
		await transaction.insert(auditLogs).values({
			logId: nanoid(20), userId: actor.actorId, actionType: "PURCHASE_ORDER_REJECTED", tableName: "purchaseOrders", recordId: purchaseOrderId,
			oldValue: JSON.stringify({ approvalStatus: "Pending Approval" }),
			newValue: JSON.stringify({ approvalStatus: "Rejected", rejectionReason, rejectedAt }), timestamp: rejectedAt,
		});
		await transaction.insert(purchaseOrderHistory).values({
			historyId: nanoid(20), purchaseOrderId, eventType: "REJECTED", actorId: actor.actorId, actorName: actor.actorName ?? null,
			eventSummary: "Purchase order rejected.", details: JSON.stringify({ previousStatus: "Pending Approval", approvalStatus: "Rejected", rejectionReason }), createdAt: rejectedAt,
		});
		return po;
	});
}

// ============ INVENTORY QUERIES ============

export async function createInventoryItem(itemData: typeof inventory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(inventory).values(itemData);
  return itemData;
}

export async function getInventoryItemById(itemId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(inventory).where(eq(inventory.itemId, itemId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllInventoryItems() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(inventory).orderBy(desc(inventory.createdAt));
}

export async function getLowStockItems() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(inventory).where(lte(inventory.quantityAvailable, inventory.reorderLevel));
}

export async function getInventoryByName(itemName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(inventory).where(eq(inventory.itemName, itemName)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// ============ CURATED CATALOG QUERIES ============
// Inventory is batch-centric; these helpers intentionally read only the
// separately curated catalog identity and alias records used for suggestions.
export async function getActiveCatalogItems() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(catalogItems).where(eq(catalogItems.active, 1));
}

export async function getActiveCatalogItemAliases() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(catalogItemAliases).where(eq(catalogItemAliases.active, 1));
}

type CatalogItemAdminInput = Omit<typeof catalogItems.$inferInsert, "catalogItemId" | "normalizedName" | "active" | "createdAt" | "updatedAt">;
type CatalogItemAdminUpdate = Partial<Omit<CatalogItemAdminInput, "canonicalName">> & {
  canonicalName?: string;
  normalizedName?: string;
};
type CatalogAliasAdminInput = Omit<typeof catalogItemAliases.$inferInsert, "aliasId" | "normalizedAlias" | "active" | "createdAt">;
type CatalogAuditEntry = typeof auditLogs.$inferInsert;

/**
 * Admin-facing catalog queries remain separate from the matching read path.
 * The matcher deliberately continues to read only active records through the
 * two helpers above.
 */
export async function listCatalogItemsForAdmin(options: { query?: string; includeInactive?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const query = options.query?.trim();
  const conditions = [
    options.includeInactive ? undefined : eq(catalogItems.active, 1),
    query
      ? or(
        like(catalogItems.canonicalName, `%${query}%`),
        like(catalogItems.genericName, `%${query}%`),
        like(catalogItems.brandName, `%${query}%`),
        like(catalogItems.manufacturer, `%${query}%`),
      )
      : undefined,
  ].filter(Boolean);
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions as any);

  return where
    ? db.select().from(catalogItems).where(where as any).orderBy(desc(catalogItems.updatedAt), catalogItems.canonicalName)
    : db.select().from(catalogItems).orderBy(desc(catalogItems.updatedAt), catalogItems.canonicalName);
}

export async function getCatalogItemById(catalogItemId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(catalogItems).where(eq(catalogItems.catalogItemId, catalogItemId)).limit(1);
  return result[0] ?? null;
}

export async function getCatalogItemByNormalizedName(normalizedName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(catalogItems).where(eq(catalogItems.normalizedName, normalizedName)).limit(1);
  return result[0] ?? null;
}

export async function listCatalogAliasesForAdmin(catalogItemId: string, includeInactive = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const condition = includeInactive
    ? eq(catalogItemAliases.catalogItemId, catalogItemId)
    : and(eq(catalogItemAliases.catalogItemId, catalogItemId), eq(catalogItemAliases.active, 1));

  return db
    .select({
      aliasId: catalogItemAliases.aliasId,
      catalogItemId: catalogItemAliases.catalogItemId,
      vendorId: catalogItemAliases.vendorId,
      aliasText: catalogItemAliases.aliasText,
      normalizedAlias: catalogItemAliases.normalizedAlias,
      source: catalogItemAliases.source,
      active: catalogItemAliases.active,
      createdBy: catalogItemAliases.createdBy,
      createdAt: catalogItemAliases.createdAt,
      vendorName: vendors.name,
    })
    .from(catalogItemAliases)
    .leftJoin(vendors, eq(catalogItemAliases.vendorId, vendors.vendorId))
    .where(condition)
    .orderBy(desc(catalogItemAliases.createdAt));
}

export async function getCatalogAliasByVendorAndNormalizedAlias(vendorId: string, normalizedAlias: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(catalogItemAliases)
    .where(and(eq(catalogItemAliases.vendorId, vendorId), eq(catalogItemAliases.normalizedAlias, normalizedAlias)))
    .limit(1);
  return result[0] ?? null;
}

export async function getCatalogAliasById(aliasId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(catalogItemAliases).where(eq(catalogItemAliases.aliasId, aliasId)).limit(1);
  return result[0] ?? null;
}

export async function createCatalogItemWithAudit(
  catalogItem: CatalogItemAdminInput & { catalogItemId: string; normalizedName: string },
  audit: CatalogAuditEntry,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async (transaction) => {
    await transaction.insert(catalogItems).values(catalogItem as any);
    await transaction.insert(auditLogs).values(audit);
  });
  return catalogItem;
}

export async function updateCatalogItemWithAudit(catalogItemId: string, updates: CatalogItemAdminUpdate, audit: CatalogAuditEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async (transaction) => {
    await transaction.update(catalogItems).set(updates as any).where(eq(catalogItems.catalogItemId, catalogItemId));
    await transaction.insert(auditLogs).values(audit);
  });
}

export async function setCatalogItemActiveWithAudit(catalogItemId: string, active: boolean, audit: CatalogAuditEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async (transaction) => {
    await transaction.update(catalogItems).set({ active: active ? 1 : 0 }).where(eq(catalogItems.catalogItemId, catalogItemId));
    await transaction.insert(auditLogs).values(audit);
  });
}

export async function createCatalogAliasWithAudit(
  alias: CatalogAliasAdminInput & { aliasId: string; normalizedAlias: string },
  audit: CatalogAuditEntry,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async (transaction) => {
    await transaction.insert(catalogItemAliases).values(alias as any);
    await transaction.insert(auditLogs).values(audit);
  });
  return alias;
}

export async function setCatalogAliasActiveWithAudit(aliasId: string, active: boolean, audit: CatalogAuditEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.transaction(async (transaction) => {
    await transaction.update(catalogItemAliases).set({ active: active ? 1 : 0 }).where(eq(catalogItemAliases.aliasId, aliasId));
    await transaction.insert(auditLogs).values(audit);
  });
}

export async function updateInventoryItem(itemId: string, updates: Partial<typeof inventory.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(inventory).set(updates).where(eq(inventory.itemId, itemId));
}

// ============ BILLING QUERIES ============

export async function createBill(billData: typeof bills.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(bills).values(billData);
  return billData;
}

export async function getBillById(billId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(bills).where(eq(bills.billId, billId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getBillsByPatientId(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(bills).where(eq(bills.patientId, patientId)).orderBy(desc(bills.createdAt));
}

export async function getAllBills() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(bills).orderBy(desc(bills.createdAt));
}

export async function updateBill(billId: string, updates: Partial<typeof bills.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(bills).set(updates).where(eq(bills.billId, billId));
}

// ============ BILL ITEMS QUERIES ============

export async function createBillItem(itemData: typeof billItems.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(billItems).values(itemData);
  return itemData;
}

export async function getBillItemsByBillId(billId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(billItems).where(eq(billItems.billId, billId));
}

// ============ AUDIT LOG QUERIES ============

export async function createAuditLog(logData: typeof auditLogs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(auditLogs).values(logData);
  return logData;
}

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(limit);
}

// ============ NOTIFICATION QUERIES ============

export async function createNotification(notificationData: typeof notifications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(notifications).values(notificationData);
  return notificationData;
}

export async function getNotificationsByUserId(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
}

export async function markNotificationAsRead(notificationId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(notifications).set({ isRead: 1 }).where(eq(notifications.notificationId, notificationId));
}


// ============ RBAC QUERIES ============

export async function createStaffUser(userData: typeof users.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(users).values(userData);
  return userData;
}

export async function getAllStaffUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(users).where(inArray(users.role, ["consultant", "staff"])).orderBy(desc(users.createdAt));
}

export async function getUserReferenceSummary(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const actor = String(userId);
  const [rows] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM appointments WHERE consultantId = ${userId} OR checkedInBy = ${actor}) AS appointments,
      (SELECT COUNT(*) FROM consultations WHERE consultantId = ${userId}) AS consultations,
      (SELECT COUNT(*) FROM consultantAvailability WHERE consultantId = ${userId}) AS availability,
      (SELECT COUNT(*) FROM notifications WHERE userId = ${userId}) AS notifications,
      (SELECT COUNT(*) FROM auditLogs WHERE userId = ${actor}) AS auditLogs,
      (SELECT COUNT(*) FROM purchaseOrders WHERE approvedBy = ${actor}) AS purchaseOrders,
      (SELECT COUNT(*) FROM goodsReceipts WHERE receivedBy = ${actor}) AS goodsReceipts,
      (SELECT COUNT(*) FROM stockMovements WHERE actorId = ${actor}) AS stockMovements,
      (SELECT COUNT(*) FROM purchaseOrderHistory WHERE actorId = ${actor}) AS purchaseOrderHistory,
      (SELECT COUNT(*) FROM vendors WHERE createdBy = ${userId}) AS vendors,
      (SELECT COUNT(*) FROM billTemplates WHERE createdBy = ${userId}) AS billTemplates,
      (SELECT COUNT(*) FROM users WHERE createdBy = ${userId} AND id <> ${userId}) AS childUsers
  `);
  const row = (rows as unknown as any[])[0] || {};
  const counts = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));
  return { ...counts, total: Object.values(counts).reduce((sum, value) => sum + Number(value), 0) };
}

export async function getActiveAdminCount() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(users).where(and(eq(users.role, "admin"), eq(users.isActive, 1)));
  return Number(result[0]?.count || 0);
}

export async function getStaffUserById(userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getStaffUserByUsername(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateStaffUser(userId: string, updates: Partial<typeof users.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set(updates).where(eq(users.userId, userId));
}

export async function deleteStaffUser(userId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(users).where(eq(users.userId, userId));
}

export async function getNextUserSequence(role: "consultant" | "staff"): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select({ maxId: sql<string>`MAX(userId)` }).from(users).where(eq(users.role, role));
  
  if (!result[0]?.maxId) return 1;
  
  const lastId = result[0].maxId as string;
  const match = lastId.match(/\d+$/);
  if (!match) return 1;
  
  return parseInt(match[0]) + 1;
}

// ============ ROLE PERMISSIONS QUERIES ============

export async function getRolePermissions(role: "admin" | "consultant" | "staff") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
}

export async function getRolePermissionByFeature(role: "admin" | "consultant" | "staff", featureKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .select()
    .from(rolePermissions)
    .where(and(eq(rolePermissions.role, role), eq(rolePermissions.featureKey, featureKey)))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

export async function updateRolePermission(role: "admin" | "consultant" | "staff", featureKey: string, isEnabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if permission exists
  const existing = await getRolePermissionByFeature(role, featureKey);
  
  if (existing) {
    // Update existing
    await db
      .update(rolePermissions)
      .set({ isEnabled: isEnabled ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(eq(rolePermissions.permissionId, existing.permissionId));
  } else {
    // Create new
    const permissionId = `${role}-${featureKey}-${Date.now()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role,
      featureKey,
      isEnabled: isEnabled ? 1 : 0,
    });
  }
}



// ============ FEATURE ACCESS CONTROL (Database-persisted) ============

export async function getFeaturePermissions(role: "consultant" | "staff" | "admin"): Promise<Record<string, boolean>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const perms = await db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
  
  const result: Record<string, boolean> = {};
  for (const perm of perms as any[]) {
    // Convert tinyint (0/1) to boolean
    result[perm.featureKey] = Boolean(perm.isEnabled);
  }
  
  return result;
}

export async function setFeaturePermission(role: "consultant" | "staff", featureKey: string, isEnabled: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const permissionId = `PERM-${Date.now()}`;
  
  const existing = await db.select().from(rolePermissions).where(
    and(
      eq(rolePermissions.role, role),
      eq(rolePermissions.featureKey, featureKey)
    )
  );

  if (existing.length > 0) {
    await db.update(rolePermissions)
      .set({ isEnabled: isEnabled ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(rolePermissions.role, role),
          eq(rolePermissions.featureKey, featureKey)
        )
      );
  } else {
    await db.insert(rolePermissions).values({
      permissionId,
      role,
      featureKey,
      isEnabled: isEnabled ? 1 : 0,
    } as any);
  }
}

export async function setFeaturePermissions(role: "consultant" | "staff", permissions: Record<string, boolean>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (transaction) => {
    await transaction.delete(rolePermissions).where(eq(rolePermissions.role, role));

    for (const [featureKey, isEnabled] of Object.entries(permissions)) {
      const permissionId = `PERM-${nanoid(20)}`;
      await transaction.insert(rolePermissions).values({
        permissionId,
        role,
        featureKey,
        isEnabled: isEnabled ? 1 : 0,
      } as any);
    }
  });
}

export async function checkFeatureAccess(role: "admin" | "consultant" | "staff", featureKey: string): Promise<boolean> {
  if (role === "admin") return true;
  
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const perm = await db.select().from(rolePermissions).where(
    and(
      eq(rolePermissions.role, role),
      eq(rolePermissions.featureKey, featureKey)
    )
  );

  return perm.length > 0 ? (perm[0] as any).isEnabled === 1 : false;
}

export async function initializeDefaultPermissions(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(rolePermissions);
  if (existing.length > 0) return;

  const consultantFeatures = ["patient_records", "ambient_scribe", "billing", "notifications"];
  const staffFeatures = ["patient_records", "pharmacy", "purchase_orders", "notifications"];

  for (const feature of consultantFeatures) {
    const permissionId = `PERM-${Date.now()}-${Math.random()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role: "consultant",
      featureKey: feature,
      isEnabled: 1,
    } as any);
  }

  for (const feature of staffFeatures) {
    const permissionId = `PERM-${Date.now()}-${Math.random()}`;
    await db.insert(rolePermissions).values({
      permissionId,
      role: "staff",
      featureKey: feature,
      isEnabled: 1,
    } as any);
  }
}


// ============ OP FORM TEMPLATE CUSTOMIZATION ============

interface OPFormTemplate {
  clinicName: string;
  clinicSubtitle?: string;
  headerFields: Array<{
    id: string;
    label: string;
    fieldType: "text" | "date" | "dropdown" | "checkbox" | "textarea";
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  blankAreaHeight: number;
  footerText?: string;
  showQRCode: boolean;
  showBarcode: boolean;
}

const DEFAULT_OP_FORM_TEMPLATE: OPFormTemplate = {
  clinicName: "Clinic OP Form",
  clinicSubtitle: "",
  headerFields: [
    { id: "name", label: "Name", fieldType: "text", required: true },
    { id: "dob", label: "Age/DOB", fieldType: "date", required: true },
    { id: "contact", label: "Contact", fieldType: "text", required: true },
    { id: "gender", label: "Gender", fieldType: "dropdown", required: true, options: ["Male", "Female", "Other"] },
    { id: "consultant", label: "Consultant", fieldType: "text", required: false },
    { id: "datetime", label: "Date/Time", fieldType: "text", required: false },
  ],
  blankAreaHeight: 200,
  footerText: "",
  showQRCode: true,
  showBarcode: true,
};

let opFormTemplateStore: OPFormTemplate = { ...DEFAULT_OP_FORM_TEMPLATE };

export async function getOPFormTemplate(): Promise<OPFormTemplate> {
  return { ...opFormTemplateStore };
}

export async function setOPFormTemplate(template: OPFormTemplate): Promise<void> {
  opFormTemplateStore = { ...template };
}

export async function resetOPFormTemplate(): Promise<void> {
  opFormTemplateStore = { ...DEFAULT_OP_FORM_TEMPLATE };
}


// ============ APPOINTMENT SCHEDULING ============

export async function createAppointment(data: {
  patientId: string;
  consultantId: number;
  appointmentDate: string;
  appointmentTime: string;
  duration?: number;
  notes?: string;
  notificationMethod?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const appointmentId = `APT-${nanoid(16).toUpperCase()}`;
  
  await db.insert(appointments).values({
    appointmentId,
    patientId: data.patientId,
    consultantId: data.consultantId,
    appointmentDate: data.appointmentDate,
    appointmentTime: data.appointmentTime,
    duration: data.duration ?? 30,
    notes: data.notes,
    notificationMethod: data.notificationMethod ?? "SMS",
    status: "Scheduled",
  });

  return appointmentId;
}

const ACTIVE_APPOINTMENT_STATUSES = ["Scheduled", "Rescheduled"] as const;

function rowsHaveAppointmentConflict(
  rows: Array<{ appointmentTime: string; duration: number | null; appointmentId: string }>,
  time: string,
  duration: number,
  excludedAppointmentId?: string,
) {
  const [hours, minutes] = time.split(":").map(Number);
  const appointmentStart = hours * 60 + minutes;
  const appointmentEnd = appointmentStart + duration;

  return rows.some((appointment) => {
    if (appointment.appointmentId === excludedAppointmentId) return false;
    const [appointmentHours, appointmentMinutes] = appointment.appointmentTime.split(":").map(Number);
    const existingStart = appointmentHours * 60 + appointmentMinutes;
    const existingEnd = existingStart + (appointment.duration ?? 30);
    return appointmentStart < existingEnd && appointmentEnd > existingStart;
  });
}

async function lockConsultantDate(transaction: any, consultantId: number, appointmentDate: string) {
  await transaction.execute(sql`
    INSERT INTO ${appointmentBookingLocks} (${appointmentBookingLocks.consultantId}, ${appointmentBookingLocks.appointmentDate})
    VALUES (${consultantId}, ${appointmentDate})
    ON DUPLICATE KEY UPDATE ${appointmentBookingLocks.updatedAt} = NOW()
  `);
}

async function getActiveAppointmentsForDate(transaction: any, consultantId: number, appointmentDate: string) {
  return transaction.select().from(appointments).where(and(
    eq(appointments.consultantId, consultantId),
    eq(appointments.appointmentDate, appointmentDate),
    inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
  ));
}

export async function createAppointmentSafely(data: {
  patientId: string;
  consultantId: number;
  appointmentDate: string;
  appointmentTime: string;
  duration?: number;
  notes?: string;
  notificationMethod?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const duration = data.duration ?? 30;
  const appointmentId = `APT-${nanoid(16).toUpperCase()}`;

  await db.transaction(async (transaction) => {
    await lockConsultantDate(transaction, data.consultantId, data.appointmentDate);
    const existingAppointments = await getActiveAppointmentsForDate(
      transaction,
      data.consultantId,
      data.appointmentDate,
    );

    if (rowsHaveAppointmentConflict(existingAppointments, data.appointmentTime, duration)) {
      throw new Error("Time slot already booked");
    }

    await transaction.insert(appointments).values({
      appointmentId,
      patientId: data.patientId,
      consultantId: data.consultantId,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime,
      duration,
      notes: data.notes,
      notificationMethod: data.notificationMethod ?? "SMS",
      status: "Scheduled",
    });
  });

	return appointmentId;
}

export async function createVisitAppointmentWithAudit(data: {
	patientId: string;
	consultantId: number;
	appointmentDate: string;
	appointmentTime: string;
	appointmentSource: "MANUAL" | "WALK_IN" | "PHONE";
	notes?: string;
	actorId: string;
}) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const appointmentId = `APT-${nanoid(16).toUpperCase()}`;
	await db.transaction(async (transaction) => {
		await lockConsultantDate(transaction, data.consultantId, data.appointmentDate);
		const existingAppointments = await getActiveAppointmentsForDate(transaction, data.consultantId, data.appointmentDate);
		if (rowsHaveAppointmentConflict(existingAppointments, data.appointmentTime, 30)) throw new Error("Time slot already booked");
		await transaction.insert(appointments).values({
			appointmentId, patientId: data.patientId, consultantId: data.consultantId,
			appointmentDate: data.appointmentDate, appointmentTime: data.appointmentTime,
			duration: 30, notes: data.notes, appointmentSource: data.appointmentSource,
			notificationMethod: "SMS", status: "Scheduled",
		});
		await transaction.insert(auditLogs).values({
			logId: nanoid(20), userId: data.actorId, actionType: "APPOINTMENT_CREATED", tableName: "appointments", recordId: appointmentId,
			newValue: JSON.stringify({ patientId: data.patientId, consultantId: data.consultantId, appointmentSource: data.appointmentSource }), timestamp: new Date().toISOString(),
		});
	});
	return appointmentId;
}

export async function checkInAppointmentWithAudit(appointmentId: string, actorId: string) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	return db.transaction(async (transaction) => {
		const appointment = (await transaction.select().from(appointments).where(eq(appointments.appointmentId, appointmentId)).limit(1))[0];
		if (!appointment) throw new Error("Appointment not found");
		if (!canCheckInAppointment(appointment.status)) throw new Error("Only booked appointments can be checked in");
		const checkedInAt = new Date().toISOString();
		await transaction.update(appointments).set({ status: "Checked-in", checkedInAt, checkedInBy: actorId, updatedAt: checkedInAt }).where(eq(appointments.appointmentId, appointmentId));
		await transaction.insert(auditLogs).values({
			logId: nanoid(20), userId: actorId, actionType: "APPOINTMENT_CHECKED_IN", tableName: "appointments", recordId: appointmentId,
			oldValue: JSON.stringify({ status: appointment.status }), newValue: JSON.stringify({ status: "Checked-in", checkedInAt }), timestamp: checkedInAt,
		});
		return { ...appointment, status: "Checked-in" as const, checkedInAt };
	});
}

export async function startAppointmentConsultationWithAudit(appointmentId: string, actorId: string) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	return db.transaction(async (transaction) => {
		const appointment = (await transaction.select().from(appointments).where(eq(appointments.appointmentId, appointmentId)).limit(1))[0];
		if (!appointment) throw new Error("Appointment not found");
		if (!canStartAppointmentConsultation(appointment.status)) throw new Error("Appointment must be checked in before starting consultation");
    const encounter = (await transaction.select().from(encounters).where(eq(encounters.appointmentId, appointmentId)).limit(1))[0] ?? null;
    const existing = (await transaction.select().from(consultations).where(eq(consultations.appointmentId, appointmentId)).limit(1))[0];
    if (existing) return { consultation: existing, created: false };
    const consultationId = `CON-${nanoid(16).toUpperCase()}`;
		const consultationDate = new Date().toISOString();
    const consultation = { consultationId, appointmentId, encounterId: encounter?.encounterId, patientId: appointment.patientId, consultantId: appointment.consultantId, consultationDate };
    await transaction.insert(consultations).values(consultation);
    if (encounter) await transaction.update(encounters).set({ status: "OP Generated", updatedAt: consultationDate }).where(eq(encounters.encounterId, encounter.encounterId));
		await transaction.insert(auditLogs).values({
			logId: nanoid(20), userId: actorId, actionType: "CONSULTATION_STARTED", tableName: "consultations", recordId: consultationId,
			newValue: JSON.stringify({ appointmentId, patientId: appointment.patientId, consultantId: appointment.consultantId }), timestamp: consultationDate,
		});
		return { consultation, created: true };
	});
}

export async function createDirectEncounterWithAudit(data: { patientId: string; consultantId: number; source: "WALK_IN" | "PHONE" | "MANUAL"; actorId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (transaction) => {
    const existing = (await transaction.select().from(encounters).where(sql`${encounters.patientId} = ${data.patientId} AND ${encounters.consultantId} = ${data.consultantId} AND DATE(${encounters.createdAt}) = CURDATE() AND ${encounters.status} <> 'Closed'`).limit(1))[0];
    if (existing) return { encounter: existing, created: false };
    const encounterId = `ENC-${nanoid(16).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const encounter = { encounterId, patientId: data.patientId, consultantId: data.consultantId, source: data.source, status: "Present" as const, createdBy: data.actorId, createdAt, updatedAt: createdAt };
    await transaction.insert(encounters).values(encounter);
    await transaction.insert(auditLogs).values({ logId: nanoid(20), userId: data.actorId, actionType: "ENCOUNTER_CREATED", tableName: "encounters", recordId: encounterId, newValue: JSON.stringify({ patientId: data.patientId, consultantId: data.consultantId, source: data.source }), timestamp: createdAt });
    return { encounter, created: true };
  });
}

export async function checkInEncounterWithAudit(encounterId: string, actorId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (transaction) => {
    const encounter = (await transaction.select().from(encounters).where(eq(encounters.encounterId, encounterId)).limit(1))[0];
    if (!encounter) throw new Error("Encounter not found");
    if (!canCheckInEncounter(encounter.status)) return encounter;
    const timestamp = new Date().toISOString();
    await transaction.update(encounters).set({ status: "Checked-in", updatedAt: timestamp }).where(eq(encounters.encounterId, encounterId));
    await transaction.insert(auditLogs).values({ logId: nanoid(20), userId: actorId, actionType: "ENCOUNTER_CHECKED_IN", tableName: "encounters", recordId: encounterId, oldValue: JSON.stringify({ status: encounter.status }), newValue: JSON.stringify({ status: "Checked-in" }), timestamp });
    return { ...encounter, status: "Checked-in" as const, updatedAt: timestamp };
  });
}

export async function startEncounterConsultationWithAudit(encounterId: string, actorId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (transaction) => {
    const encounter = (await transaction.select().from(encounters).where(eq(encounters.encounterId, encounterId)).limit(1))[0];
    if (!encounter) throw new Error("Encounter not found");
    if (!canGenerateEncounterOp(encounter.status)) throw new Error("Encounter must be checked in before generating an OP");
    const existing = (await transaction.select().from(consultations).where(eq(consultations.encounterId, encounterId)).limit(1))[0];
    if (existing) return { consultation: existing, created: false };
    const consultationId = `CON-${nanoid(16).toUpperCase()}`;
    const consultationDate = new Date().toISOString();
    const consultation = { consultationId, encounterId, patientId: encounter.patientId, consultantId: encounter.consultantId, consultationDate };
    await transaction.insert(consultations).values(consultation);
    await transaction.update(encounters).set({ status: "OP Generated", updatedAt: consultationDate }).where(eq(encounters.encounterId, encounterId));
    await transaction.insert(auditLogs).values({ logId: nanoid(20), userId: actorId, actionType: "OP_GENERATED", tableName: "encounters", recordId: encounterId, newValue: JSON.stringify({ encounterId, consultationId, patientId: encounter.patientId, consultantId: encounter.consultantId }), timestamp: consultationDate });
    return { consultation, created: true };
  });
}

export async function createEncounterForAppointmentWithAudit(data: { appointmentId: string; actorId: string; appointment?: typeof appointments.$inferSelect }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (transaction) => {
    const appointment = data.appointment ?? (await transaction.select().from(appointments).where(eq(appointments.appointmentId, data.appointmentId)).limit(1))[0];
    if (!appointment) throw new Error("Appointment not found");
    const existing = (await transaction.select().from(encounters).where(eq(encounters.appointmentId, data.appointmentId)).limit(1))[0];
    if (existing) return { encounter: existing, created: false };
    const encounterId = `ENC-${nanoid(16).toUpperCase()}`;
    const timestamp = new Date().toISOString();
    const encounter = { encounterId, patientId: appointment.patientId, consultantId: appointment.consultantId, appointmentId: appointment.appointmentId, source: appointment.appointmentSource === "PHONE" ? "PHONE" as const : "APPOINTMENT" as const, status: "Present" as const, createdBy: data.actorId, createdAt: timestamp, updatedAt: timestamp };
    await transaction.insert(encounters).values(encounter);
    await transaction.insert(auditLogs).values({ logId: nanoid(20), userId: data.actorId, actionType: "ENCOUNTER_CREATED", tableName: "encounters", recordId: encounterId, newValue: JSON.stringify({ appointmentId: appointment.appointmentId, patientId: appointment.patientId, consultantId: appointment.consultantId, source: encounter.source }), timestamp });
    return { encounter, created: true };
  });
}

export async function getEncounterById(encounterId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return (await db.select().from(encounters).where(eq(encounters.encounterId, encounterId)).limit(1))[0];
}

export async function getAppointmentById(appointmentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(appointments).where(eq(appointments.appointmentId, appointmentId));
  return result[0];
}

export async function getAppointmentsByPatient(patientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(appointments).where(eq(appointments.patientId, patientId));
}

/**
 * The appointment workspace must not expose historical rows whose referenced
 * patient or consultant was removed. Such rows cannot safely generate a
 * branded OP and are retained only as legacy audit history.
 */
export async function getOperationalAppointments(filters: { consultantId?: number; patientId?: string } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const query = db.select({ appointment: appointments })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.patientId))
    .innerJoin(users, eq(appointments.consultantId, users.id));
  const rows = filters.consultantId && filters.patientId
    ? await query.where(and(eq(appointments.consultantId, filters.consultantId), eq(appointments.patientId, filters.patientId)))
    : filters.consultantId
      ? await query.where(eq(appointments.consultantId, filters.consultantId))
      : filters.patientId
        ? await query.where(eq(appointments.patientId, filters.patientId))
        : await query;
  return rows.map((row) => row.appointment);
}

export async function getAllAppointments() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.select().from(appointments);
}

export async function getAppointmentsByConsultant(consultantId: number, date?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (date) {
    return await db.select().from(appointments).where(
      and(
        eq(appointments.consultantId, consultantId),
        eq(appointments.appointmentDate, date)
      )
    );
  }

  return await db.select().from(appointments).where(eq(appointments.consultantId, consultantId));
}

export async function updateAppointmentStatus(appointmentId: string, status: "Scheduled" | "Completed" | "Cancelled" | "No-show" | "Rescheduled") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(appointments.appointmentId, appointmentId));
}

export async function cancelAppointment(appointmentId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments)
    .set({ status: "Cancelled", updatedAt: new Date().toISOString() })
    .where(eq(appointments.appointmentId, appointmentId));
}

export async function rescheduleAppointment(appointmentId: string, newDate: string, newTime: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) throw new Error("Appointment not found");
  if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status as (typeof ACTIVE_APPOINTMENT_STATUSES)[number])) {
    throw new Error("Only scheduled appointments can be rescheduled");
  }

  await db.transaction(async (transaction) => {
    const datesToLock = [appointment.appointmentDate, newDate].sort();
    for (const dateToLock of datesToLock) {
      await lockConsultantDate(transaction, appointment.consultantId, dateToLock);
    }

    const existingAppointments = await getActiveAppointmentsForDate(
      transaction,
      appointment.consultantId,
      newDate,
    );
    if (rowsHaveAppointmentConflict(existingAppointments, newTime, appointment.duration ?? 30, appointmentId)) {
      throw new Error("New time slot already booked");
    }

    await transaction.update(appointments)
      .set({
        appointmentDate: newDate,
        appointmentTime: newTime,
        status: "Rescheduled",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(appointments.appointmentId, appointmentId));
  });
}

export async function checkAppointmentConflict(consultantId: number, date: string, time: string, duration: number = 30) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingAppointments = await db.select().from(appointments).where(
    and(
      eq(appointments.consultantId, consultantId),
      eq(appointments.appointmentDate, date),
      inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES])
    )
  );

  return rowsHaveAppointmentConflict(existingAppointments, time, duration);
}

export async function checkInAppointment(appointmentId: string, checkedInBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) throw new Error("Appointment not found");
  if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status as (typeof ACTIVE_APPOINTMENT_STATUSES)[number])) {
    throw new Error("Only scheduled appointments can be checked in");
  }

  await db.update(appointments).set({
    checkedInAt: new Date().toISOString(),
    checkedInBy,
    updatedAt: new Date().toISOString(),
  }).where(eq(appointments.appointmentId, appointmentId));
}

export type ConsultantAvailabilityInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active?: boolean;
  slotDuration?: number;
  maxAppointmentsPerDay?: number;
};

function availabilityMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function validateConsultantAvailability(input: ConsultantAvailabilityInput[]) {
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const seen = new Set<string>();
  const activeByDay = new Map<number, Array<{ start: number; end: number }>>();
  for (const interval of input) {
    if (!Number.isInteger(interval.dayOfWeek) || interval.dayOfWeek < 0 || interval.dayOfWeek > 6) {
      throw new Error("Availability day must be between Sunday and Saturday");
    }
    if (!timePattern.test(interval.startTime) || !timePattern.test(interval.endTime)) {
      throw new Error("Availability times must use HH:MM format");
    }
    const start = availabilityMinutes(interval.startTime);
    const end = availabilityMinutes(interval.endTime);
    if (start >= end) throw new Error("Availability start time must be before end time");
    const identity = `${interval.dayOfWeek}|${interval.startTime}|${interval.endTime}`;
    if (seen.has(identity)) throw new Error("Duplicate availability intervals are not allowed");
    seen.add(identity);
    if (interval.active === false) continue;
    const sameDay = activeByDay.get(interval.dayOfWeek) ?? [];
    if (sameDay.some((existing) => start < existing.end && existing.start < end)) {
      throw new Error("Active availability intervals cannot overlap on the same day");
    }
    sameDay.push({ start, end });
    activeByDay.set(interval.dayOfWeek, sameDay);
  }
  return input;
}

export async function getConsultantAvailability(consultantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(consultantAvailability)
    .where(eq(consultantAvailability.consultantId, consultantId))
    .orderBy(consultantAvailability.dayOfWeek, consultantAvailability.startTime);
}

export async function replaceConsultantAvailabilityWithAudit(
  consultantId: number,
  input: ConsultantAvailabilityInput[],
  actorId: string,
) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  validateConsultantAvailability(input);
  return database.transaction(async (transaction) => {
    const previous = await transaction.select().from(consultantAvailability)
      .where(eq(consultantAvailability.consultantId, consultantId));
    await transaction.delete(consultantAvailability).where(eq(consultantAvailability.consultantId, consultantId));
    const rows = input.map((interval, index) => ({
      availabilityId: `AVL-${Date.now()}-${index}-${nanoid(8)}`,
      consultantId,
      dayOfWeek: interval.dayOfWeek,
      startTime: interval.startTime,
      endTime: interval.endTime,
      slotDuration: interval.slotDuration ?? 30,
      maxAppointmentsPerDay: interval.maxAppointmentsPerDay ?? 10,
      isActive: interval.active === false ? 0 : 1,
    }));
    if (rows.length) await transaction.insert(consultantAvailability).values(rows as any);
    await transaction.insert(auditLogs).values({
      logId: nanoid(20),
      userId: actorId,
      actionType: "CONSULTANT_AVAILABILITY_UPDATED",
      tableName: "consultantAvailability",
      recordId: consultantId.toString(),
      oldValue: JSON.stringify(previous.map(({ availabilityId: _id, createdAt: _created, updatedAt: _updated, ...row }) => row)),
      newValue: JSON.stringify(rows.map(({ availabilityId: _id, ...row }) => row)),
      timestamp: new Date().toISOString(),
    });
    return rows;
  });
}

export async function setConsultantAvailability(data: {
  consultantId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration?: number;
  maxAppointmentsPerDay?: number;
}) {
  const rows = await replaceConsultantAvailabilityWithAudit(data.consultantId, [data], "system");
  return rows[0]?.availabilityId;
}


export async function getAvailableSlots(consultantId: number, date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();

  const availabilityList = await db.select().from(consultantAvailability).where(
    and(
      eq(consultantAvailability.consultantId, consultantId),
      eq(consultantAvailability.dayOfWeek, dayOfWeek),
      eq(consultantAvailability.isActive, 1)
    )
  );

  const availability = availabilityList[0];

  if (!availability) return [];

  const appointments = await getAppointmentsByConsultant(consultantId, date);
  const slots: string[] = [];

  const [startHours, startMinutes] = availability.startTime.split(":").map(Number);
  const [endHours, endMinutes] = availability.endTime.split(":").map(Number);
  
  let currentTime = startHours * 60 + startMinutes;
  const endTime = endHours * 60 + endMinutes;
  const slotDuration = availability.slotDuration ?? 30;

  while (currentTime + slotDuration <= endTime) {
    const slotHours = Math.floor(currentTime / 60);
    const slotMinutes = currentTime % 60;
    const timeStr = `${String(slotHours).padStart(2, "0")}:${String(slotMinutes).padStart(2, "0")}`;

    const hasConflict = appointments.some((apt: any) => {
      const [aptHours, aptMinutes] = apt.appointmentTime.split(":").map(Number);
      const aptStart = aptHours * 60 + aptMinutes;
      const aptEnd = aptStart + (apt.duration ?? 30);
      return currentTime < aptEnd && currentTime + slotDuration > aptStart;
    });

    if (!hasConflict) {
      slots.push(timeStr);
    }

    currentTime += slotDuration;
  }

  return slots;
}


// ============ PASSWORD AUTHENTICATION ============

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setUserPassword(userId: number, password: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const hashedPassword = await hashPassword(password);
  
  await db.update(users)
    .set({ passwordHash: hashedPassword, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId));
}

export async function authenticateUser(userIdOrEmail: string, password: string): Promise<{ id: number; name: string | null; email: string | null; role: string } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let user = await db.select().from(users).where(eq(users.email, userIdOrEmail)).limit(1);
  
  if (user.length === 0) {
    user = await db.select().from(users).where(eq(users.userId, userIdOrEmail.toUpperCase())).limit(1);
  }
  if (user.length === 0) {
    user = await db.select().from(users).where(eq(users.username, userIdOrEmail.toLowerCase())).limit(1);
  }
  
  if (user.length === 0 || user[0].isActive === 0 || !user[0].passwordHash) {
    return null;
  }

  const isPasswordValid = await verifyPassword(password, user[0].passwordHash);
  
  if (!isPasswordValid) {
    return null;
  }

  return {
    id: user[0].id as number,
    name: user[0].name,
    email: user[0].email,
    role: user[0].role,
  };
}

export async function getUserByEmail(email: string): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user.length > 0 ? user[0] : null;
}


export async function updateUserOpenId(userId: number, newOpenId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(users).set({ openId: newOpenId }).where(eq(users.id, userId));
}


export async function getUserById(userId: number): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user.length > 0 ? user[0] : null;
}




// Bill Templates
export async function createBillTemplate(template: typeof billTemplates.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(billTemplates).values(template);
}

export async function getBillTemplateById(templateId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(billTemplates).where(eq(billTemplates.templateId, templateId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllBillTemplates() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(billTemplates).where(eq(billTemplates.isActive, 1)).orderBy(desc(billTemplates.createdAt));
}

export async function updateBillTemplate(templateId: string, updates: Partial<typeof billTemplates.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(billTemplates).set(updates).where(eq(billTemplates.templateId, templateId));
}

export async function deleteBillTemplate(templateId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(billTemplates).set({ isActive: 0 }).where(eq(billTemplates.templateId, templateId));
}


// Direct Login Functions (Email/Password Authentication)

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0] || null;
}

export async function createDirectLoginUser(data: {
  email: string;
  username: string;
  passwordHash: string;
  name: string;
  role: "admin" | "consultant" | "staff" | "user";
  phone?: string;
  department?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Generate a unique openId for compatibility
  const openId = `local-${data.username}-${Date.now()}`;
  
  const result = await db.insert(users).values({
    openId,
    email: data.email,
    username: data.username,
    passwordHash: data.passwordHash,
    name: data.name,
    role: data.role,
    phone: data.phone,
    department: data.department,
    createdBy: data.createdBy,
    isActive: 1,
    loginMethod: "direct",
  });
  
  return result;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ passwordHash, updatedAt: new Date().toISOString() }).where(eq(users.id, userId));
}

export async function updateUserStatus(userId: number, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ isActive: isActive ? 1 : 0 }).where(eq(users.id, userId));
}

export async function getAllDirectLoginUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.select().from(users).where(eq(users.loginMethod, "direct")).orderBy(desc(users.createdAt));
}


// ========== VENDOR MANAGEMENT ==========
export type VendorMasterInput = {
	name: string;
	contactNumber?: string | null;
	gstNumber?: string | null;
	email?: string | null;
	address?: string | null;
	bankDetails?: string | null;
};

function vendorValues(input: VendorMasterInput) {
	const name = input.name.trim();
	const normalizedVendorName = normalizeVendorName(name);
	if (!normalizedVendorName) throw new Error("Vendor name must contain searchable text");
	return {
		name,
		normalizedVendorName,
		contactNumber: input.contactNumber?.trim() || null,
		gstNumber: input.gstNumber?.trim().toUpperCase() || null,
		normalizedGstNumber: normalizeGstNumber(input.gstNumber),
		email: input.email?.trim() || null,
		address: input.address?.trim() || null,
		bankDetails: input.bankDetails?.trim() || null,
	};
}

export async function listVendorsForAdmin(includeInactive = false) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	return includeInactive
		? db.select().from(vendors).orderBy(vendors.name)
		: db.select().from(vendors).where(eq(vendors.isActive, 1)).orderBy(vendors.name);
}

export async function findActiveVendorCandidates(name: string, gstNumber?: string | null): Promise<VendorMasterRecord[]> {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const normalizedName = normalizeVendorName(name);
	const normalizedGst = normalizeGstNumber(gstNumber);
	if (!normalizedName && !normalizedGst) return [];
	const rows = await db.select().from(vendors).where(eq(vendors.isActive, 1));
	return rows.filter((vendor) => vendor.normalizedVendorName === normalizedName || (normalizedGst && vendor.normalizedGstNumber === normalizedGst)) as VendorMasterRecord[];
}

export async function createVendorWithAudit(input: VendorMasterInput, actorId: string) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const values = vendorValues(input);
	const duplicate = await db.select().from(vendors).where(or(
		eq(vendors.normalizedVendorName, values.normalizedVendorName),
		...(values.normalizedGstNumber ? [eq(vendors.normalizedGstNumber, values.normalizedGstNumber)] : []),
	)).limit(1);
	if (duplicate[0]) throw new Error("A vendor with the same normalized name or GSTIN already exists");
	const vendorId = `VENDOR-${nanoid(16).toUpperCase()}`;
	const createdAt = new Date().toISOString();
	const vendor = { vendorId, ...values, isActive: 1, createdBy: Number(actorId), createdAt, updatedAt: createdAt };
	await db.transaction(async (transaction) => {
		await transaction.insert(vendors).values(vendor);
		await transaction.insert(auditLogs).values({
			logId: nanoid(20), userId: actorId, actionType: "VENDOR_CREATED", tableName: "vendors", recordId: vendorId,
			newValue: JSON.stringify({ vendorId, name: values.name, normalizedVendorName: values.normalizedVendorName, normalizedGstNumber: values.normalizedGstNumber, isActive: true }), timestamp: createdAt,
		});
	});
	return vendor;
}

export async function updateVendorWithAudit(vendorId: string, input: VendorMasterInput, actorId: string) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const current = await getVendorById(vendorId);
	if (!current) throw new Error("Vendor not found");
	const values = vendorValues(input);
	const duplicate = await db.select().from(vendors).where(or(
		eq(vendors.normalizedVendorName, values.normalizedVendorName),
		...(values.normalizedGstNumber ? [eq(vendors.normalizedGstNumber, values.normalizedGstNumber)] : []),
	)).limit(10);
	if (duplicate.some((vendor) => vendor.vendorId !== vendorId)) throw new Error("A vendor with the same normalized name or GSTIN already exists");
	const updatedAt = new Date().toISOString();
	await db.transaction(async (transaction) => {
		await transaction.update(vendors).set({ ...values, updatedAt }).where(eq(vendors.vendorId, vendorId));
		await transaction.insert(auditLogs).values({
			logId: nanoid(20), userId: actorId, actionType: "VENDOR_UPDATED", tableName: "vendors", recordId: vendorId,
			oldValue: JSON.stringify({ name: current.name, normalizedVendorName: current.normalizedVendorName, normalizedGstNumber: current.normalizedGstNumber, isActive: Boolean(current.isActive) }),
			newValue: JSON.stringify({ name: values.name, normalizedVendorName: values.normalizedVendorName, normalizedGstNumber: values.normalizedGstNumber, isActive: Boolean(current.isActive) }), timestamp: updatedAt,
		});
	});
	return { ...current, ...values, updatedAt };
}

export async function setVendorActiveWithAudit(vendorId: string, active: boolean, actorId: string) {
	const db = await getDb();
	if (!db) throw new Error("Database not available");
	const current = await getVendorById(vendorId);
	if (!current) throw new Error("Vendor not found");
	if (Boolean(current.isActive) === active) return { ...current, isActive: active ? 1 : 0 };
	const updatedAt = new Date().toISOString();
	await db.transaction(async (transaction) => {
		await transaction.update(vendors).set({ isActive: active ? 1 : 0, updatedAt }).where(eq(vendors.vendorId, vendorId));
		await transaction.insert(auditLogs).values({
			logId: nanoid(20), userId: actorId, actionType: active ? "VENDOR_REACTIVATED" : "VENDOR_DEACTIVATED", tableName: "vendors", recordId: vendorId,
			oldValue: JSON.stringify({ isActive: Boolean(current.isActive) }), newValue: JSON.stringify({ isActive: active }), timestamp: updatedAt,
		});
	});
	return { ...current, isActive: active ? 1 : 0, updatedAt };
}

export async function createVendor(vendorData: any): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const vendorId = `VENDOR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.insert(vendors).values({
    vendorId,
    name: vendorData.name,
    contactNumber: vendorData.contactNumber,
    gstNumber: vendorData.gstNumber,
    address: vendorData.address,
    dlNumber: vendorData.dlNumber ? JSON.stringify(vendorData.dlNumber) : null,
    email: vendorData.email,
    isActive: 1,
    createdBy: vendorData.createdBy,
  });
  
  return { vendorId, ...vendorData };
}

export async function getAllVendors(): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(vendors).where(eq(vendors.isActive, 1));
}

export async function getVendorById(vendorId: string): Promise<any | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(vendors).where(eq(vendors.vendorId, vendorId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateVendor(vendorId: string, vendorData: any): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(vendors).set({
    name: vendorData.name,
    contactNumber: vendorData.contactNumber,
    gstNumber: vendorData.gstNumber,
    address: vendorData.address,
    dlNumber: vendorData.dlNumber ? JSON.stringify(vendorData.dlNumber) : null,
    email: vendorData.email,
    updatedAt: new Date().toISOString(),
  }).where(eq(vendors.vendorId, vendorId));
  
  return { vendorId, ...vendorData };
}

export async function recordExternalRequestReplay(replayData: typeof externalRequestReplays.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(externalRequestReplays).values(replayData);
}


// ============ PAPER-FIRST ENCOUNTER WORKFLOW ============

export async function completeConsultationWithAudit(consultationId: string, actorId: string, allowAdminOverride = false) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async (transaction) => {
    const consultation = (await transaction.select().from(consultations).where(eq(consultations.consultationId, consultationId)).limit(1))[0];
    if (!consultation) throw new Error("Consultation not found");
    const encounter = consultation.encounterId
      ? (await transaction.select().from(encounters).where(eq(encounters.encounterId, consultation.encounterId)).limit(1))[0]
      : null;
    const appointment = !encounter && consultation.appointmentId
      ? (await transaction.select().from(appointments).where(eq(appointments.appointmentId, consultation.appointmentId)).limit(1))[0]
      : null;
    if (!encounter && !appointment) throw new Error("Encounter not found");
    const consultantId = encounter?.consultantId ?? appointment?.consultantId;
    if (!allowAdminOverride && consultantId !== Number(actorId)) throw new Error("Only the assigned consultant can complete this encounter");
    if (consultation.isFinalized) return { consultation, changed: false };
    const timestamp = new Date().toISOString();
    await transaction.update(consultations).set({ isFinalized: 1, updatedAt: timestamp }).where(eq(consultations.consultationId, consultationId));
    await transaction.insert(auditLogs).values({
      logId: nanoid(20), userId: actorId, actionType: allowAdminOverride ? "CONSULTATION_COMPLETED_ADMIN_OVERRIDE" : "CONSULTATION_COMPLETED",
      tableName: "consultations", recordId: consultationId, oldValue: JSON.stringify({ isFinalized: consultation.isFinalized }),
      newValue: JSON.stringify({ isFinalized: 1, encounterId: encounter?.encounterId ?? null, appointmentId: appointment?.appointmentId ?? null }), timestamp,
    });
    if (encounter) await transaction.update(encounters).set({ status: "Ready for Billing", updatedAt: timestamp }).where(eq(encounters.encounterId, encounter.encounterId));
    return { consultation: { ...consultation, isFinalized: 1 as const, updatedAt: timestamp }, changed: true };
  });
}

export async function getEncounterBillByConsultationId(consultationId: string) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return (await database.select().from(bills).where(eq(bills.consultationId, consultationId)).limit(1))[0] ?? null;
}

export async function createEncounterBillAndCloseVisit(data: {
  bill: typeof bills.$inferInsert;
  items: Array<typeof billItems.$inferInsert>;
  appointmentId?: string;
  encounterId?: string;
  actorId: string;
}) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  return database.transaction(async (transaction) => {
    const consultation = data.bill.consultationId
      ? (await transaction.select().from(consultations).where(eq(consultations.consultationId, data.bill.consultationId)).limit(1))[0]
      : null;
    if (!consultation || !consultation.isFinalized) throw new Error("Consultation must be completed before billing");
    const encounter = consultation.encounterId
      ? (await transaction.select().from(encounters).where(eq(encounters.encounterId, consultation.encounterId)).limit(1))[0]
      : null;
    if (data.encounterId && (!encounter || encounter.encounterId !== data.encounterId)) throw new Error("Encounter billing context is invalid");
    if (data.appointmentId && consultation.appointmentId !== data.appointmentId) throw new Error("Encounter billing context is invalid");
    if (!encounter && !data.appointmentId) throw new Error("Encounter billing context is invalid");
    const existing = (await transaction.select().from(bills).where(eq(bills.consultationId, consultation.consultationId)).limit(1))[0];
    if (existing) return { bill: existing, created: false };
    await transaction.insert(bills).values({ ...data.bill, encounterId: encounter?.encounterId ?? undefined });
    for (const item of data.items) await transaction.insert(billItems).values(item);
    const timestamp = new Date().toISOString();
    if (encounter) await transaction.update(encounters).set({ status: "Closed", closedAt: timestamp, updatedAt: timestamp }).where(eq(encounters.encounterId, encounter.encounterId));
    if (data.appointmentId) await transaction.update(appointments).set({ status: "Completed", updatedAt: timestamp }).where(eq(appointments.appointmentId, data.appointmentId));
    await transaction.insert(auditLogs).values({
      logId: nanoid(20), userId: data.actorId, actionType: "VISIT_CLOSED_AFTER_BILL", tableName: encounter ? "encounters" : "appointments", recordId: encounter?.encounterId ?? data.appointmentId,
      newValue: JSON.stringify({ consultationId: consultation.consultationId, billId: data.bill.billId, status: "Closed", encounterId: encounter?.encounterId ?? null }), timestamp,
    });
    return { bill: data.bill, created: true };
  });
}

export async function getPatientVisitChain(patientId: string) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const patientAppointments = await database.select().from(appointments).where(eq(appointments.patientId, patientId)).orderBy(desc(appointments.createdAt));
  const chains: any[] = [];
  for (const appointment of patientAppointments) {
    const consultation = (await database.select().from(consultations).where(eq(consultations.appointmentId, appointment.appointmentId)).limit(1))[0] ?? null;
    const bill = consultation ? (await database.select().from(bills).where(eq(bills.consultationId, consultation.consultationId)).limit(1))[0] ?? null : null;
    const encounter = (await database.select().from(encounters).where(eq(encounters.appointmentId, appointment.appointmentId)).limit(1))[0] ?? null;
    chains.push({ appointment, encounter, consultation, bill });
  }
  const directEncounters = await database.select().from(encounters).where(and(eq(encounters.patientId, patientId), sql`${encounters.appointmentId} IS NULL`)).orderBy(desc(encounters.createdAt));
  for (const encounter of directEncounters) {
    const consultation = (await database.select().from(consultations).where(eq(consultations.encounterId, encounter.encounterId)).limit(1))[0] ?? null;
    const bill = consultation ? (await database.select().from(bills).where(eq(bills.consultationId, consultation.consultationId)).limit(1))[0] ?? null : null;
    const date = new Date(encounter.createdAt);
    chains.push({ appointment: { appointmentId: null, patientId, consultantId: encounter.consultantId, appointmentDate: date.toISOString().slice(0, 10), appointmentTime: date.toISOString().slice(11, 16), status: encounter.status, appointmentSource: encounter.source }, encounter, consultation, bill });
  }
  return chains.sort((left, right) => new Date(right.encounter?.createdAt ?? right.appointment.createdAt).getTime() - new Date(left.encounter?.createdAt ?? left.appointment.createdAt).getTime());
}

export async function getBillingCandidatesByDate(appointmentDate: string) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const appointmentRows = await database.select({ appointment: appointments, patient: patients, consultation: consultations, bill: bills, consultant: users, encounter: encounters })
    .from(appointments)
    .leftJoin(patients, eq(appointments.patientId, patients.patientId))
    .leftJoin(consultations, eq(appointments.appointmentId, consultations.appointmentId))
    .leftJoin(bills, eq(consultations.consultationId, bills.consultationId))
    .leftJoin(users, eq(appointments.consultantId, users.id))
    .leftJoin(encounters, eq(appointments.appointmentId, encounters.appointmentId))
    .where(eq(appointments.appointmentDate, appointmentDate))
    .orderBy(appointments.appointmentTime, appointments.createdAt);
  const directRows = await database.select({ encounter: encounters, patient: patients, consultation: consultations, bill: bills, consultant: users })
    .from(encounters)
    .leftJoin(patients, eq(encounters.patientId, patients.patientId))
    .leftJoin(consultations, eq(encounters.encounterId, consultations.encounterId))
    .leftJoin(bills, eq(consultations.consultationId, bills.consultationId))
    .leftJoin(users, eq(encounters.consultantId, users.id))
    .where(and(sql`${encounters.appointmentId} IS NULL`, sql`DATE(${encounters.createdAt}) = ${appointmentDate}`));
  const directAsLegacyShape = directRows.map(({ encounter, patient, consultation, bill, consultant }) => {
    const date = new Date(encounter.createdAt);
    return { appointment: { appointmentId: null, patientId: encounter.patientId, consultantId: encounter.consultantId, appointmentDate, appointmentTime: date.toISOString().slice(11, 16), status: encounter.status, appointmentSource: encounter.source }, patient, consultation, bill, consultant, encounter };
  });
  return [...appointmentRows, ...directAsLegacyShape];
}
