// Applies db/schema.sql. Safe to run repeatedly (all statements use IF NOT EXISTS).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] schema applied.');
  await pool.end();
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
