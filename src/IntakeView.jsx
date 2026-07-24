import React, { useState, useEffect, useCallback, useRef } from 'react';

const BAND_COLOR = { hot: 'var(--hot)', warm: 'var(--warm)', cool: 'var(--cool)', cold: 'var(--cold)' };

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

export default function IntakeView({ api, canWrite, onOpenInPipeline }) {
  const [convos, setConvos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const threadRef = useRef(null);

  const loadInbox = useCallback(async () => {
    try { const r = await api('/api/leads?view=inbox'); setConvos(r.conversations || []); } catch {}
    setLoading(false);
  }, [api]);

  const loadThread = useCallback(async (id) => {
    if (!id) return;
    try { const r = await api('/api/leads?id=' + id); setThread(r); } catch {}
  }, [api]);

  useEffect(() => { loadInbox(); }, [loadInbox]);
  useEffect(() => { const t = setInterval(() => { loadInbox(); if (selectedId) loadThread(selectedId); }, 8000); return () => clearInterval(t); }, [loadInbox, loadThread, selectedId]);
  useEffect(() => { if (selectedId) loadThread(selectedId); }, [selectedId, loadThread]);
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [thread]);

  const sendReply = async () => {
    const text = reply.trim(); if (!text || !selectedId) return;
    setBusy(true);
    try { await api('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedId, reply: text }) }); setReply(''); await loadThread(selectedId); await loadInbox(); } catch {}
    setBusy(false);
  };
  const addNote = async () => {
    const text = note.trim(); if (!text || !selectedId) return;
    setBusy(true);
    try { await api('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedId, note: text }) }); setNote(''); await loadThread(selectedId); } catch {}
    setBusy(false);
  };

  const lead = thread?.lead;
  const messages = (thread?.messages || []);
  const notes = (thread?.events || []).filter((e) => e.type === 'note').map((e) => ({ ...e, text: e.detail?.note })).filter((n) => n.text);
  const cap = lead?.captured || {};

  return (
    <div className="intake">
      {/* inbox */}
      <div className="inbox">
        <div className="inbox-head">
          <span className="inbox-title">Conversations</span>
          <span className="inbox-count">{convos.length}</span>
        </div>
        <div className="inbox-list">
          {loading ? <div className="inbox-empty">Loading…</div>
            : convos.length === 0 ? <div className="inbox-empty">No conversations yet. When a visitor chats on your site, they appear here.</div>
            : convos.map((c) => (
              <button key={c.id} className={'inbox-item' + (c.id === selectedId ? ' active' : '')} onClick={() => setSelectedId(c.id)}>
                <div className="ii-top">
                  <span className="ii-name">{c.name || c.email || c.phone || 'New visitor'}</span>
                  <span className="ii-time">{timeAgo(c.last_at)}</span>
                </div>
                <div className="ii-snippet">{c.last_dir === 'in' ? '' : '↩ '}{c.last_body || '…'}</div>
                <div className="ii-tags">
                  <span className="ii-chan">{c.channel || 'web'}</span>
                  {c.score_band && <span className="ii-band" style={{ color: BAND_COLOR[c.score_band] }}>● {c.score_band}</span>}
                  {c.handoff_needed && <span className="ii-handoff">needs a human</span>}
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* thread */}
      <div className="thread">
        {!lead ? (
          <div className="thread-empty"><div className="te-icon">💬</div><p>Select a conversation to view the full thread, reply, and add notes.</p></div>
        ) : (
          <>
            <div className="thread-head">
              <div>
                <div className="th-name">{lead.name || 'New visitor'}
                  {lead.score_band && <span className="th-band" style={{ color: BAND_COLOR[lead.score_band] }}>● {lead.score_band}{lead.score != null ? ' · ' + lead.score : ''}</span>}
                </div>
                <div className="th-contact">{[lead.email, lead.phone].filter(Boolean).join(' · ') || 'No contact captured yet'}</div>
              </div>
              {onOpenInPipeline && <button className="tool-btn" onClick={() => onOpenInPipeline(lead.id)}>View in pipeline →</button>}
            </div>

            {(cap.service_interest || cap.loan_purpose || cap.timeline || lead.matter) && (
              <div className="th-captured">
                {cap.loan_purpose && <span className="thc"><b>Purpose</b> {cap.loan_purpose}</span>}
                {cap.buyer_type && <span className="thc"><b>Buyer</b> {cap.buyer_type}</span>}
                {cap.estimated_value ? <span className="thc"><b>Loan</b> ${Number(cap.estimated_value).toLocaleString()}</span> : null}
                {cap.timeline && <span className="thc"><b>Timeline</b> {cap.timeline}</span>}
              </div>
            )}

            {lead.handoff_needed && <div className="th-alert">This conversation was flagged for a human. {lead.handoff_summary || ''}</div>}

            <div className="thread-msgs" ref={threadRef}>
              {messages.map((m) => (
                <div key={m.id} className={'cbubble ' + (m.direction === 'in' ? 'cin' : 'cout')}>
                  {m.subject && <div className="cb-subj">{m.subject}</div>}
                  <div className="cbody">{m.body}</div>
                  <div className="cb-meta">{m.channel}{m.direction === 'out' ? ' · sent' : ''} · {timeAgo(m.created_at)} ago</div>
                </div>
              ))}
            </div>

            {canWrite ? (
              <div className="reply-bar">
                <textarea className="reply-input" rows={2} placeholder="Reply to this lead…" value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(); }} />
                <button className="tool-btn primary" disabled={busy || !reply.trim()} onClick={sendReply}>Send</button>
              </div>
            ) : <div className="reply-bar readonly">You have read-only access.</div>}

            {/* internal notes */}
            <div className="notes-panel">
              <div className="notes-title">Internal notes <span>private to your team</span></div>
              {canWrite && (
                <div className="note-add">
                  <input className="note-in" placeholder="Add a note…" value={note}
                    onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
                  <button className="tool-btn" disabled={busy || !note.trim()} onClick={addNote}>Add</button>
                </div>
              )}
              <div className="notes-list">
                {notes.length === 0 ? <div className="notes-empty">No notes yet.</div>
                  : notes.map((n) => <div className="note-row" key={n.id}><div className="note-text">{n.text}</div><div className="note-time">{timeAgo(n.created_at)} ago</div></div>)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
