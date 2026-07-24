// Leads API. GET list (optionally ?stage= or ?band=), GET one (?id=), and PATCH to
// change stage, reassign, or add a note. The single-lead view returns the full picture
// a partner needs: contact, captured fields, the score with its reasons, and the timeline.
import { all, one, query } from '../db/index.js';
import { send, getFirmId, body } from '../lib/http.js';
import { checkAuth } from '../lib/auth.js';
import { requireSession, rank } from '../lib/session.js';

export default async function handler(req, res) {
  const _sess = await requireSession(req, res);
  if (!_sess) return;
  if ((req.method === 'PATCH' || req.method === 'POST') && rank(_sess.role) < rank('admin')) return send(res, 403, { error: 'forbidden' });
  try {
    const firmId = await getFirmId();
    if (!firmId) return send(res, 200, { leads: [] });

    if (req.method === 'GET' && req.query && req.query.view === 'inbox') {
      return await getInbox(req, res, firmId);
    }
    if (req.method === 'GET' && req.query && req.query.id) {
      return await getOne(req, res, firmId, Number(req.query.id));
    }
    if (req.method === 'GET') {
      return await getList(req, res, firmId);
    }
    if (req.method === 'PATCH' || req.method === 'POST') {
      const b = body(req);
      if (b.clearAll) {
        if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });
        const del = await query(`DELETE FROM people WHERE firm_id = $1`, [firmId]);
        return send(res, 200, { ok: true, cleared: del.rowCount });
      }
      return await patch(req, res, firmId);
    }
    return send(res, 405, { error: 'method not allowed' });
  } catch (err) {
    console.error('[leads]', err);
    return send(res, 500, { error: err.message });
  }
}

async function getInbox(req, res, firmId) {
  const rows = await all(
    `SELECT p.id, p.name, p.email, p.phone, p.stage, p.score, p.score_band, p.channel,
            p.handoff_needed, p.qualification,
            (SELECT body FROM messages m WHERE m.person_id=p.id ORDER BY created_at DESC LIMIT 1) AS last_body,
            (SELECT direction FROM messages m WHERE m.person_id=p.id ORDER BY created_at DESC LIMIT 1) AS last_dir,
            (SELECT max(created_at) FROM messages m WHERE m.person_id=p.id) AS last_at
       FROM people p
      WHERE p.firm_id=$1 AND p.archived=false
        AND EXISTS (SELECT 1 FROM messages m WHERE m.person_id=p.id)
      ORDER BY p.handoff_needed DESC, last_at DESC NULLS LAST`,
    [firmId]
  );
  return send(res, 200, { conversations: rows });
}

async function getList(req, res, firmId) {
  const stage = req.query && req.query.stage;
  const band = req.query && req.query.band;
  const clauses = ['firm_id = $1', 'archived = false'];
  const params = [firmId];
  if (stage) { params.push(stage); clauses.push(`stage = $${params.length}`); }
  if (band) { params.push(band); clauses.push(`score_band = $${params.length}`); }
  const rows = await all(
    `SELECT * FROM people WHERE ${clauses.join(' AND ')}
       ORDER BY (score IS NULL) DESC, score DESC, created_at DESC`,
    params
  );
  const leads = rows.map((l) => ({ ...l, fields: l.captured, contact: l.email || l.phone || null }));
  return send(res, 200, { leads });
}

