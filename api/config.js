// Public config for the demo site + dashboard: firm identity, team, brand, and whether
// the AI brain and email sending are live (honest about mode).
import { CONFIG } from '../lib/config.js';
import { hasKey } from '../lib/anthropic.js';
import { canSendEmail } from '../lib/actions.js';
import { authRequired } from '../lib/auth.js';
import { getSession } from '../lib/session.js';
import { send } from '../lib/http.js';

export default async function handler(req, res) {
  let authed = false;
  try { authed = !!(await getSession(req)); } catch {}
  return send(res, 200, {
    authed,
    firm: {
      name: CONFIG.firm.name,
      vertical: CONFIG.firm.vertical,
      tagline: CONFIG.firm.tagline,
      team: CONFIG.firm.team,
    },
    brand: CONFIG.brand,
    scoring: { bands: CONFIG.scoring.bands },
    demoMode: CONFIG.demoMode,
    locked: authRequired(),
    mode: { ai: hasKey(), email: canSendEmail() },
  });
}
