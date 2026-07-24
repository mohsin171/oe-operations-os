// ============================================================================
// POST /api/chat  -  the client site's AI intake door.
// This is where capture (Tool 1) meets the spine (Tool 3). One turn:
//   find/create the person by session  ->  store the inbound message  ->
//   run the AI brain  ->  store the reply  ->  update the person's captured
//   fields  ->  score + route so the lead appears, ranked, on the dashboard.
// Same database, same record, one continuous journey.
// ============================================================================
import { randomUUID } from 'node:crypto';
import { query, one, all } from '../db/index.js';
import { runTurn } from '../lib/brain.js';
import { scoreAndRoute } from '../lib/engine.js';
import { CONFIG } from '../lib/config.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

async function getFirmId() {
  let f = await one(`SELECT id FROM firms WHERE slug=$1`, [CONFIG.firm.slug]);
  if (!f) f = await one(`INSERT INTO firms (slug,name,vertical) VALUES ($1,$2,$3) RETURNING id`,
    [CONFIG.firm.slug, CONFIG.firm.name, CONFIG.firm.vertical]);
  return f.id;
}

function parseContact(contact) {
  const c = (contact || '').trim();
  if (!c) return { email: null, phone: null };
  if (c.includes('@')) return { email: c, phone: null };
  return { email: null, phone: c.replace(/[^0-9+()\s-]/g, '') || null };
}

// Map mortgage fields into the shape the scorer reads, and keep the mortgage
// detail for the dashboard. This is the seam that lets one scorer serve any vertical.
function mapCaptured(prev, fields, matter) {
  const f = fields || {};
  const merged = { ...(prev || {}) };
  for (const k of ['loan_purpose', 'loan_amount', 'property_value', 'timeline', 'buyer_type']) {
    if (f[k]) merged[k] = f[k];
  }
  const svc = merged.loan_purpose || merged.buyer_type || null;
  if (svc) merged.service_interest = svc;
  if (merged.loan_amount) {
    const n = Number(String(merged.loan_amount).replace(/[^0-9.]/g, ''));
    if (n) merged.estimated_value = n;
  }
  if (matter && !merged.notes) merged.notes = matter;
  return merged;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ firmName: CONFIG.firm.name, accent: CONFIG.widget.accent, greeting: CONFIG.widget.greeting, bookingType: CONFIG.firm.bookingType, timezone: 'Europe/London' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ error: "Send a non-empty 'message'." });
    if (message.length > 2000) return res.status(400).json({ error: 'Message too long.' });
    const sessionId = req.body?.sessionId || randomUUID();
    const firmId = await getFirmId();

    let person = await one(`SELECT * FROM people WHERE firm_id=$1 AND session_id=$2`, [firmId, sessionId]);
    if (!person) {
      person = await one(
        `INSERT INTO people (firm_id, session_id, source, channel, stage, first_seen_at)
         VALUES ($1,$2,'website','web','new',now()) RETURNING *`,
        [firmId, sessionId]
      );
      await query(`INSERT INTO events (person_id,firm_id,type,detail) VALUES ($1,$2,'lead_created',$3)`,
        [person.id, firmId, { channel: 'web' }]);
    }

    const msgs = await all(`SELECT direction, body FROM messages WHERE person_id=$1 ORDER BY created_at ASC, id ASC`, [person.id]);
    const history = msgs.map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body }));
    history.push({ role: 'user', content: message });

    await query(`INSERT INTO messages (person_id,firm_id,channel,direction,body) VALUES ($1,$2,'web','in',$3)`,
      [person.id, firmId, message]);

    const turn = await runTurn({ history, channel: 'web' });

    await query(`INSERT INTO messages (person_id,firm_id,channel,direction,body) VALUES ($1,$2,'web','out',$3)`,
      [person.id, firmId, turn.reply]);

    const lead = turn.lead || {};
    const { email, phone } = parseContact(lead.contact);
    const captured = mapCaptured(person.captured, lead.fields, lead.matter);
    await query(
      `UPDATE people SET
         name = COALESCE(NULLIF($2,''), name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         matter = COALESCE(NULLIF($5,''), matter),
         urgency = COALESCE(NULLIF($6,''), urgency),
         qualification = COALESCE(NULLIF($7,''), qualification),
         qualification_reason = COALESCE(NULLIF($8,''), qualification_reason),
         captured = $9,
         handoff_needed = $10, handoff_trigger = $11, handoff_summary = $12,
         first_reply_at = COALESCE(first_reply_at, now()),
         last_contacted_at = now(), updated_at = now()
       WHERE id=$1`,
      [person.id, lead.name || '', email, phone, lead.matter || '', lead.urgency || '',
       lead.qualification || '', lead.qualification_reason || '', captured,
       !!turn.handoff?.needed, turn.handoff?.trigger || null, turn.handoff?.summary || null]
    );

    const acts = (turn.actions || []).map((a) => a.type);
    if (lead.qualification === 'qualified' || acts.includes('save_lead') || acts.includes('offer_booking')) {
      try { await scoreAndRoute(person.id, { reason: 'intake' }); } catch (e) { console.error('score-on-intake failed', e.message); }
    }

    const showBooking = acts.includes('offer_booking');
    res.status(200).json({ reply: turn.reply, sessionId, showBooking, bookingType: CONFIG.firm.bookingType, handoff: !!turn.handoff?.needed });
  } catch (err) {
    console.error('chat error', err);
    res.status(500).json({ reply: "Thanks for your message. I'm having a brief technical issue, so I've asked an adviser to follow up with you personally.", error: true });
  }
}
