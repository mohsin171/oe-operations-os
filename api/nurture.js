// Nurture API. POST { id, action }: 'run' sends the next nurture now, 'preview' generates
// it without sending, 'pause'/'resume' toggle automated follow-up for a lead.
import { one, query } from '../db/index.js';
import { runNurture } from '../lib/engine.js';
import { writeNurture } from '../lib/nurture.js';
import { CONFIG } from '../lib/config.js';
import { send, getFirmId, body } from '../lib/http.js';
import { checkAuth } from '../lib/auth.js';
import { requireSession } from '../lib/session.js';

export default async function handler(req, res) {
  const _sess = await requireSession(req, res);
  if (!_sess) return;
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });
    const firmId = await getFirmId();
    const b = body(req);
    const id = Number(b.id);
    if (!id) return send(res, 400, { error: 'id required' });
    const lead = await one(`SELECT * FROM people WHERE id=$1 AND firm_id=$2`, [id, firmId]);
    if (!lead) return send(res, 404, { error: 'not found' });

    const action = b.action || 'run';
    if (action === 'preview') {
      const step = Math.min(lead.nurture_step + 1, CONFIG.nurture.maxSteps);
      const msg = await writeNurture(lead, step);
      return send(res, 200, { preview: msg, step });
    }
    if (action === 'pause' || action === 'resume') {
      const paused = action === 'pause';
      await query(`UPDATE people SET nurture_paused=$1, updated_at=now() WHERE id=$2`, [paused, id]);
      return send(res, 200, { paused });
    }
    // run
    const result = await runNurture(id, { force: !!b.force });
    return send(res, 200, result);
  } catch (err) {
    console.error('[nurture]', err);
    return send(res, 500, { error: err.message });
  }
}
