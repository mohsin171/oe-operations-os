import React, { useState, useEffect } from 'react';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', viewer: 'Viewer' };
const ROLE_NOTE = {
  owner: 'Full access, can manage the team.',
  admin: 'Full dashboard access.',
  viewer: 'Read-only. Can view but not change.',
};

export default function TeamModal({ myRole, onClose }) {
  const [members, setMembers] = useState([]);
  const [me, setMe] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('admin');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const post = (b) => fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

  const load = async () => {
    setLoading(true);
    const r = await post({ action: 'team-list' });
    setMembers(r.members || []); setMe(r.me || ''); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const invite = async () => {
    setErr('');
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) { setErr('Enter a valid email address.'); return; }
    setBusy(true);
    const r = await post({ action: 'team-invite', email: e, name: name.trim(), role });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setName(''); setEmail(''); setRole('admin'); load();
  };
  const changeRole = async (em, rl) => { setErr(''); const r = await post({ action: 'team-role', email: em, role: rl }); if (r.error) { setErr(r.error); return; } load(); };
  const remove = async (em) => { setErr(''); if (!window.confirm(`Remove access for ${em}? Their active sessions end immediately.`)) return; const r = await post({ action: 'team-remove', email: em }); if (r.error) { setErr(r.error); return; } load(); };

  const roleOptions = myRole === 'owner' ? ['owner', 'admin', 'viewer'] : ['admin', 'viewer'];

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="team-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>✕</button>
        <h2>Team access</h2>
        <p className="tm-sub">People who can sign in to this dashboard. Access is by invitation only; each person signs in with a one-time code sent to their email.</p>

        <div className="tm-invite">
          <input className="tm-input tm-name" type="text" placeholder="Full name" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && invite()} />
          <input className="tm-input" type="email" placeholder="colleague@firm.com" value={email}
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && invite()} />
          <select className="tm-select" value={role} onChange={(e) => setRole(e.target.value)}>
            {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <button className="tool-btn primary" disabled={busy} onClick={invite}>{busy ? 'Adding…' : 'Add member'}</button>
        </div>
        <div className="tm-rolenote">{ROLE_NOTE[role]}</div>
        {err && <div className="tm-err">{err}</div>}

        <div className="tm-list">
          {loading ? <div className="tm-empty">Loading…</div> : members.length === 0 ? <div className="tm-empty">No members yet.</div> : members.map((m) => (
            <div className="tm-row" key={m.email}>
              <div className="tm-who">
                <div className="tm-name">{m.name || m.email.split('@')[0]}{m.email === me && <span className="tm-you">you</span>}</div>
                <div className="tm-email">{m.email}</div>
                <div className="tm-meta">{m.last_login_at ? 'Last in ' + new Date(m.last_login_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Not signed in yet'}</div>
              </div>
              <div className="tm-actions">
                <select className="tm-select sm" value={m.role}
                  disabled={m.email === me || (m.role === 'owner' && myRole !== 'owner')}
                  onChange={(e) => changeRole(m.email, e.target.value)}>
                  {(myRole === 'owner' ? ['owner', 'admin', 'viewer'] : ['admin', 'viewer']).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  {m.role === 'owner' && myRole !== 'owner' && <option value="owner">Owner</option>}
                </select>
                <button className="tm-remove" disabled={m.email === me} onClick={() => remove(m.email)} title="Remove access">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
