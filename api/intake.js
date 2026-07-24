// Intake: a new lead arrives (from the demo site form, a lead ad, or Tool 1's chatbot in
// integrated mode). We save it as one row, then score and route it immediately, so it
// shows up on the dashboard already ranked. This is the capture -> convert handoff.
import { one, query } from '../db/index.js';
import { scoreAndRoute } from '../lib/engine.js';
import { send, getFirmId, body } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    const b = body(req);

    // Honeypot: bots fill hidden fields a human never sees. Accept silently, store nothing.
    if (b.website || b.hp || b._gotcha) return send(res, 200, { ok: true });

    // Rate limit public submissions to protect AI + email spend.
    const rl = await rateLimit(req, 'intake', { max: 5, windowSec: 60 });
    if (!rl.ok) return send(res, 429, { error: 'too many requests', retryAfter: rl.retryAfter });

    const firmId = await getFirmId();
    if (!firmId) return send(res, 500, { error: 'no firm configured' });

    const captured = {
      service_interest: b.service_interest || b.service || null,
      estimated_value: b.estimated_value ? Number(b.estimated_value) : null,
      timeline: b.timeline || null,
      budget_signal: b.budget_signal || null,
      role: b.role || null,
      notes: b.notes || b.message || null,
    };

    const person = await one(
      `INSERT INTO people (firm_id, name, email, phone, company, source, captured)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [firmId, b.name || null, b.email || null, b.phone || null, b.company || null,
       b.source || 'website', captured]
    );
    await query(`INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,'lead_created',$3)`,
      [person.id, firmId, { source: b.source || 'website' }]);

    const routed = await scoreAndRoute(person.id, { reason: 'intake' });
    return send(res, 200, { ok: true, lead: routed });
  } catch (err) {
    console.error('[intake]', err);
    return send(res, 500, { error: err.message });
  }
}
