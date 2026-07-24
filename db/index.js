// Database connection. In production Neon injects POSTGRES_URL; locally we use DATABASE_URL.
// Same resolution order as Tool 1 so this app can point at its own DB (standalone) or
// Tool 1's shared DB (integrated) with a single connection-string change.
import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  console.warn('[db] No connection string set. Set DATABASE_URL (local) or POSTGRES_URL (Neon).');
}

const needsSSL = /neon|render|amazonaws|supabase|vercel/i.test(connectionString || '');

export const pool = new Pool({
  connectionString,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 10000,
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

// Small helper for single-row reads.
export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

export async function all(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}
