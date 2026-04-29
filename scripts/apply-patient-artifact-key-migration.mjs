import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const url = new URL(databaseUrl);
const databaseName = url.pathname.replace(/^\//, "");
const connection = await mysql.createConnection(databaseUrl);

async function ensureColumn(columnName, ddl) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'patients' AND COLUMN_NAME = ? LIMIT 1`,
    [databaseName, columnName],
  );

  if (Array.isArray(rows) && rows.length > 0) {
    console.log(`Column patients.${columnName} already exists; skipping.`);
    return;
  }

  await connection.execute(ddl);
  console.log(`Added patients.${columnName}.`);
}

try {
  await ensureColumn("barcodeImageKey", "ALTER TABLE `patients` ADD `barcodeImageKey` text");
  await ensureColumn("qrcodeImageKey", "ALTER TABLE `patients` ADD `qrcodeImageKey` text");
} finally {
  await connection.end();
}
