import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

type IndexRow = {
  Key_name: string;
  Non_unique: number;
  Seq_in_index: number;
  Column_name: string;
};

type ForeignKeyRow = {
  CONSTRAINT_NAME: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
  ORDINAL_POSITION: number;
};

async function fail(connection: mysql.Connection, message: string): Promise<never> {
  console.error(`[Verification Error] ${message}`);
  await connection.end();
  process.exit(1);
}

async function assertPrimaryKey(
  connection: mysql.Connection,
  table: string,
  expectedColumns: string[],
): Promise<void> {
  const [rows] = await connection.query(
    `SHOW INDEXES FROM \`${table}\` WHERE Key_name = 'PRIMARY'`,
  );
  const actualColumns = (rows as IndexRow[])
    .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
    .map((row) => row.Column_name);

  if (actualColumns.length !== expectedColumns.length || actualColumns.some((column, index) => column !== expectedColumns[index])) {
    await fail(
      connection,
      `Table '${table}' PRIMARY KEY mismatch. Expected (${expectedColumns.join(', ')}), found (${actualColumns.join(', ')}).`,
    );
  }
}

async function assertUniqueIndex(
  connection: mysql.Connection,
  table: string,
  indexName: string,
  expectedColumns: string[],
): Promise<void> {
  const [rows] = await connection.query(`SHOW INDEXES FROM \`${table}\``);
  const matchingRows = (rows as IndexRow[])
    .filter((row) => row.Key_name === indexName && row.Non_unique === 0)
    .sort((a, b) => a.Seq_in_index - b.Seq_in_index);
  const actualColumns = matchingRows.map((row) => row.Column_name);

  if (actualColumns.length !== expectedColumns.length || actualColumns.some((column, index) => column !== expectedColumns[index])) {
    await fail(
      connection,
      `Required UNIQUE index '${indexName}' on '${table}' mismatch. Expected (${expectedColumns.join(', ')}), found (${actualColumns.join(', ')}).`,
    );
  }
}

async function assertIndex(
  connection: mysql.Connection,
  table: string,
  indexName: string,
  expectedColumns: string[],
): Promise<void> {
  const [rows] = await connection.query(`SHOW INDEXES FROM \`${table}\``);

  const matchingRows = (rows as IndexRow[])
    .filter((row) => row.Key_name === indexName)
    .sort((a, b) => a.Seq_in_index - b.Seq_in_index);

  const actualColumns = matchingRows.map((row) => row.Column_name);

  if (
    actualColumns.length !== expectedColumns.length ||
    actualColumns.some(
      (column, index) => column !== expectedColumns[index],
    )
  ) {
    await fail(
      connection,
      `Required index '${indexName}' on '${table}' mismatch. Expected (${expectedColumns.join(
        ", ",
      )}), found (${actualColumns.join(", ")}).`,
    );
  }
}

