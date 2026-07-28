import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log("Loading SQLite database...");
  const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
  const fileBuffer = fs.readFileSync(dbPath);
  
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);
  
  console.log("Reading wallets from SQLite...");
  // sql.js exec returns an array of results, one for each statement
  const res = db.exec("SELECT * FROM Wallet");
  
  if (res.length === 0) {
      console.log("No wallets found in SQLite database.");
      return;
  }
  
  const columns = res[0].columns;
  const values = res[0].values;
  
  const wallets = values.map(row => {
      const wallet: any = {};
      columns.forEach((col, i) => {
          wallet[col] = row[i];
      });
      return wallet;
  });

  console.log(`Found ${wallets.length} wallets.`);

  console.log("Inserting wallets into PostgreSQL...");
  let count = 0;
  for (const wallet of wallets) {
    try {
      await prisma.wallet.upsert({
        where: { address_chain: { address: wallet.address, chain: wallet.chain } },
        update: {},
        create: {
          address: wallet.address,
          chain: wallet.chain,
          label: wallet.label,
          riskScore: wallet.riskScore,
          smartScore: wallet.smartScore,
          isSuspectedBot: Boolean(wallet.isSuspectedBot),
          botType: wallet.botType,
          botConfidence: wallet.botConfidence,
          integrityFlags: wallet.integrityFlags,
          integrityPenalty: wallet.integrityPenalty,
        }
      });
      count++;
    } catch (e) {
      console.error(`Failed to insert wallet ${wallet.address}:`, e);
    }
  }

  console.log(`Successfully migrated ${count} wallets to PostgreSQL.`);
  
  await prisma.$disconnect();
}

migrate().catch(e => {
  console.error("Migration failed:", e);
  process.exit(1);
});
