// GET /api/book  -> available fact-find call slots (booked ones excluded).
// POST /api/book -> confirm { sessionId, slotAt }. Atomic: a slot books once.
// Booking a call is strong intent, so the lead moves to 'engaged' on the pipeline.
import { query, one, all } from '../db/index.js';
import { CONFIG } from '../lib/config.js';
import { nextSlots } from '../lib/slots.js';
function cors(res){ res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','Content-Type'); res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS'); }
async function firmId(){ const f = await one(`SELECT id FROM firms WHERE slug=$1`, [CONFIG.firm.slug]); return f && f.id; }
function fmt(iso){ try { return new Intl.DateTimeFormat('en-GB',{ weekday:'long', day:'numeric', month:'long', hour:'numeric', minute:'2-digit', hour12:true, timeZone:'Europe/London' }).format(new Date(iso)); } catch { return iso; } }

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const fid = await firmId();

  if (req.method === 'GET') {
    let taken = [];
    try { taken = (await all(`SELECT slot_at FROM bookings WHERE firm_id=$1 AND status='confirmed'`, [fid])).map(r => new Date(r.slot_at).toISOString()); } catch {}
    const slots = nextSlots(8).filter(s => !taken.includes(s)).slice(0, 6);
    return res.status(200).json({ slots, bookingType: CONFIG.firm.bookingType });
  }

  if (req.method === 'POST') {
    try {
      const { sessionId, slotAt } = req.body || {};
      if (!sessionId || !slotAt) return res.status(400).json({ error: 'sessionId and slotAt required' });
      const person = await one(`SELECT * FROM people WHERE firm_id=$1 AND session_id=$2`, [fid, sessionId]);
      if (!person) return res.status(404).json({ error: 'session not found' });
      const ins = await one(
        `INSERT INTO bookings (firm_id,person_id,slot_at,slot_type) VALUES ($1,$2,$3,$4)
         ON CONFLICT (firm_id,slot_at) DO NOTHING RETURNING id`,
        [fid, person.id, slotAt, CONFIG.firm.bookingType]);
      if (!ins) return res.status(409).json({ error: 'slot taken' });
      await query(`UPDATE people SET booking_at=$2, booking_type=$3, stage='engaged', updated_at=now() WHERE id=$1`,
        [person.id, slotAt, CONFIG.firm.bookingType]);
      await query(`INSERT INTO events (person_id,firm_id,type,detail) VALUES ($1,$2,'booked',$3)`, [person.id, fid, { slot_at: slotAt }]);
      return res.status(200).json({ ok: true, slot: slotAt, confirm: `Your ${CONFIG.firm.bookingType} is booked for ${fmt(slotAt)}. An adviser will call you then. You'll get a confirmation shortly.` });
    } catch (err) { console.error('book error', err); return res.status(500).json({ error: 'Could not book that slot.' }); }
  }
  res.status(405).json({ error: 'Method not allowed' });
}
