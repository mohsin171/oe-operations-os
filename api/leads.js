// Leads API. GET list (optionally ?stage= or ?band=), GET one (?id=), and PATCH to
// change stage, reassign, or add a note. The single-lead view returns the full picture
// a partner needs: contact, captured fields, the score with its reasons, and the timeline.
import { all, one, query } from '../db/index.js';
import { send, getFirmId, body } from '../lib/http.js';
import { checkAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    const firmId = await getFirmId();
    if (!firmId) return send(res, 200, { leads: [] });

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

async function getList(req, res, firmId) {
  const stage = req.query && req.query.stage;
  const band = req.query && req.query.band;
  const clauses = ['firm_id = $1', 'archived = false'];
  const params = [firmId];
  if (stage) { params.push(stage); clauses.push(`stage = $${params.length}`); }
  if (band) { params.push(band); clauses.push(`score_band = $${params.length}`); }
  const leads = await all(
    `SELECT id, name, email, phone, company, source, stage, score, score_band,
            score_reasons, score_summary, score_recommendation, score_mode,
            captured, nurture_step, nurture_paused, next_action_at, last_contacted_at,
            assigned_to, created_at, updated_at
       FROM people WHERE ${clauses.join(' AND ')}
       ORDER BY (score IS NULL) DESC, score DESC, created_at DESC`,
    params
  );
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
  return send(res, 200, { lead, messages, events });
}

async function patch(req, res, firmId) {
  if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });
  const b = body(req);
  const id = Number(b.id);
  if (!id) return send(res, 400, { error: 'id required' });
  const lead = await one(`SELECT * FROM people WHERE id = $1 AND firm_id = $2`, [id, firmId]);
  if (!lead) return send(res, 404, { error: 'not found' });

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
