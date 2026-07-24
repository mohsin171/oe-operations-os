// The scheduler. Scores anything unscored, then sends every nurture that is due.
// Runs on a cron (see vercel.json) and can be triggered from the "Run pipeline now" button.
import { tick } from '../lib/engine.js';
import { send, getFirmId } from '../lib/http.js';
import { rateLimit } from '../lib/ratelimit.js';

export default async function handler(req, res) {
  try {
    const rl = await rateLimit(req, 'tick', { max: 6, windowSec: 60 });
    if (!rl.ok) return send(res, 429, { error: 'too many requests' });
    const firmId = await getFirmId();
    if (!firmId) return send(res, 200, { scored: 0, nurtured: 0, flagged_hot: 0 });
    const summary = await tick({ firmId });
    return send(res, 200, { ok: true, ...summary, at: new Date().toISOString() });
  } catch (err) {
    console.error('[tick]', err);
    return send(res, 500, { error: err.message });
  }
}
