import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

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

  // ============ PROGRAMMATIC SCHEMA VERIFICATION ============
  console.log("[Verification] Running comprehensive schema verification against required invariants...");

  const [tablesResult] = await connection.query("SHOW TABLES");
  const tables = (tablesResult as any[]).map(row => Object.values(row)[0] as string);
  console.log(`[Verification] Found ${tables.length} tables in database:`, tables.sort());

  const requiredTables = [
    "users",
    "patients",
    "consultations",
    "inventory",
    "bills",
    "billItems",
    "billTemplates",
    "auditLogs",
    "notifications",
    "purchaseOrders",
    "purchaseOrderItems",
    "purchaseOrderHistory",
    "goodsReceipts",
    "goodsReceiptItems",
    "stockMovements",
    "appointments",
    "consultantAvailability",
    "notificationPreferences",
    "rolePermissions",
    "vendors",
    "appointmentBookingLocks",
    "enquiries",
    "externalApiAuditLogs",
    "externalIdempotencyKeys",
    "externalRequestReplays"
  ];

  for (const reqTable of requiredTables) {
    if (!tables.includes(reqTable)) {
      console.error(`[Verification Error] Required table missing: ${reqTable}`);
      await connection.end();
      process.exit(1);
    }
  }
  console.log("[Verification] All 25 required tables verified successfully.");

  const coreTablesWithPK = [
    "users",
    "patients",
    "consultations",
    "inventory",
    "bills",
    "purchaseOrders",
    "goodsReceipts",
    "goodsReceiptItems",
    "stockMovements",
    "appointments",
    "externalRequestReplays"
  ];

  for (const t of coreTablesWithPK) {
    const [cols] = await connection.query(`SHOW COLUMNS FROM \`${t}\``);
    const primaryKeyCols = (cols as any[]).filter(c => c.Key === 'PRI');
    if (primaryKeyCols.length === 0) {
      console.error(`[Verification Error] Table '${t}' is missing a PRIMARY KEY.`);
      await connection.end();
      process.exit(1);
    }
  }
  console.log("[Verification] Primary keys verified on all core tables.");

  const [usersCols] = await connection.query("SHOW COLUMNS FROM `users` WHERE Field = 'id'");
  const usersIdCol = (usersCols as any[])[0];
  if (!usersIdCol || !usersIdCol.Key.includes('PRI') || !usersIdCol.Extra.includes('auto_increment')) {
    console.error("[Verification Error] users.id must be primary key with auto_increment.");
    await connection.end();
    process.exit(1);
  }
  console.log("[Verification] users.id AUTO_INCREMENT + PRIMARY KEY verified.");

  const [poItemCols] = await connection.query("SHOW COLUMNS FROM `purchaseOrderItems` WHERE Field = 'receivedQuantity'");
  if ((poItemCols as any[]).length === 0) {
    console.error("[Verification Error] purchaseOrderItems.receivedQuantity column missing.");
    await connection.end();
    process.exit(1);
  }
  console.log("[Verification] purchaseOrderItems.receivedQuantity verified.");

  const specificEntities = ["goodsReceipts", "goodsReceiptItems", "stockMovements", "externalRequestReplays"];
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
