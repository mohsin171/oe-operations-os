// Simple database-backed rate limiter. Protects the public write endpoints (which cost
// money: AI scoring, email) from being hit in a loop. Not perfect, but enough to stop
// casual abuse of a public demo without adding infrastructure.
import { query, one } from '../db/index.js';

export function clientIp(req) {
  const xf = req.headers?.['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Returns { ok } or { ok:false, retryAfter }. Counts hits in the trailing window.
export async function rateLimit(req, route, { max = 8, windowSec = 60 } = {}) {
  try {
    const ip = clientIp(req);
    const row = await one(
      `SELECT count(*)::int n FROM rate_hits
        WHERE route=$1 AND ip=$2 AND created_at > now() - ($3 || ' seconds')::interval`,
      [route, ip, windowSec]
    );
    if (row && row.n >= max) return { ok: false, retryAfter: windowSec };
    await query(`INSERT INTO rate_hits (ip, route) VALUES ($1,$2)`, [ip, route]);
    // opportunistic prune
    await query(`DELETE FROM rate_hits WHERE created_at < now() - interval '1 hour'`);
    return { ok: true };
  } catch {
    // On any limiter error, fail open (never block legitimate use because of the limiter).
    return { ok: true };
  }
}
