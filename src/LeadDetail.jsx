import React, { useEffect, useState } from 'react';

const money = (n) => (n ? '$' + Number(n).toLocaleString('en-US') : null);
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null);

export default function LeadDetail({ id, onClose, onChanged, team, api, canWrite = true }) {
  const [data, setData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = async () => setData(await api(`/api/leads?id=${id}`));
  useEffect(() => { setData(null); setPreview(null); setToast(null); load(); }, [id]);

  const flash = (text, ok = true) => { setToast({ text, ok }); setTimeout(() => setToast(null), 4000); };
  const act = async (fn) => {
    setBusy(true);
    try { await fn(); await load(); await onChanged(); }
    catch (e) { flash('Something went wrong. Please try again.', false); }
    finally { setBusy(false); }
  };
  const post = (path, body) => api(path, { method: path === '/api/leads' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const runNurture = () => act(async () => {
    const r = await post('/api/nurture', { id, action: 'run', force: true });
    setPreview(null);
    if (r && r.ok) {
      flash(r.delivery && r.delivery.sent
        ? `Follow-up sent (step ${r.step}).`
        : `Follow-up written and logged (step ${r.step}). Email sending is off in demo mode.`);
    } else {
      flash(`Could not send: ${(r && r.reason) || 'unknown'}.`, false);
    }
  });
  const doPreview = async () => {
    setBusy(true);
    try { const p = await post('/api/nurture', { id, action: 'preview' }); setPreview(p.preview); }
    catch { flash('Could not generate a preview.', false); }
    finally { setBusy(false); }
  };
  const togglePause = (paused) => act(async () => { await post('/api/nurture', { id, action: paused ? 'pause' : 'resume' }); flash(paused ? 'Nurture paused.' : 'Nurture resumed.'); });
  const setStage = (stage) => act(async () => { await post('/api/leads', { id, stage }); flash(`Moved to ${stage}.`); });
  const reassign = (to) => act(async () => { await post('/api/leads', { id, assigned_to: to }); flash(`Assigned to ${to}.`); });
  const archive = async () => {
    setBusy(true);
    try { await post('/api/leads', { id, archive: true }); await onChanged(); onClose(); }
    catch { flash('Could not archive.', false); setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm('Permanently delete this lead and all of its history? This cannot be undone.')) return;
    setBusy(true);
    try { await post('/api/leads', { id, delete: true }); await onChanged(); onClose(); }
    catch { flash('Could not delete.', false); setBusy(false); }
  };

  if (!data) return <aside className="panel"><div className="panel-loading">Loading…</div></aside>;
  if (!data.lead) return <aside className="panel"><div className="panel-loading">Not found.</div></aside>;
  const l = data.lead;
  const c = l.captured || {};
  const band = l.score_band || 'cold';
  const reasons = l.score_reasons || [];
  const chat = (data.messages || []).filter((m) => m.channel === 'web');
  const outMsgs = (data.messages || []).filter((m) => m.channel !== 'web' && m.direction === 'out');

  return (
    <aside className="panel">
      <div className="panel-head">
        <div>
          <h2>{l.name || 'Unknown lead'}</h2>
          {l.company && <div className="muted">{l.company}{c.role ? ` · ${c.role}` : ''}</div>}
        </div>
        <button className="close" onClick={onClose}>✕</button>
      </div>

      {toast && <div className={'panel-toast' + (toast.ok ? '' : ' err')}>{toast.text}</div>}

      <div className={'score-hero ' + band}>
        <div className="sh-num">{l.score ?? '–'}</div>
        <div>
          <div className="sh-band" style={{ color: 'inherit' }}>{band}</div>
          <div className="sh-sum">{l.score_summary || 'Not yet scored.'}</div>
        </div>
      </div>

      {reasons.length > 0 && (
        <div className="panel-section">
          <h3>Why this score</h3>
          <ul className="reasons-list">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}

      {l.score_recommendation && (
        <div className="panel-section">
          <h3>Recommended next step</h3>
          <div className="reco-box">{l.score_recommendation}</div>
        </div>
      )}

      <div className="panel-section">
        <h3>Contact & enquiry</h3>
        {l.email && <div className="kv"><span>Email</span><span style={{ textTransform: 'none' }}>{l.email}</span></div>}
        {l.phone && <div className="kv"><span>Phone</span><span>{l.phone}</span></div>}
        {c.service_interest && <div className="kv"><span>Interest</span><span>{c.service_interest}</span></div>}
        {c.loan_purpose && <div className="kv"><span>Loan purpose</span><span>{c.loan_purpose}</span></div>}
        {c.buyer_type && <div className="kv"><span>Buyer type</span><span>{c.buyer_type}</span></div>}
        {money(c.estimated_value) && <div className="kv"><span>Loan amount</span><span>{money(c.estimated_value)}</span></div>}
        {c.property_value && <div className="kv"><span>Property value</span><span>{c.property_value}</span></div>}
        {c.timeline && <div className="kv"><span>Timeline</span><span>{c.timeline}</span></div>}
        <div className="kv"><span>Source</span><span>{l.source || 'unknown'}</span></div>
        <div className="kv"><span>Scored by</span><span>{l.score_mode === 'ai' ? 'AI' : 'rule-based'}</span></div>
        {l.assigned_to && <div className="kv"><span>Assigned</span><span>{l.assigned_to}</span></div>}
        {l.booking_at && <div className="kv"><span>Call booked</span><span>{new Date(l.booking_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></div>}
        {l.matter && <div className="muted" style={{ marginTop: 8 }}>{l.matter}</div>}
      </div>

      {chat.length > 0 && (
        <div className="panel-section">
          <h3>Conversation</h3>
          <div className="convo">
            {chat.map((m) => (
              <div key={m.id} className={'cbubble ' + (m.direction === 'in' ? 'cin' : 'cout')}>
                <div className="cbody">{m.body}</div>
              </div>
            ))}
          </div>
          {l.qualification_reason && <div className="muted" style={{ marginTop: 10 }}><b>AI read:</b> {l.qualification_reason}</div>}
        </div>
      )}

      {canWrite && (
      <div className="panel-actions">
        <div className="stage-move">
          <span className="pa-label">Move to</span>
          {[['new', 'New'], ['nurture', 'Nurturing'], ['hot', 'Hot'], ['engaged', 'Engaged'], ['won', 'Won'], ['lost', 'Lost']].map(([s, lbl]) => (
            <button key={s} className={'stage-btn' + (s === 'won' ? ' stage-btn-won' : s === 'lost' ? ' stage-btn-lost' : '') + (l.stage === s ? ' current' : '')}
              disabled={busy || l.stage === s} onClick={() => setStage(s)}>{l.stage === s ? '✓ ' + lbl : lbl}</button>
          ))}
        </div>
      </div>
      )}

      <div className="panel-section">
        <h3>Follow-up · step {l.nurture_step} of 5{l.nurture_paused ? ' · paused' : ''}{l.opted_out ? ' · opted out' : ''}</h3>
        {canWrite && (
        <div className="stage-move" style={{ marginBottom: 12 }}>
          <button className="stage-btn" disabled={busy} onClick={runNurture}>Send next</button>
          <button className="stage-btn" disabled={busy} onClick={doPreview}>Preview</button>
          <button className="stage-btn" disabled={busy} onClick={() => togglePause(!l.nurture_paused)}>{l.nurture_paused ? 'Resume' : 'Pause'}</button>
        </div>
        )}
        {outMsgs.length === 0 && <div className="muted">No follow-ups sent yet.</div>}
        {outMsgs.map((m) => (
          <div className="nurture-msg" key={m.id}>
            <div className="nm-h"><span>{fmt(m.created_at)}</span>{m.meta?.step && <span className="step-pill">step {m.meta.step}</span>}</div>
            <div className="nm-sub">{m.subject}</div>
            <div className="nm-body">{m.body}</div>
          </div>
        ))}
        {l.next_action_at && !l.nurture_paused && <div className="muted" style={{ marginTop: 6 }}>Next follow-up scheduled for {fmt(l.next_action_at)}.</div>}
        {preview && <div className="nurture-msg" style={{ marginTop: 10 }}><div className="nm-sub">{preview.subject}</div><div className="nm-body" style={{ maxHeight: 'none' }}>{preview.body}</div></div>}
      </div>

      {canWrite && team.length > 0 && (
        <div className="panel-section">
          <h3>Assign to</h3>
          <div className="stage-move">
            {team.map((t) => (
              <button key={t} className={'stage-btn' + (l.assigned_to === t ? ' current' : '')} disabled={busy || l.assigned_to === t} onClick={() => reassign(t)}>
                {l.assigned_to === t ? `✓ ${t.split(' ')[0]}` : t.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel-section">
        <h3>Audit trail</h3>
        <ul className="audit-list">
          {(data.events || []).map((e) => (
            <li key={e.id}>
              <span className="audit-when">{fmt(e.created_at)}</span>
              <b>{e.type.replace(/_/g, ' ')}</b>
              {e.detail?.to && <span>→ {e.detail.to}</span>}
              {e.detail?.step && <span>step {e.detail.step}</span>}
            </li>
          ))}
        </ul>
      </div>
      {canWrite && (
      <div className="panel-section manage-section">
        <h3>Manage</h3>
        <div className="stage-move">
          <button className="stage-btn" disabled={busy} onClick={archive}>Archive lead</button>
          <button className="stage-btn stage-btn-lost" disabled={busy} onClick={del}>Delete permanently</button>
        </div>
        <div className="manage-note">Archive hides the lead but keeps the record. Delete erases it and all its history, for a data-removal request.</div>
      </div>
      )}
    </aside>
  );
}
