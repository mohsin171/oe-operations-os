// Secure admin auth endpoint (invite-based email OTP).
//   GET               -> { authed, email }         (session check)
//   POST request      -> email a one-time code (only to allowlisted admins)
//   POST verify       -> check code, create session, set HttpOnly cookie
//   POST logout       -> destroy session, clear cookie
import { one } from '../db/index.js';
import {
  isAllowed, issueCode, verifyCode, createSession, getSession,
  destroySession, setSessionCookie, clearSessionCookie, sendOtpEmail,
} from '../lib/session.js';

export default async function handler(req, res) {
  const send = (c, o) => { res.statusCode = c; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  try {
    if (req.method === 'GET') {
      const s = await getSession(req);
      return send(200, { authed: !!s, email: s?.email || null });
    }
    if (req.method !== 'POST') return send(405, { error: 'method not allowed' });

    const action = req.body?.action;
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (action === 'request') {
      if (!email || !email.includes('@')) return send(400, { error: 'A valid email is required.' });
      // rate limit: max 5 code requests per email per 15 minutes
      const recent = await one(`SELECT count(*)::int n FROM login_codes WHERE email=$1 AND created_at > now() - interval '15 minutes'`, [email]);
      if (recent && recent.n >= 5) return send(200, { ok: true }); // silent, no enumeration
      const admin = await isAllowed(email);
      if (admin) {
        const code = await issueCode(email);
        await sendOtpEmail(email, code);
        // Local/dev only (no Resend key): reveal the code so login can be tested. Never in prod.
        if (!process.env.RESEND_API_KEY) return send(200, { ok: true, devCode: code });
      }
      // Identical response whether or not the email is allowlisted (prevents account enumeration).
      return send(200, { ok: true });
    }

    if (action === 'verify') {
      const code = String(req.body?.code || '').trim();
      if (!email || !code) return send(400, { error: 'Email and code are required.' });
      const admin = await isAllowed(email);
      if (!admin) return send(401, { error: 'Invalid or expired code.' });
      const v = await verifyCode(email, code);
      if (!v.ok) return send(401, { error: 'Invalid or expired code.' });
      const token = await createSession(email, admin.firm_id);
      setSessionCookie(res, token);
      return send(200, { ok: true, email });
    }

    if (action === 'logout') {
      await destroySession(req);
      clearSessionCookie(res);
      return send(200, { ok: true });
    }

    return send(400, { error: 'Unknown action.' });
  } catch (err) {
    console.error('auth error', err);
    return send(500, { error: 'Something went wrong.' });
  }
}