async function getOne(req, res, firmId, id) {
  const lead = await one(`SELECT * FROM people WHERE id = $1 AND firm_id = $2`, [id, firmId]);
  if (!lead) return send(res, 404, { error: 'not found' });
  const messages = await all(
    `SELECT id, channel, direction, subject, body, meta, created_at
       FROM messages WHERE person_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  const events = await all(
    `SELECT id, type, detail, created_at FROM events WHERE person_id = $1 ORDER BY created_at DESC LIMIT 40`,
    [id]
  );
  const person = { ...lead, fields: lead.captured || {}, contact: lead.email || lead.phone || null };
  return send(res, 200, { lead, person, contact: person.contact, fields: person.fields, messages, events });
}

async function patch(req, res, firmId) {
  if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });
  const b = body(req);
  const id = Number(b.id);
  if (!id) return send(res, 400, { error: 'id required' });
  const lead = await one(`SELECT * FROM people WHERE id = $1 AND firm_id = $2`, [id, firmId]);
  if (!lead) return send(res, 404, { error: 'not found' });

  // Tool 1 dashboard sends action-style payloads; normalise them.
  if (b.action === 'delete') b.delete = true;
  if (b.action === 'stage' && b.stage) { /* falls through to stage handler below */ }
  if (b.action === 'notes') {
    await query(`UPDATE people SET notes=$2, updated_at=now() WHERE id=$1`, [id, String(b.notes || '')]);
    return send(res, 200, { ok: true });
  }

  // Human reply from the dashboard (stored in the thread; for live channels it dispatches too).
  if (b.reply && String(b.reply).trim()) {
    const text = String(b.reply).trim();
    const channel = b.method || lead.channel || 'web';
    await query(`INSERT INTO messages (person_id,firm_id,channel,direction,body) VALUES ($1,$2,$3,'out',$4)`,
      [id, firmId, channel, text]);
    await query(`UPDATE people SET last_contacted_at=now(), handoff_needed=false, updated_at=now() WHERE id=$1`, [id]);
    await query(`INSERT INTO events (person_id,firm_id,type,detail) VALUES ($1,$2,'human_reply',$3)`, [id, firmId, { channel }]);
    return send(res, 200, { ok: true, channel });
  }
  // Internal note (private, never sent to the lead).
  if (b.note && String(b.note).trim()) {
    await query(`INSERT INTO events (person_id,firm_id,type,detail) VALUES ($1,$2,'note',$3)`, [id, firmId, { note: String(b.note).trim() }]);
    await query(`UPDATE people SET updated_at=now() WHERE id=$1`, [id]);
    return send(res, 200, { ok: true });
  }

  // Permanent delete (data-protection erasure). Cascades to messages and events.
  if (b.delete) {
    await query(`DELETE FROM people WHERE id = $1`, [id]);
    return send(res, 200, { ok: true, deleted: true });
  }
  // Soft archive / unarchive (reversible hide).
  if (b.archive !== undefined) {
    await query(`UPDATE people SET archived = $1, updated_at = now() WHERE id = $2`, [!!b.archive, id]);
    await query(`INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,'note_added',$3)`,
      [id, firmId, { note: b.archive ? 'Archived' : 'Unarchived' }]);
    const updated = await one(`SELECT * FROM people WHERE id=$1`, [id]);
    return send(res, 200, { lead: updated });
  }

  if (b.stage) {
    const valid = ['new', 'nurture', 'hot', 'engaged', 'won', 'lost'];
    if (!valid.includes(b.stage)) return send(res, 400, { error: 'invalid stage' });
    const clearNurture = ['engaged', 'won', 'lost', 'hot'].includes(b.stage);
    await query(
      `UPDATE people SET stage=$1, next_action_at=${clearNurture ? 'NULL' : 'next_action_at'}, updated_at=now() WHERE id=$2`,
      [b.stage, id]
    );
    await query(`INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,'stage_changed',$3)`,
      [id, firmId, { from: lead.stage, to: b.stage, by: 'user' }]);
  }
  if (b.assigned_to !== undefined) {
    await query(`UPDATE people SET assigned_to=$1, updated_at=now() WHERE id=$2`, [b.assigned_to, id]);
    await query(`INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,'assigned',$3)`,
      [id, firmId, { to: b.assigned_to }]);
  }
  if (b.note) {
    await query(`INSERT INTO events (person_id, firm_id, type, detail) VALUES ($1,$2,'note_added',$3)`,
      [id, firmId, { note: b.note }]);
  }

  const updated = await one(`SELECT * FROM people WHERE id=$1`, [id]);
  return send(res, 200, { lead: updated });
}
