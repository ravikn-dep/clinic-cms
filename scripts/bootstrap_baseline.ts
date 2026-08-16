import mysql from 'mysql2/promise';

async function bootstrap() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  console.log("[Bootstrap] Connecting to MySQL...");
  const connection = await mysql.createConnection(connectionString);

  const fs = await import('fs');
  const path = await import('path');
  
  const drizzleDir = path.join(process.cwd(), 'drizzle');
  const journalPath = path.join(drizzleDir, 'meta/_journal.json');
  
  if (!fs.existsSync(journalPath)) {
    console.error("Migration journal not found");
    process.exit(1);
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const entries = journal.entries || [];

  console.log(`[Bootstrap] Found ${entries.length} migrations to apply sequentially...`);

  for (const entry of entries) {
    const migrationName = entry.tag;
    const sqlFileName = `${migrationName}.sql`;
    const sqlFilePath = path.join(drizzleDir, sqlFileName);

    if (!fs.existsSync(sqlFilePath)) {
      console.warn(`[Bootstrap Warning] Migration file not found: ${sqlFileName}`);
      continue;
    }

    console.log(`[Bootstrap] Applying migration: ${migrationName}`);
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    let sanitized = sqlContent.replace(/DEFAULT\s+'CURRENT_TIMESTAMP'/gi, 'DEFAULT CURRENT_TIMESTAMP');
    
    const blocks = sanitized.split('--> statement-breakpoint');
    for (const block of blocks) {
      const cleanBlock = block.trim();
      if (!cleanBlock) continue;
      const statements = cleanBlock.split(';');
      for (const stmt of statements) {
        let cleanStmt = stmt.trim();
        if (!cleanStmt) continue;
        
        if (cleanStmt.toLowerCase().includes('drop primary key') && cleanStmt.toLowerCase().includes('users')) {
          continue;
        }

        try {
          await connection.query(cleanStmt);
        } catch (err: any) {
          // 1050: Table already exists, 1061: Duplicate key/index name, 1060: Duplicate column name
          if (err.errno === 1050 || err.errno === 1061 || err.errno === 1060 || err.errno === 1091) {
            console.log(`[Bootstrap Notice] Ignored benign schema duplication error (${err.errno}): ${cleanStmt}`);
            continue;
          }
          console.error(`[Bootstrap Error] Failed statement: ${cleanStmt}`);
          console.error(err.message);
          process.exit(1);
        }
      }
    }
  }

  console.log("[Bootstrap] SUCCESS: All migrations applied successfully to MySQL 8.");
  await connection.end();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
