import React, { useEffect, useRef, useState, useCallback } from 'react';
import LeadDetail from './LeadDetail.jsx';

const STAGES = [
  { key: 'new', label: 'New', dot: 'new' },
  { key: 'nurture', label: 'Nurturing', dot: 'nurture' },
  { key: 'hot', label: 'Hot', dot: 'hot' },
  { key: 'engaged', label: 'Engaged', dot: 'engaged' },
  { key: 'won', label: 'Won', dot: 'won' },
];
const BANDS = [
  { key: 'hot', label: 'Hot', dot: 'hot' },
  { key: 'warm', label: 'Warm', dot: 'warm' },
  { key: 'cool', label: 'Cool', dot: 'cool' },
  { key: 'cold', label: 'Cold', dot: 'cold' },
];
const BAND_COLOR = { hot: '#C0473F', warm: '#4592DC', cool: '#3875AE', cold: '#9AA8BE' };

const money = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'm';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
  return '$' + n;
};
const timeAgo = (d) => {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  return Math.floor(s / 3600) + 'h ago';
};
const daysSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso)) / 864e5));

let ACCESS = '';
const api = (p, opts = {}) => {
  const headers = { ...(opts.headers || {}) };
  if (ACCESS) headers['x-access'] = ACCESS;
  return fetch(p, { ...opts, headers }).then((r) => r.json());
};

/* ---------- brand mark ---------- */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Orca Edge">
      <rect x="5" y="18" width="4.5" height="9" rx="1.4" fill="#fff" fillOpacity="0.95" />
      <rect x="13.75" y="12" width="4.5" height="15" rx="1.4" fill="#fff" fillOpacity="0.95" />
      <rect x="22.5" y="6" width="4.5" height="21" rx="1.4" fill="#fff" fillOpacity="0.95" />
      <circle cx="7.25" cy="13" r="2.1" fill="#fff" />
      <path d="M7.25 13 L16 8 L24.75 4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fillOpacity="0.9" />
    </svg>
  );
}

/* ---------- sidebar ---------- */
function Sidebar({ firm, stageCounts, bandCounts, total, hotWaiting, filter, onFilter, onHome }) {
  const activeStage = filter?.type === 'stage' ? filter.value : null;
  const activeBand = filter?.type === 'band' ? filter.value : null;
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <button className="brand brand-home" onClick={onHome} title="Back to overview">
          <div className="brand-mark"><Mark /></div>
          <div className="brand-text">
            <div className="brand-name">{firm || 'Rivergate'}</div>
            <div className="brand-sub">Operations OS</div>
          </div>
        </button>

        <div className="side-section">
          <div className="side-label">Pipeline</div>
          {STAGES.map((s) => (
            <button key={s.key} className={'side-item side-item-btn' + (activeStage === s.key ? ' active' : '')} onClick={() => onFilter({ type: 'stage', value: s.key })}>
              <span className={'side-dot ' + s.dot} />
              <span className="side-item-label">{s.label}</span>
              <span className="side-count">{stageCounts[s.key] || 0}</span>
            </button>
          ))}
        </div>

        <div className="side-section">
          <div className="side-label">Score bands</div>
          {BANDS.map((b) => (
            <button key={b.key} className={'side-item side-item-btn' + (activeBand === b.key ? ' active' : '')} onClick={() => onFilter({ type: 'band', value: b.key })}>
              <span className={'side-dot ' + b.dot} />
              <span className="side-item-label">{b.label}</span>
              <span className="side-count">{bandCounts[b.key] || 0}</span>
            </button>
          ))}
        </div>

        <div className="side-section">
          <div className="side-label">At a glance</div>
          <div className="side-item"><span className="side-item-label">Total leads</span><span className="side-count">{total}</span></div>
          {hotWaiting > 0 && (
            <button className="side-item side-item-btn attention-item" onClick={() => onFilter({ type: 'stage', value: 'hot' })}>
              <span className="side-item-label">Hot, waiting</span><span className="side-count urgent">{hotWaiting}</span>
            </button>
          )}
        </div>

        <div className="side-foot">Powered by Orca Edge</div>
      </div>
    </aside>
  );
}

