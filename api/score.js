// Scoring API. POST { id } re-scores one lead; POST { all: true } scores every unscored
// lead. Re-scoring is how a lead's rank changes as new information arrives.
import { all } from '../db/index.js';
import { scoreAndRoute } from '../lib/engine.js';
import { send, getFirmId, body } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';
import { checkAuth } from '../lib/auth.js';
import { requireSession } from '../lib/session.js';

export default async function handler(req, res) {
  const _sess = await requireSession(req, res);
  if (!_sess) return;
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    if (!checkAuth(req)) return send(res, 401, { error: 'unauthorized' });
    const rl = await rateLimit(req, 'score', { max: 10, windowSec: 60 });
    if (!rl.ok) return send(res, 429, { error: 'too many requests' });
    const firmId = await getFirmId();
    const b = body(req);

    if (b.all) {
      const rows = await all(`SELECT id FROM people WHERE firm_id=$1 AND score IS NULL`, [firmId]);
      let n = 0;
      for (const r of rows) { await scoreAndRoute(r.id, { reason: 'manual-all' }); n++; }
      return send(res, 200, { scored: n });
    }
    if (!b.id) return send(res, 400, { error: 'id or all required' });
    const lead = await scoreAndRoute(Number(b.id), { reason: 'manual' });
    return send(res, 200, { lead });
  } catch (err) {
    console.error('[score]', err);
    return send(res, 500, { error: err.message });
  }
}
