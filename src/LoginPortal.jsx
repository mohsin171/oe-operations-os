import React, { useState } from 'react';

// Secure admin sign-in: enter email -> receive a one-time code -> enter code.
// Invite-based: only allowlisted admin emails receive a code.
export default function LoginPortal({ firmName, onAuthed }) {
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [devCode, setDevCode] = useState('');

  const post = (body) =>
    fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => r.json());

  const requestCode = async () => {
    setErr(''); setNote('');
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@')) { setErr('Please enter a valid email address.'); return; }
    setBusy(true);
    try {
      const r = await post({ action: 'request', email: e });
      if (r.error) { setErr(r.error); }
      else {
        setStep('code');
        setNote('If that email is authorised, a 6-digit code is on its way. It expires in 10 minutes.');
        if (r.devCode) setDevCode(r.devCode); // local/dev only
      }
    } catch { setErr('Something went wrong. Please try again.'); }
    setBusy(false);
  };

  const verify = async () => {
    setErr('');
    const c = code.trim();
    if (!/^\d{6}$/.test(c)) { setErr('Enter the 6-digit code from your email.'); return; }
    setBusy(true);
    try {
      const r = await post({ action: 'verify', email: email.trim().toLowerCase(), code: c });
      if (r.ok) { onAuthed(); }
      else { setErr(r.error || 'Invalid or expired code.'); }
    } catch { setErr('Something went wrong. Please try again.'); }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-bg-glow g1" /><div className="login-bg-glow g2" />
      <div className="login-card">
        <div className="login-brand">
          <div className="login-mark"><span></span></div>
          <div>
            <div className="login-firm">{firmName || 'Rivergate Mortgages'}</div>
            <div className="login-sub">Operations OS</div>
          </div>
        </div>

        {step === 'email' ? (
          <>
            <h1>Sign in</h1>
            <p className="login-lead">Enter your work email and we'll send you a one-time code. Access is limited to authorised team members.</p>
            <label className="login-label">Work email</label>
            <input
              className="login-input" type="email" autoFocus value={email} placeholder="you@firm.com"
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && requestCode()}
            />
            {err && <div className="login-err">{err}</div>}
            <button className="login-btn" disabled={busy} onClick={requestCode}>{busy ? 'Sending…' : 'Send code'}</button>
          </>
        ) : (
          <>
            <h1>Enter your code</h1>
            <p className="login-lead">We sent a 6-digit code to <b>{email}</b>. It expires in 10 minutes.</p>
            <label className="login-label">6-digit code</label>
            <input
              className="login-input login-code" inputMode="numeric" maxLength={6} autoFocus value={code}
              placeholder="••••••" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && verify()}
            />
            {devCode && <div className="login-note">Dev mode (no email configured): your code is <b>{devCode}</b></div>}
            {note && !devCode && <div className="login-note">{note}</div>}
            {err && <div className="login-err">{err}</div>}
            <button className="login-btn" disabled={busy} onClick={verify}>{busy ? 'Verifying…' : 'Verify and sign in'}</button>
            <button className="login-link" disabled={busy} onClick={() => { setStep('email'); setCode(''); setErr(''); setDevCode(''); }}>Use a different email</button>
          </>
        )}

        <div className="login-foot">Protected by one-time codes and encrypted sessions. Secured over HTTPS.</div>
      </div>
    </div>
  );
}
