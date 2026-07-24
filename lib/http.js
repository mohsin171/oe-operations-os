// Small helpers shared by the serverless handlers.
import { one } from '../db/index.js';
import { CONFIG } from './config.js';

export function send(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function getFirmId() {
  const firm = await one(`SELECT id FROM firms WHERE slug = $1`, [CONFIG.firm.slug]);
  return firm ? firm.id : null;
}

// Vercel parses JSON bodies automatically; the local dev server does the same.
// This is a safety net if a raw string comes through.
export function body(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}
