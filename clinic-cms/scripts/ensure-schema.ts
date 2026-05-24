/**
 * Applies missing bills / purchaseOrders columns (common when migrations were not run).
 * Safe to run multiple times — skips columns that already exist.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

type Patch = { table: string; column: string; sql: string };

const PATCHES: Patch[] = [
  // bills (0003, 0004)
  { table: "bills", column: "receiptPdfUrl", sql: "ALTER TABLE `bills` ADD `receiptPdfUrl` text" },
  { table: "bills", column: "receiptPdfKey", sql: "ALTER TABLE `bills` ADD `receiptPdfKey` text" },
  { table: "bills", column: "consultationNotes", sql: "ALTER TABLE `bills` ADD `consultationNotes` text" },
  {
    table: "bills",
    column: "receiptDeliveryStatus",
    sql: "ALTER TABLE `bills` ADD `receiptDeliveryStatus` enum('Not Sent','Sent','Failed','Pending') DEFAULT 'Not Sent'",
  },
  {
    table: "bills",
    column: "receiptDeliveryMethod",
    sql: "ALTER TABLE `bills` ADD `receiptDeliveryMethod` varchar(50)",
  },
  {
    table: "bills",
    column: "receiptDeliveryTimestamp",
    sql: "ALTER TABLE `bills` ADD `receiptDeliveryTimestamp` timestamp NULL DEFAULT NULL",
  },
  // purchaseOrders (0004, 0013)
  {
    table: "purchaseOrders",
    column: "approvalStatus",
    sql: "ALTER TABLE `purchaseOrders` ADD `approvalStatus` enum('Pending Approval','Approved','Rejected') DEFAULT 'Pending Approval'",
  },
  { table: "purchaseOrders", column: "rejectionReason", sql: "ALTER TABLE `purchaseOrders` ADD `rejectionReason` text" },
  { table: "purchaseOrders", column: "approvedBy", sql: "ALTER TABLE `purchaseOrders` ADD `approvedBy` varchar(100)" },
  {
    table: "purchaseOrders",
    column: "approvalTimestamp",
    sql: "ALTER TABLE `purchaseOrders` ADD `approvalTimestamp` timestamp NULL DEFAULT NULL",
  },
  {
    table: "purchaseOrders",
    column: "authorizationNotes",
    sql: "ALTER TABLE `purchaseOrders` ADD `authorizationNotes` text",
  },
];

const CREATE_PURCHASE_ORDERS = `
CREATE TABLE IF NOT EXISTS \`purchaseOrders\` (
  \`purchaseOrderId\` varchar(50) NOT NULL,
  \`vendorName\` varchar(255) NOT NULL,
  \`vendorContactNumber\` varchar(20) NOT NULL,
  \`vendorEmail\` varchar(255),
  \`vendorGSTNumber\` varchar(50),
  \`vendorBankDetails\` text,
  \`vendorAddress\` text,
  \`totalAmount\` decimal(10,2) NOT NULL,
  \`paymentStatus\` enum('Pending','Paid','Partial') DEFAULT 'Pending',
  \`approvalStatus\` enum('Pending Approval','Approved','Rejected') DEFAULT 'Pending Approval',
  \`rejectionReason\` text,
  \`authorizationNotes\` text,
  \`approvedBy\` varchar(100),
  \`approvalTimestamp\` timestamp NULL DEFAULT NULL,
  \`orderDate\` timestamp NOT NULL DEFAULT (now()),
  \`expectedDeliveryDate\` varchar(10),
  \`notes\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(\`purchaseOrderId\`)
)`;

const CREATE_PURCHASE_ORDER_ITEMS = `
CREATE TABLE IF NOT EXISTS \`purchaseOrderItems\` (
  \`poItemId\` varchar(50) NOT NULL,
  \`purchaseOrderId\` varchar(50) NOT NULL,
  \`itemName\` varchar(255) NOT NULL,
  \`quantity\` int DEFAULT 1,
  \`unitPrice\` decimal(10,2) NOT NULL,
  \`subtotal\` decimal(10,2) NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY(\`poItemId\`)
)`;

const CREATE_ARCHIVE_RUNS = `
CREATE TABLE IF NOT EXISTS \`archiveRuns\` (
  \`runId\` varchar(50) NOT NULL,
  \`startedAt\` timestamp NOT NULL DEFAULT (now()),
  \`finishedAt\` timestamp NULL DEFAULT NULL,
  \`status\` enum('running','completed','failed') NOT NULL DEFAULT 'running',
  \`fileCount\` int DEFAULT 0,
  \`archiveSizeBytes\` int,
  \`driveFileId\` varchar(255),
  \`driveFolderId\` varchar(255),
  \`error\` text,
  \`triggeredBy\` varchar(100),
  PRIMARY KEY(\`runId\`)
)`;

const CREATE_GOOGLE_DRIVE_TOKENS = `
CREATE TABLE IF NOT EXISTS \`googleDriveTokens\` (
  \`id\` varchar(50) NOT NULL,
  \`accessTokenEnc\` text,
  \`refreshTokenEnc\` text NOT NULL,
  \`expiryDate\` timestamp NULL DEFAULT NULL,
  \`connectedEmail\` varchar(320),
  \`driveFolderId\` varchar(255),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(\`id\`)
)`;

async function tableExists(conn: mysql.Connection, table: string): Promise<boolean> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(
  conn: mysql.Connection,
  table: string,
  column: string
): Promise<boolean> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required in clinic-cms/.env");
  }

  const conn = await mysql.createConnection(url);
  console.log("[ensure-schema] Connected");

  if (!(await tableExists(conn, "purchaseOrders"))) {
    console.log("[ensure-schema] Creating purchaseOrders table");
    await conn.query(CREATE_PURCHASE_ORDERS);
  }
  if (!(await tableExists(conn, "purchaseOrderItems"))) {
    console.log("[ensure-schema] Creating purchaseOrderItems table");
    await conn.query(CREATE_PURCHASE_ORDER_ITEMS);
  }
  if (!(await tableExists(conn, "archiveRuns"))) {
    console.log("[ensure-schema] Creating archiveRuns table");
    await conn.query(CREATE_ARCHIVE_RUNS);
  }
  if (!(await tableExists(conn, "googleDriveTokens"))) {
    console.log("[ensure-schema] Creating googleDriveTokens table");
    await conn.query(CREATE_GOOGLE_DRIVE_TOKENS);
  }

  let applied = 0;
  let skipped = 0;

  for (const patch of PATCHES) {
    if (!(await tableExists(conn, patch.table))) {
      console.warn(`[ensure-schema] Skip ${patch.table}.${patch.column} — table missing`);
      continue;
    }
    if (await columnExists(conn, patch.table, patch.column)) {
      skipped += 1;
      continue;
    }
    try {
      await conn.query(patch.sql);
      console.log(`[ensure-schema] Added ${patch.table}.${patch.column}`);
      applied += 1;
    } catch (error) {
      console.error(`[ensure-schema] Failed ${patch.table}.${patch.column}:`, error);
    }
  }

  await conn.end();
  console.log(`[ensure-schema] Done. Applied: ${applied}, already present: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
