// CSV import: how a firm WITHOUT Tool 1 gets started. They export their existing CRM or
// lead list and we ingest it, then score everything, turning a flat list into a ranked
// pipeline in one pass. Accepts { rows: [{name,email,phone,company,service_interest,...}] }.
import { one, query } from '../db/index.js';
import { scoreAndRoute } from '../lib/engine.js';
import { send, getFirmId, body } from '../lib/http.js';
import { checkAuth } from '../lib/auth.js';
import { rateLimit } from '../lib/ratelimit.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });
    const rl = await rateLimit(req, 'import', { max: 5, windowSec: 120 });
    if (!rl.ok) return send(res, 429, { error: 'too many requests' });
    const firmId = await getFirmId();
    const b = body(req);
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return send(res, 400, { error: 'no rows' });

    let imported = 0, skipped = 0;
    for (const row of rows.slice(0, 500)) {
      const email = (row.email || '').trim().toLowerCase();
      // Dedup by email so re-importing the same list does not create duplicates.
      if (email) {
        const dup = await one(`SELECT id FROM people WHERE firm_id=$1 AND lower(email)=$2`, [firmId, email]);
        if (dup) { skipped++; continue; }
      }
      const captured = {
        service_interest: row.service_interest || row.service || null,
        estimated_value: row.estimated_value ? Number(String(row.estimated_value).replace(/[^0-9.]/g, '')) || null : null,
        timeline: row.timeline || null,
        budget_signal: row.budget_signal || null,
        role: row.role || null,
        notes: row.notes || null,
      };
      const person = await one(
        `INSERT INTO people (firm_id, name, email, phone, company, source, captured)
         VALUES ($1,$2,$3,$4,$5,'csv-import',$6) RETURNING id, firm_id`,
        [firmId, row.name || null, row.email || null, row.phone || null, row.company || null, captured]
      );
      await query(`INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,'imported',$3)`,
        [person.id, firmId, { batch: true }]);
      await scoreAndRoute(person.id, { reason: 'import' });
      imported++;
    }
    return send(res, 200, { ok: true, imported, skipped });
  } catch (err) {
    console.error('[import]', err);
    return send(res, 500, { error: err.message });
  }
}
