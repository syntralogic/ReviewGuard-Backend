import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { pool } from "../db";

async function migrate() {
  const schemaPath = path.join(__dirname, "..", "..", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query(sql);
    // eslint-disable-next-line no-console
    console.log("Schema applied successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed:", err);
  process.exit(1);
});