/* ---------- topnav ---------- */
function TopNav({ lastUpdated, flash, tab, onTab, onOpenImport, onRun, running }) {
  const tabs = [{ key: 'overview', label: 'Overview' }, { key: 'pipeline', label: 'Pipeline' }, { key: 'reports', label: 'Reports' }];
  return (
    <header className="topnav">
      <div className="topnav-tabs">
        {tabs.map((t) => <button key={t.key} className={'tab' + (tab === t.key ? ' active' : '')} onClick={() => onTab(t.key)}>{t.label}</button>)}
      </div>
      <div className="topnav-actions">
        <div className={'live-badge' + (flash ? ' flash' : '')}>
          <span className="live-dot" /> Live{lastUpdated && <span className="updated"> · {timeAgo(lastUpdated)}</span>}
        </div>
        <button className="tool-btn" onClick={onOpenImport}>Import leads</button>
        <button className="tool-btn primary" onClick={onRun} disabled={running}>{running ? 'Running…' : 'Run pipeline'}</button>
      </div>
    </header>
  );
}

/* ---------- import modal ---------- */
function ImportModal({ onClose, onImport, onClearAll }) {
  const fileRef = React.useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [replace, setReplace] = useState(false);

  const run = async (rows) => {
    setBusy(true);
    const t0 = performance.now();
    if (replace) { try { await onClearAll(); } catch { /* continue */ } }
    const r = await onImport(rows);
    const secs = Math.max(0.4, (performance.now() - t0) / 1000);
    setBusy(false);
    setResult({ ...r, secs: secs.toFixed(1) });
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    run(parseCsv(await file.text())); e.target.value = '';
  };
  const useSample = async () => {
    const text = await fetch('/sample-leads.csv').then((r) => r.text());
    run(parseCsv(text));
  };
  const clearAll = async () => {
    if (!window.confirm('Delete every lead and all their history? This cannot be undone.')) return;
    setBusy(true);
    try { await onClearAll(); setResult({ imported: 0, skipped: 0, cleared: true, secs: '0.0' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>✕</button>
        {!result ? (
          <>
            <h2>Import a lead list</h2>
            <p className="im-sub">Drop in a CSV of your existing leads and the pipeline scores, ranks, and starts nurturing every one of them. Any export works: name, email, phone, company, service, value, and timeline are read automatically.</p>
            <div className={'dropzone' + (busy ? ' busy' : '')} onClick={() => !busy && fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onFile} />
              <div className="dz-icon">↑</div>
              <div className="dz-main">{busy ? 'Working…' : 'Choose a CSV file'}</div>
              <div className="dz-sub">or drag it here</div>
            </div>
            <label className="im-replace"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace existing leads (clear the current pipeline first)</label>
            <div className="im-or">
              <span>no list handy?</span>
              <button className="link-btn" onClick={useSample} disabled={busy}>Use a sample lead list</button>
              <a className="link-btn" href="/sample-leads.csv" download>Download the sample</a>
            </div>
            <div className="im-danger">
              <button className="link-btn danger" onClick={clearAll} disabled={busy}>Clear all leads</button>
            </div>
          </>
        ) : (
          <div className="im-result">
            <div className="im-check">✓</div>
            <h2>{result.cleared ? 'All leads cleared' : `${result.imported} leads imported`}</h2>
            <p className="im-sub">{result.cleared ? 'The pipeline is empty. Import a list to begin again.' : `Scored, ranked, and ready in ${result.secs}s${result.skipped ? ` · ${result.skipped} skipped as duplicates` : ''}.`}</p>
            <button className="tool-btn primary" onClick={onClose}>{result.cleared ? 'Close' : 'View the pipeline'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- stats ---------- */
function Stats({ stats, bandCounts }) {
  const bandOrder = ['hot', 'warm', 'cool', 'cold'];
  const totalBanded = bandOrder.reduce((s, b) => s + (bandCounts[b] || 0), 0) || 1;
  return (
    <section className="stats">
      <div className="stat hero">
        <div className="stat-value">{stats?.hotWaiting ?? '–'}</div>
        <div className="stat-label">Hot leads waiting</div>
        <div className="stat-note">{stats ? money(stats.byStage?.hot?.value) + ' in play' : ''}</div>
      </div>
      <div className="stat">
        <div className="stat-value">{stats ? money(stats.openValue) : '–'}</div>
        <div className="stat-label">Open pipeline</div>
        <div className="stat-note">total value in play</div>
      </div>
      <div className="stat value">
        <div className="stat-value">{stats ? money(stats.weightedValue) : '–'}</div>
        <div className="stat-label">Weighted forecast</div>
        <div className="stat-note">value × close probability</div>
      </div>
      <div className="stat">
        <div className="stat-value">{stats?.winRate != null ? stats.winRate + '%' : '–'}</div>
        <div className="stat-label">Win rate</div>
        <div className="stat-note">{stats ? `${stats.won} won · ${stats.lost} lost` : ''}</div>
      </div>
      <div className="stat hero" style={{ background: 'linear-gradient(140deg,#0F1826,#243b57)' }}>
        <div className="stat-value">{stats?.avgScore ?? '–'}</div>
        <div className="stat-label">Avg lead score</div>
        <div className="banddist">
          {bandOrder.map((b) => <span key={b} style={{ width: `${((bandCounts[b] || 0) / totalBanded) * 100}%`, background: BAND_COLOR[b] }} />)}
        </div>
      </div>
    </section>
  );
}

/* ---------- analytics ---------- */
function Analytics({ stats, leads, onOpen }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(r); }, []);
  const total = leads.length || 1;
  const open = leads.filter((l) => ['new', 'nurture', 'hot', 'engaged'].includes(l.stage)).length;
  const steps = [
    { label: 'Open', n: open, pct: Math.round((open / total) * 100) },
    { label: 'Hot', n: (stats?.byStage?.hot?.n) || 0, pct: Math.round((((stats?.byStage?.hot?.n) || 0) / total) * 100) },
    { label: 'Engaged', n: (stats?.byStage?.engaged?.n) || 0, pct: Math.round((((stats?.byStage?.engaged?.n) || 0) / total) * 100) },
    { label: 'Won', n: stats?.won || 0, pct: Math.round(((stats?.won || 0) / total) * 100) },
  ];
  const srcMax = Math.max(1, ...((stats?.sourcePerf || []).map((s) => s.total)));
  return (
    <div className="analytics-row">
      <div className="panel-box">
        <h3 className="box-title">Pipeline funnel</h3>
        <div className="funnel">
          {steps.map((s) => (
            <div key={s.label}>
              <div className="funnel-head"><span>{s.label}</span><strong>{s.n}</strong></div>
              <div className="funnel-bar"><div className="funnel-fill" style={{ width: (grown ? s.pct : 0) + '%' }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-box">
        <h3 className="box-title">Where leads come from</h3>
        <div className="channels">
          {(stats?.sourcePerf || []).map((s) => (
            <div className="chan-row" key={s.source}>
              <span className="chan-label" style={{ textTransform: 'capitalize' }}>{s.source}</span>
              <span className="chan-bar"><span className="chan-fill web" style={{ width: `${grown ? (s.total / srcMax) * 100 : 0}%` }} /></span>
              <span className="chan-n">{s.total}</span>
            </div>
          ))}
          {(!stats?.sourcePerf || stats.sourcePerf.length === 0) && <div className="box-empty">No sources yet.</div>}
        </div>
      </div>

      <div className="panel-box">
        <h3 className="box-title">What's closing</h3>
        {(stats?.closing || []).length === 0 && <div className="box-empty">Nothing in closing range yet.</div>}
        {(stats?.closing || []).map((c) => (
          <div className="rowline" key={c.id} onClick={() => onOpen(c.id)}>
            <div>
              <div className="rl-name">{c.name}</div>
              <div className="rl-sub">{c.svc || 'Enquiry'} · {c.stage}</div>
            </div>
            <span className="rl-right">{money(c.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- card ---------- */
function ScoreChip({ score, band }) {
  if (score == null) return <span className="score-chip none">–</span>;
  return <span className={'score-chip ' + band}>{score}<span className="sb">{band}</span></span>;
}
function Card({ lead, onClick, selected, draggable, onDragStart }) {
  const c = lead.captured || {};
  const reason = (lead.score_reasons && lead.score_reasons[0]) || null;
  return (
    <button className={'card band-' + (lead.score_band || 'cold') + (selected ? ' selected' : '')} onClick={() => onClick(lead)}
      draggable={draggable} onDragStart={onDragStart}>
      <div className="card-top">
        <strong>{lead.name || 'Unknown'}</strong>
        <ScoreChip score={lead.score} band={lead.score_band} />
      </div>
      {(lead.company || c.service_interest) && (
        <div className="card-matter">{lead.company ? lead.company + ' · ' : ''}{c.service_interest || ''}</div>
      )}
      <div className="card-fields">
        {c.estimated_value ? <span className="chip">{money(c.estimated_value)}</span> : null}
        {c.timeline ? <span className="chip">{c.timeline}</span> : null}
        {lead.assigned_to ? <span className="chip">{lead.assigned_to.split(' ')[0]}</span> : null}
      </div>
      <div className="card-meta">
        {lead.source && <span className="src-chip">{lead.source}</span>}
        <span className="ago">{timeAgo(lead.created_at)}</span>
      </div>
      {reason && <div className="card-reason">{reason}</div>}
    </button>
  );
}

/* ---------- stage pill ---------- */
const STAGE_LABEL = { new: 'New', nurture: 'Nurturing', hot: 'Hot', engaged: 'Engaged', won: 'Won', lost: 'Lost' };
function StagePill({ stage }) {
  return <span className={'stage-pill sp-' + stage}>{STAGE_LABEL[stage] || stage}</span>;
}

/* ---------- ranked list row (scales to hundreds) ---------- */
function LeadRow({ lead, onOpen, selected }) {
  const c = lead.captured || {};
  const reason = (lead.score_reasons && lead.score_reasons[0]) || null;
  return (
    <button className={'lrow band-' + (lead.score_band || 'cold') + (selected ? ' selected' : '')} onClick={() => onOpen(lead.id)}>
      <span className="lr-score"><ScoreChip score={lead.score} band={lead.score_band} /></span>
      <span className="lr-lead">
        <span className="lr-name">{lead.name || 'Unknown'}</span>
        {lead.company && <span className="lr-co">{lead.company}</span>}
      </span>
      <span className="lr-svc">{c.service_interest || '—'}{reason && <span className="lr-reason">{reason}</span>}</span>
      <span className="lr-val">{c.estimated_value ? money(c.estimated_value) : '—'}</span>
      <span className="lr-time">{c.timeline || '—'}</span>
      <span className="lr-stage"><StagePill stage={lead.stage} /></span>
      <span className="lr-src">{lead.source && <span className="src-chip">{lead.source}</span>}</span>
    </button>
  );
}

function LeadTable({ rows, onOpen, selectedId, sortBy, onSort }) {
  const Head = ({ col, label, sortable }) => (
    <span className={'lh lh-' + col + (sortable ? ' sortable' : '') + (sortBy === col ? ' active' : '')}
      onClick={sortable ? () => onSort(col) : undefined}>{label}{sortBy === col ? ' ↓' : ''}</span>
  );
  return (
    <div className="ltable">
      <div className="lrow lhead">
        <Head col="score" label="Score" sortable />
        <span className="lh lh-lead">Lead</span>
        <span className="lh lh-svc">Interest</span>
        <Head col="value" label="Value" sortable />
        <span className="lh lh-time">Timeline</span>
        <span className="lh lh-stage">Stage</span>
        <Head col="recent" label="Source" />
      </div>
      {rows.length === 0 && <div className="pipeline-empty">No leads match this filter.</div>}
      {rows.map((l) => <LeadRow key={l.id} lead={l} onOpen={onOpen} selected={selectedId === l.id} />)}
    </div>
  );
}

/* ---------- bounded board with drag-and-drop ---------- */
function Board({ byStage, onOpen, selectedId, onMove }) {
  const [dragOver, setDragOver] = useState(null);
  const [dragId, setDragId] = useState(null);
  return (
    <div className="pipeline">
      {STAGES.map((st) => {
        const inStage = byStage(st.key);
        const isOver = dragOver === st.key;
        return (
          <div className={'column' + (isOver ? ' drag-over' : '')} key={st.key}
            onDragOver={(e) => { e.preventDefault(); setDragOver(st.key); }}
            onDragLeave={() => setDragOver((cur) => (cur === st.key ? null : cur))}
            onDrop={(e) => { e.preventDefault(); setDragOver(null); if (dragId != null) onMove(dragId, st.key); setDragId(null); }}>
            <div className="column-head">
              <span className={'stage-dot ' + st.dot} />{st.label}
              <span className="count">{inStage.length}</span>
            </div>
            <div className="column-body column-scroll">
              {inStage.length === 0 && <div className="column-empty">Drop a lead here</div>}
              {inStage.map((l) => (
                <Card key={l.id} lead={l} onClick={() => onOpen(l.id)} selected={selectedId === l.id}
                  draggable onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = 'move'; }} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- top leads (compact, for the overview) ---------- */
function TopLeads({ leads, onOpen, onSeeAll }) {
  const top = [...leads].filter((l) => l.score != null).sort((a, b) => b.score - a.score).slice(0, 6);
  return (
    <div className="ltable compact">
      {top.map((l) => <LeadRow key={l.id} lead={l} onOpen={onOpen} />)}
      {leads.length > top.length && <button className="see-all" onClick={onSeeAll}>See all {leads.length} leads in the pipeline →</button>}
    </div>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('overview');
  const [filter, setFilter] = useState(null);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pipeView, setPipeView] = useState('list');
  const [sortBy, setSortBy] = useState('score');
  const prevIds = useRef(new Set());

  const load = useCallback(async () => {
    const [l, s, c] = await Promise.all([api('/api/leads'), api('/api/analytics'), cfg ? Promise.resolve(cfg) : api('/api/config')]);
    const incoming = l.leads || [];
    const seen = prevIds.current;
    if (seen.size && incoming.some((x) => !seen.has(x.id))) { setFlash(true); setTimeout(() => setFlash(false), 1500); }
    prevIds.current = new Set(incoming.map((x) => x.id));
    setLeads(incoming); setStats(s); if (!cfg) setCfg(c); setUpdatedAt(new Date());
  }, [cfg]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const runPipeline = async () => { setRunning(true); await api('/api/tick', { method: 'POST' }); await load(); setRunning(false); };
  const moveLeadToStage = async (leadId, stage) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage } : l)));
    await api('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: leadId, stage }) });
    load();
  };
  const doImport = async (rows) => {
    if (!rows || !rows.length) return { imported: 0, skipped: 0 };
    const r = await api('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
    await load();
    return r || { imported: 0, skipped: 0 };
  };
  const closeImport = () => { setImportOpen(false); };
  const clearAll = async () => {
    await api('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearAll: true }) });
    await load();
  };

  const byStage = (k) => leads.filter((l) => l.stage === k);
  const stageCounts = {}; STAGES.forEach((s) => { stageCounts[s.key] = byStage(s.key).length; });
  const bandCounts = {}; (stats?.bandDist || []).forEach((b) => { bandCounts[b.score_band] = b.n; });
  const total = leads.length;

  const showStats = tab === 'overview';
  const showAnalytics = tab === 'overview' || tab === 'reports';
  const stuck = stats?.stuck || [];

  const visible = filter
    ? (filter.type === 'stage' ? leads.filter((l) => l.stage === filter.value) : leads.filter((l) => l.score_band === filter.value))
    : leads;
  const sorted = [...visible].sort((a, b) => {
    if (sortBy === 'value') return (Number(b.captured?.estimated_value) || 0) - (Number(a.captured?.estimated_value) || 0);
    if (sortBy === 'recent') return new Date(b.created_at) - new Date(a.created_at);
    return (b.score ?? -1) - (a.score ?? -1);
  });

  return (
    <>
      <div className="shell">
        <div className="bg-glow bg-glow-1" /><div className="bg-glow bg-glow-2" />
        <span className="bg-ring bg-ring-1" /><span className="bg-ring bg-ring-2" />

        <Sidebar firm={cfg?.firm?.name?.split(' ')[0]} stageCounts={stageCounts} bandCounts={bandCounts}
          total={total} hotWaiting={stats?.hotWaiting || 0} filter={filter}
          onFilter={(f) => { setFilter((cur) => (cur && cur.type === f.type && cur.value === f.value) ? null : f); setTab('pipeline'); }}
          onHome={() => { setFilter(null); setTab('overview'); }} />

        <div className="workspace">
          <TopNav lastUpdated={updatedAt} flash={flash} tab={tab} onTab={(t) => { setTab(t); setFilter(null); }}
            onOpenImport={() => setImportOpen(true)} onRun={runPipeline} running={running} />

          <main className="main" key={tab + (filter ? filter.value : '')}>
            {total === 0 && (
              <div className="section">
                <div className="empty-hero">
                  <div className="eh-icon">↑</div>
                  <h2>Import your lead list to begin</h2>
                  <p>Drop in a CSV of your existing leads and the pipeline will score, rank, and start nurturing every one of them in seconds.</p>
                  <button className="tool-btn primary" onClick={() => setImportOpen(true)}>Import leads</button>
                </div>
              </div>
            )}
            {stats?.briefing && tab === 'overview' && (
              <div className="section"><div className="briefing"><span className="br-label">Today</span><span className="br-text">{stats.briefing}</span></div></div>
            )}

            {stats?.hotWaiting > 0 && tab === 'overview' && (
              <div className="section">
                <div className="attention" onClick={() => { setFilter({ type: 'stage', value: 'hot' }); setTab('pipeline'); }}>
                  <span className="attention-dot" />
                  {stats.hotWaiting} hot {stats.hotWaiting === 1 ? 'lead is' : 'leads are'} ready and waiting for your team.
                </div>
              </div>
            )}

            {showStats && (
              <div className="section">
                <div className="section-head"><span className="section-title">Today at a glance</span><span className="section-hint">live pipeline</span></div>
                <Stats stats={stats} bandCounts={bandCounts} />
              </div>
            )}

            {showAnalytics && (
              <div className="section">
                <div className="section-head"><span className="section-title">Performance</span><span className="section-hint">funnel, sources, what is closing</span></div>
                <Analytics stats={stats} leads={leads} onOpen={setSelectedId} />
              </div>
            )}

            {tab === 'overview' && total > 0 && (
              <div className="section">
                <div className="section-head"><span className="section-title">Top leads</span><span className="section-hint">highest scoring, right now</span></div>
                <TopLeads leads={leads} onOpen={setSelectedId} onSeeAll={() => { setTab('pipeline'); setFilter(null); }} />
              </div>
            )}

            {tab === 'pipeline' && (
              <div className="section">
                <div className="section-head">
                  <span className="section-title">Pipeline</span>
                  <span className="section-hint">{filter ? `filtered by ${filter.value} · ${sorted.length}` : `${leads.length} leads`}</span>
                  {filter && <button className="filter-active" onClick={() => setFilter(null)}>clear filter ✕</button>}
                  <div className="pipe-toolbar">
                    {pipeView === 'list' && (
                      <div className="sortbox">
                        <span>Sort</span>
                        {[['score', 'Score'], ['value', 'Value'], ['recent', 'Recent']].map(([k, lbl]) => (
                          <button key={k} className={'sort-opt' + (sortBy === k ? ' active' : '')} onClick={() => setSortBy(k)}>{lbl}</button>
                        ))}
                      </div>
                    )}
                    <div className="viewtoggle">
                      <button className={pipeView === 'list' ? 'active' : ''} onClick={() => setPipeView('list')}>List</button>
                      <button className={pipeView === 'board' ? 'active' : ''} onClick={() => setPipeView('board')}>Board</button>
                    </div>
                  </div>
                </div>
                {pipeView === 'list'
                  ? <LeadTable rows={sorted} onOpen={setSelectedId} selectedId={selectedId} sortBy={sortBy} onSort={setSortBy} />
                  : <Board byStage={byStage} onOpen={setSelectedId} selectedId={selectedId} onMove={moveLeadToStage} />}
              </div>
            )}

            {tab === 'reports' && stuck.length > 0 && (
              <div className="section">
                <div className="section-head"><span className="section-title">Needs attention</span><span className="section-hint">in nurture, quiet 14+ days</span></div>
                <div className="panel-box">
                  {stuck.map((s) => (
                    <div className="rowline" key={s.id} onClick={() => setSelectedId(s.id)}>
                      <div><div className="rl-name">{s.name}{s.company ? `, ${s.company}` : ''}</div><div className="rl-sub">{s.svc || 'Enquiry'}</div></div>
                      <span className="rl-right warn">{s.last_contacted_at ? daysSince(s.last_contacted_at) + 'd cold' : 'never contacted'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>

        {selectedId && <LeadDetail id={selectedId} onClose={() => setSelectedId(null)} onChanged={load} team={cfg?.firm?.team || []} api={api} />}
      </div>
      {importOpen && <ImportModal onClose={closeImport} onImport={doImport} onClearAll={clearAll} />}
    </>
  );
}

function parseCsv(text) {
  const rows = []; let field = '', row = [], q = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).filter((r) => r.some((c) => c && c.trim())).map((cells) => {
    const o = {}; headers.forEach((h, i) => { o[h] = (cells[i] || '').trim(); }); return o;
  });
}