async function assertForeignKeys(
  connection: mysql.Connection,
  expectedForeignKeys: Array<{
    constraintName: string;
    table: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
    ordinalPosition: number;
  }>,
): Promise<void> {
  const [rows] = await connection.query<ForeignKeyRow[]>(
    `SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
  );

  const actualForeignKeys = rows.map((row) => ({
    constraintName: row.CONSTRAINT_NAME,
    table: row.TABLE_NAME,
    column: row.COLUMN_NAME,
    referencedTable: row.REFERENCED_TABLE_NAME,
    referencedColumn: row.REFERENCED_COLUMN_NAME,
    ordinalPosition: row.ORDINAL_POSITION,
  }));

  const expected = [...expectedForeignKeys].sort((a, b) =>
    `${a.constraintName}:${a.ordinalPosition}`.localeCompare(`${b.constraintName}:${b.ordinalPosition}`),
  );
  const actual = [...actualForeignKeys].sort((a, b) =>
    `${a.constraintName}:${a.ordinalPosition}`.localeCompare(`${b.constraintName}:${b.ordinalPosition}`),
  );

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    await fail(
      connection,
      `Foreign-key metadata mismatch. Expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`,
    );
  }
}

async function bootstrap() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[Bootstrap Error] DATABASE_URL not set");
    process.exit(1);
  }

  console.log("[Bootstrap] Connecting to MySQL 8 database...");
  const connection = await mysql.createConnection(connectionString);

  await connection.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");

  const baselinePath = path.join(process.cwd(), 'drizzle/baseline/current_schema.sql');
  if (!fs.existsSync(baselinePath)) {
    console.error(`[Bootstrap Error] Baseline SQL file not found at: ${baselinePath}`);
    process.exit(1);
  }

  console.log("[Bootstrap] Reading deterministic current schema baseline...");
  const sqlContent = fs.readFileSync(baselinePath, 'utf8');

  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`[Bootstrap] Executing ${statements.length} baseline SQL statements with fail-closed semantics...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await connection.query(stmt);
    } catch (err: any) {
      console.error(`[Bootstrap Error] Failed at statement #${i + 1}:`);
      console.error(stmt);
      console.error(err.message);
      await connection.end();
      process.exit(1);
    }
  }

  console.log("[Bootstrap] SUCCESS: Baseline SQL executed successfully with zero errors.");
  console.log("[Verification] Running comprehensive schema verification against required invariants...");

  const [tablesResult] = await connection.query("SHOW TABLES");
  const tables = (tablesResult as any[]).map(row => Object.values(row)[0] as string);
  console.log(`[Verification] Found ${tables.length} tables in database:`, tables.sort());

  const requiredTables = [
    "users", "patients", "consultations", "inventory", "bills", "billItems", "billTemplates", "auditLogs", "notifications",
    "purchaseOrders", "purchaseOrderItems", "purchaseOrderHistory", "purchaseOrderExtractionReviews", "catalogItems", "catalogItemAliases", "goodsReceipts", "goodsReceiptItems", "stockMovements",
    "appointments", "consultantAvailability", "notificationPreferences", "rolePermissions", "vendors", "appointmentBookingLocks",
    "enquiries", "externalApiAuditLogs", "externalIdempotencyKeys", "externalRequestReplays",
  ];

  for (const reqTable of requiredTables) {
    const found = tables.some(t => t.toLowerCase() === reqTable.toLowerCase());
    if (!found) await fail(connection, `Required table missing: ${reqTable}`);
  }
  console.log("[Verification] All 28 required tables verified successfully.");

  const expectedPrimaryKeys: Array<[string, string[]]> = [
    ["users", ["id"]],
    ["patients", ["patientId"]],
    ["consultations", ["consultationId"]],
    ["inventory", ["itemId"]],
    ["bills", ["billId"]],
    ["billItems", ["billItemId"]],
    ["billTemplates", ["templateId"]],
    ["auditLogs", ["logId"]],
    ["notifications", ["notificationId"]],
    ["purchaseOrders", ["purchaseOrderId"]],
    ["purchaseOrderItems", ["poItemId"]],
    ["purchaseOrderHistory", ["historyId"]],
    ["purchaseOrderExtractionReviews", ["reviewId"]],
    ["catalogItems", ["catalogItemId"]],
    ["catalogItemAliases", ["aliasId"]],
    ["goodsReceipts", ["goodsReceiptId"]],
    ["goodsReceiptItems", ["goodsReceiptItemId"]],
    ["stockMovements", ["movementId"]],
    ["appointments", ["appointmentId"]],
    ["consultantAvailability", ["availabilityId"]],
    ["notificationPreferences", ["preferenceId"]],
    ["rolePermissions", ["permissionId"]],
    ["vendors", ["vendorId"]],
    ["appointmentBookingLocks", ["consultantId", "appointmentDate"]],
    ["enquiries", ["enquiryId"]],
    ["externalApiAuditLogs", ["auditId"]],
    ["externalIdempotencyKeys", ["idempotencyId"]],
    ["externalRequestReplays", ["replayId"]],
  ];

  for (const [table, columns] of expectedPrimaryKeys) {
    await assertPrimaryKey(connection, table, columns);
  }
  console.log("[Verification] Exact PRIMARY KEY columns verified on all 28 tables.");

  const [usersCols] = await connection.query("SHOW COLUMNS FROM `users` WHERE Field = 'id'");
  const usersIdCol = (usersCols as any[])[0];
  const isKeyPri = usersIdCol?.Key === 'PRI' || usersIdCol?.key === 'PRI';
  const isAutoInc = usersIdCol?.Extra?.includes('auto_increment') || usersIdCol?.extra?.includes('auto_increment');
  if (!usersIdCol || !isKeyPri || !isAutoInc) {
    await fail(connection, "users.id must be PRIMARY KEY with auto_increment.");
  }
  console.log("[Verification] users.id PRIMARY KEY + AUTO_INCREMENT verified.");

  const consultantProfileColumns = [
    "qualifications",
    "specialization",
    "designation",
    "prescriptionHeaderText",
    "consultantLogoKey",
    "signatureKey",
  ];
  for (const column of consultantProfileColumns) {
    const [columnRows] = await connection.query("SHOW COLUMNS FROM `users` WHERE Field = ?", [column]);
    if ((columnRows as any[]).length === 0) {
      await fail(connection, `users.${column} consultant profile column missing.`);
    }
  }
  console.log("[Verification] Consultant profile columns verified on users.");

  const requiredUniqueIndexes: Array<[string, string, string[]]> = [
    ["users", "users_openId_unique", ["openId"]],
    ["appointments", "appointments_appointmentId_unique", ["appointmentId"]],
    ["inventory", "inventory_item_batch_expiry_unique", ["itemName", "batchNumber", "expiryDate"]],
    ["patients", "patients_patientId_unique", ["patientId"]],
    ["goodsReceipts", "goodsReceipts_goodsReceiptId_unique", ["goodsReceiptId"]],
    ["goodsReceiptItems", "goodsReceiptItems_goodsReceiptItemId_unique", ["goodsReceiptItemId"]],
    ["goodsReceiptItems", "goodsReceiptItems_receipt_poItem_batch_unique", ["goodsReceiptId", "poItemId", "batchNumber"]],
    ["stockMovements", "stockMovements_movementId_unique", ["movementId"]],
    ["stockMovements", "stockMovements_receiptItem_unique", ["goodsReceiptItemId"]],
    ["purchaseOrderHistory", "purchaseOrderHistory_historyId_unique", ["historyId"]],
    ["purchaseOrderExtractionReviews", "purchaseOrderExtractionReviews_reviewId_unique", ["reviewId"]],
    ["purchaseOrderExtractionReviews", "purchaseOrderExtractionReviews_purchaseOrder_unique", ["purchaseOrderId"]],
    ["purchaseOrderExtractionReviews", "purchaseOrderExtractionReviews_submission_unique", ["reviewSubmissionId"]],
    ["catalogItems", "catalogItems_catalogItemId_unique", ["catalogItemId"]],
    ["catalogItems", "catalogItems_normalizedName_unique", ["normalizedName"]],
    ["catalogItemAliases", "catalogItemAliases_aliasId_unique", ["aliasId"]],
    ["catalogItemAliases", "catalogItemAliases_vendor_alias_unique", ["vendorId", "normalizedAlias"]],
    ["enquiries", "enquiries_enquiryId_unique", ["enquiryId"]],
    ["externalApiAuditLogs", "externalApiAuditLogs_auditId_unique", ["auditId"]],
    ["externalIdempotencyKeys", "externalIdempotency_operation_key_unique", ["operation", "idempotencyKey"]],
    ["externalIdempotencyKeys", "externalIdempotency_idempotencyId_unique", ["idempotencyId"]],
    ["appointmentBookingLocks", "appointmentBookingLocks_consultant_date_unique", ["consultantId", "appointmentDate"]],
    ["externalRequestReplays", "externalRequestReplays_key_request_unique", ["serviceKeyId", "requestId"]],
  ];

  for (const [table, indexName, columns] of requiredUniqueIndexes) {
    await assertUniqueIndex(connection, table, indexName, columns);
  }
  console.log("[Verification] All schema-defined UNIQUE constraints and duplicate-protection indexes verified.");

  const requiredIndexes: Array<[string, string, string[]]> = [
    [
      "purchaseOrderItems",
      "purchaseOrderItems_catalogItem_idx",
      ["catalogItemId"],
    ],
  ];

  for (const [table, indexName, columns] of requiredIndexes) {
    await assertIndex(connection, table, indexName, columns);
  }

  console.log("[Verification] Required non-unique indexes verified.");

  const expectedForeignKeys: Array<{
    constraintName: string;
    table: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
    ordinalPosition: number;
  }> = [];
  await assertForeignKeys(connection, expectedForeignKeys);
  console.log("[Verification] Foreign-key metadata verified: drizzle/schema.ts defines zero foreign keys.");

  const [poItemCols] = await connection.query("SHOW COLUMNS FROM `purchaseOrderItems` WHERE Field = 'receivedQuantity'");
  if ((poItemCols as any[]).length === 0) {
    await fail(connection, "purchaseOrderItems.receivedQuantity column missing.");
  }
  console.log("[Verification] purchaseOrderItems.receivedQuantity verified.");

  const specificEntities = ["goodsReceipts", "goodsReceiptItems", "stockMovements", "externalRequestReplays", "purchaseOrderExtractionReviews", "catalogItems", "catalogItemAliases"];
  for (const entity of specificEntities) {
    await connection.query(`SELECT COUNT(*) as cnt FROM \`${entity}\``);
    console.log(`[Verification] Entity table '${entity}' is accessible and queryable.`);
  }

  console.log("[Verification] SUCCESS: All schema verifications passed successfully with strict fail-closed guarantees.");
  await connection.end();
}

bootstrap().catch((err) => {
  console.error("[Bootstrap Fatal]", err);
  process.exit(1);
});
