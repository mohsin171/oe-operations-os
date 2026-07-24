// Secure admin auth: invite-based email OTP + server-side sessions.
// - Codes: 6 digits, hashed (sha256), expire in 10 min, single-use, attempt-capped.
// - Sessions: 32-byte random token in an HttpOnly/Secure/SameSite cookie; only the
//   token hash is stored, so a DB leak never exposes a usable session.
import crypto from 'node:crypto';
import { query, one } from '../db/index.js';
import { CONFIG } from './config.js';

const COOKIE = 'oe_session';
const CODE_TTL_MIN = 10;
const SESSION_TTL_DAYS = 7;
const MAX_ATTEMPTS = 5;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function readCookie(req, name = COOKIE) {
  const raw = req.headers?.cookie || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setSessionCookie(res, token) {
  const maxAge = SESSION_TTL_DAYS * 24 * 3600;
  res.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

// --- allowlist ---
export async function isAllowed(email) {
  const a = await one(`SELECT * FROM admins WHERE lower(email)=lower($1) AND active=true`, [email]);
  return a || null;
}

// --- OTP ---
export async function issueCode(email) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString();
  // invalidate any prior unused codes for this email
  await query(`UPDATE login_codes SET used=true WHERE email=$1 AND used=false`, [email]);
  await query(`INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1,$2,$3)`,
    [email, sha256(code), expires]);
  return code;
}

export async function verifyCode(email, code) {
  const row = await one(
    `SELECT * FROM login_codes WHERE email=$1 AND used=false ORDER BY created_at DESC LIMIT 1`, [email]);
  if (!row) return { ok: false, reason: 'no_code' };
  if (new Date(row.expires_at) < new Date()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) { await query(`UPDATE login_codes SET used=true WHERE id=$1`, [row.id]); return { ok: false, reason: 'too_many' }; }
  if (row.code_hash !== sha256(code)) {
    await query(`UPDATE login_codes SET attempts=attempts+1 WHERE id=$1`, [row.id]);
    return { ok: false, reason: 'bad_code' };
  }
  await query(`UPDATE login_codes SET used=true WHERE id=$1`, [row.id]);
  return { ok: true };
}

// --- sessions ---
export async function createSession(email, firmId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  await query(`INSERT INTO sessions (token_hash, email, firm_id, expires_at) VALUES ($1,$2,$3,$4)`,
    [sha256(token), email, firmId || null, expires]);
  return token;
}

export async function getSession(req) {
  const token = readCookie(req);
  if (!token) return null;
  const s = await one(`SELECT * FROM sessions WHERE token_hash=$1`, [sha256(token)]);
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) { await query(`DELETE FROM sessions WHERE id=$1`, [s.id]); return null; }
  return s;
}

export async function destroySession(req) {
  const token = readCookie(req);
  if (token) await query(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(token)]);
}

// Gate for data endpoints. Returns true if allowed to proceed; else sends 401 and returns false.
export async function requireSession(req, res) {
  const s = await getSession(req);
  if (s) return s;
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'unauthorized' }));
  return null;
}

// Transactional OTP email via Resend (bypasses demo-mode: this is auth, not marketing).
export async function sendOtpEmail(email, code) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'no-resend-key' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: CONFIG.firm.fromEmail,
        to: email,
        subject: `Your ${CONFIG.firm.name} sign-in code: ${code}`,
        text: `Your sign-in code is ${code}\n\nIt expires in ${CODE_TTL_MIN} minutes and can be used once.\nIf you did not request this, you can ignore this email.\n\n${CONFIG.firm.name} operations portal`,
      }),
    });
    if (!res.ok) return { sent: false, reason: `resend-${res.status}` };
    return { sent: true };
  } catch (e) { return { sent: false, reason: e.message }; }
}
