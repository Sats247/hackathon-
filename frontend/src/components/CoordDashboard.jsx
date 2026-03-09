import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost, t } from '../api';
import { Snackbar, StatusBadge, CatBadge } from './Shared';

export function CoordDashboard({ onLogout }) {
    const [stats, setStats] = useState(null);
    const [reports, setReports] = useState([]);
    const [workers, setWorkers] = useState([]);
    const [events, setEvents] = useState([]);
    const [tab, setTab] = useState('pulse'); // pulse, triage, validate, analytics, events
    const [snack, setSnack] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [rejectModal, setRejectModal] = useState(null);
    const [rejectNote, setRejectNote] = useState('');
    const [eventForm, setEventForm] = useState({ event_name: '', event_date: '', location: '', description: '', organized_by: '' });
    const chartsRef = useRef({});

    const loadAll = async () => {
        const [st, rp, wk, ev] = await Promise.all([
            apiGet('/api/reports/analytics'), apiGet('/api/reports?sort_by=status'),
            apiGet('/api/workers'), apiGet('/api/events')
        ]);
        if (st.ok) setStats(st.data);
        if (rp.ok) setReports(rp.data);
        if (wk.ok) setWorkers(wk.data);
        if (ev.ok) setEvents(ev.data);
    };
    useEffect(() => { loadAll(); }, []);

    // ── Charts ──────────────────────────────────────────
    useEffect(() => {
        if (tab !== 'analytics' || !stats) return;
        const makeChart = (id, type, data, options) => {
            const ctx = document.getElementById(id);
            if (!ctx) return;
            if (chartsRef.current[id]) chartsRef.current[id].destroy();
            chartsRef.current[id] = new window.Chart(ctx, { type, data, options: { responsive: true, maintainAspectRatio: false, ...options } });
        };

        const cats = stats.by_category;
        const statuses = stats.by_status;
        const daily = stats.daily;

        makeChart('daily', 'line', {
            labels: daily.map(d => d.day.slice(5)),
            datasets: [{ label: 'Reports/day', data: daily.map(d => d.count), borderColor: '#2E6DA4', backgroundColor: 'rgba(46,109,164,0.1)', tension: 0.4, fill: true }]
        }, {});

        const statusColors = { pending: '#E74C3C', in_progress: '#F39C12', resolved: '#27AE60' };
        makeChart('status', 'doughnut', {
            labels: statuses.map(s => s.status),
            datasets: [{ data: statuses.map(s => s.count), backgroundColor: statuses.map(s => statusColors[s.status] || '#888') }]
        }, { cutout: '70%' });

        const catColors = ['#9b59b6', '#3498db', '#e67e22', '#2c3e50', '#95a5a6'];
        makeChart('cat', 'bar', {
            labels: cats.map(c => c.category),
            datasets: [{ label: 'Issues', data: cats.map(c => c.count), backgroundColor: catColors }]
        }, { plugins: { legend: { display: false } } });
    }, [tab, stats]);

    // ── Actions ──────────────────────────────────────────
    const assignWorker = async (reportId, workerName) => {
        if (!workerName) return;
        await apiPost(`/api/reports/${reportId}/assign`, { worker: workerName });
        setSnack('Worker assigned!'); loadAll();
    };

    const approveReport = async (id) => { await apiPost(`/api/reports/${id}/approve`); setSnack('Resolution approved!'); loadAll(); };
    const rejectReport = async () => { await apiPost(`/api/reports/${rejectModal}/reject`, { note: rejectNote }); setRejectModal(null); setSnack('Resolution rejected.'); loadAll(); };

    const createEvent = async (e) => {
        e.preventDefault();
        const r = await apiPost('/api/events', eventForm);
        if (r.ok) { setSnack('Event created!'); setEventForm({ event_name: '', event_date: '', location: '', description: '', organized_by: '' }); loadAll(); }
    };

    const redReports = reports.filter(r => r.status === 'pending' && (!filterCat || r.category === filterCat));
    const greenReports = reports.filter(r => r.status === 'resolved');

    const tabs = [
        { key: 'pulse', label: '📊 Pulse' },
        { key: 'triage', label: `🚨 Triage (${redReports.length})` },
        { key: 'validate', label: `✅ Validate (${greenReports.length})` },
        { key: 'analytics', label: '📈 Analytics' },
        { key: 'events', label: '📅 Events' }
    ];

    return (
        <div className="coord-wrap">
            {snack && <Snackbar message={snack} onDone={() => setSnack('')} />}
            {rejectModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>✗ Reject Report</h3>
                        <p>Provide a reason for rejection. The status will be set back to pending.</p>
                        <textarea className="form-control mb-2" placeholder={t('rejectNote')} value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)} />
                        <div className="modal-btns">
                            <button className="btn btn-ghost" onClick={() => setRejectModal(null)}>Cancel</button>
                            <button className="btn btn-red" onClick={rejectReport}>Confirm Reject</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="coord-sidebar">
                <div style={{ padding: '1.5rem 1.5rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🏛️ CivCity Command
                    </h2>
                    <p style={{ opacity: 0.6, fontSize: '0.8rem', marginTop: 4 }}>Coordinator Dashboard</p>
                </div>
                <div className="coord-nav">
                    {tabs.map(t => (
                        <div key={t.key} className={`coord-nav-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                            {t.label}
                        </div>
                    ))}
                </div>
                <div style={{ padding: '1.5rem', marginTop: 'auto' }}>
                    <button className="btn btn-secondary btn-full coord-logout" onClick={onLogout}>Logout</button>
                </div>
            </div>

            <div className="coord-content">
                <div className="container" style={{ padding: '2rem 1rem', maxWidth: 1000 }}>
                    {tab === 'pulse' && stats && (
                        <div className="fade-in">
                            <h2 className="mb-4">City Pulse</h2>
                            <div className="grid-3 mb-4">
                                <div className="card stat-card"><div className="stat-label">Active Tasks</div><div className="stat-value text-yellow">{stats.active_tasks}</div><div className="text-muted text-sm mt-1">Currently being worked on</div></div>
                                <div className="card stat-card"><div className="stat-label">Avg Response</div><div className="stat-value text-blue">{stats.avg_response_hours}h</div><div className="text-muted text-sm mt-1">Time from report to assignment</div></div>
                                <div className="card stat-card"><div className="stat-label">Community Pressure</div><div className="stat-value text-red">🔥 {stats.community_pressure}</div><div className="text-muted text-sm mt-1">Total upvotes on pending issues</div></div>
                            </div>
                            <h3>Issue Status</h3>
                            <div className="grid-3">
                                {[{ s: 'pending', label: 'Pending' }, { s: 'in_progress', label: 'In Progress' }, { s: 'resolved', label: 'Resolved' }].map(item => {
                                    const count = reports.filter(r => r.status === item.s).length;
                                    return (
                                        <div key={item.s} className="card" style={{ borderTop: `4px solid var(--${{ pending: 'red', in_progress: 'yellow', resolved: 'green' }[item.s]})` }}>
                                            <div style={{ fontSize: '2rem', fontWeight: 800, color: `var(--${{ pending: 'red', in_progress: 'yellow', resolved: 'green' }[item.s]})` }}>{count}</div>
                                            <div className="text-muted">{item.label} Issues</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {tab === 'triage' && (
                        <div className="fade-in">
                            <div className="flex mb-4" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0 }}>🚨 Pending Triage</h2>
                                <select className="form-control" style={{ width: 200 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                                    <option value="">All Categories</option>
                                    <option value="Pothole">Pothole</option>
                                    <option value="Streetlight">Streetlight</option>
                                    <option value="Garbage">Garbage</option>
                                    <option value="Sewage">Sewage</option>
                                </select>
                            </div>
                            <div className="list-group">
                                {redReports.length === 0 ? (
                                    <div className="card text-center text-muted mt-3">All clear! No pending reports to triage.</div>
                                ) : redReports.map(r => (
                                    <div key={r.id} className="card flex gap-3" style={{ alignItems: 'flex-start' }}>
                                        {r.before_photo_url && <img src={r.before_photo_url} alt="issue" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--rad)' }} />}
                                        <div style={{ flex: 1 }}>
                                            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                                                <h4 style={{ margin: 0 }}>{r.title}</h4>
                                                <StatusBadge status={r.status} />
                                            </div>
                                            <div className="flex gap-2" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
                                                <CatBadge cat={r.category} />
                                                <span className="badge badge-gray">👍 {r.upvotes} votes</span>
                                                <span className="badge badge-gray">🤖 AI: {r.ai_validation_result}</span>
                                            </div>
                                            <p className="text-muted text-sm">{r.description || 'No description provided.'}</p>
                                        </div>
                                        <div style={{ minWidth: 200, paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
                                            <label className="form-label text-sm">Assign Worker</label>
                                            <select className="form-control" onChange={e => assignWorker(r.id, e.target.value)} defaultValue="">
                                                <option value="" disabled>Select worker...</option>
                                                {workers.filter(w => w.category === r.category || w.category === 'Other').map(w => (
                                                    <option key={w.username} value={w.display}>{w.display}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === 'validate' && (
                        <div className="fade-in">
                            <h2 className="mb-4">✅ Awaiting Validation</h2>
                            <p className="text-muted mb-4">Workers have marked these as resolved. Verify the before/after photos and approve.</p>
                            {greenReports.length === 0 && <div className="card text-center text-muted">No items awaiting validation.</div>}
                            <div className="grid-2">
                                {greenReports.map(r => (
                                    <div key={r.id} className="card">
                                        <h4 className="mb-2">{r.title}</h4>
                                        <div className="flex gap-2 mb-3">
                                            <div style={{ flex: 1 }}>
                                                <div className="text-sm font-semibold mb-1 text-center">Before</div>
                                                <img src={r.before_photo_url} alt="before" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 4 }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div className="text-sm font-semibold mb-1 text-center">After</div>
                                                <img src={r.after_photo_url} alt="after" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 4 }} />
                                            </div>
                                        </div>
                                        {r.approved_by_coordinator ? (
                                            <div className="alert alert-success">✅ Approved on {r.approval_date}</div>
                                        ) : (
                                            <div className="flex gap-2 mt-3">
                                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => approveReport(r.id)}>✓ {t('approve')}</button>
                                                <button className="btn btn-red" style={{ flex: 1 }} onClick={() => { setRejectModal(r.id); setRejectNote(''); }}>✗ {t('reject')}</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === 'analytics' && (
                        <div className="fade-in">
                            <h2 className="mb-4">📈 Analytics Dashboard</h2>
                            <div className="grid-2">
                                <div className="card"><h4 className="mb-3">Report Volume (30 days)</h4><div style={{ height: 260 }}><canvas id="daily"></canvas></div></div>
                                <div className="card"><h4 className="mb-3">By Category</h4><div style={{ height: 260 }}><canvas id="cat"></canvas></div></div>
                                <div className="card"><h4 className="mb-3">Status Breakdown</h4><div style={{ height: 300 }}><canvas id="status"></canvas></div></div>
                            </div>
                        </div>
                    )}

                    {tab === 'events' && (
                        <div className="fade-in">
                            <h2 className="mb-4">📅 Community Events</h2>
                            <div className="grid-2 align-start">
                                <div className="card">
                                    <h3 className="mb-3">Create New Event</h3>
                                    <form onSubmit={createEvent}>
                                        {[
                                            { k: 'event_name', l: 'Event Title', req: true, type: 'text' },
                                            { k: 'event_date', l: 'Date', req: true, type: 'date' },
                                            { k: 'location', l: 'Location/Park', req: false, type: 'text' },
                                            { k: 'organized_by', l: 'Organized By', req: false, type: 'text' }
                                        ].map(f => (
                                            <div className="form-group" key={f.k}>
                                                <label className="form-label">{f.l} {f.req && '*'}</label>
                                                <input className="form-control" type={f.type} required={f.req}
                                                    value={eventForm[f.k]} onChange={e => setEventForm(old => ({ ...old, [f.k]: e.target.value }))} />
                                            </div>
                                        ))}
                                        <div className="form-group">
                                            <label className="form-label">Description</label>
                                            <textarea className="form-control" rows={3} value={eventForm.description} onChange={e => setEventForm(old => ({ ...old, description: e.target.value }))} />
                                        </div>
                                        <button className="btn btn-primary btn-full mt-2">Create Event</button>
                                    </form>
                                </div>
                                <div>
                                    <h3 className="mb-3">Upcoming Events</h3>
                                    {events.length === 0 && <p className="text-muted">No events scheduled.</p>}
                                    {events.map(ev => (
                                        <div key={ev.id} className="card event-card mb-3">
                                            <div className="event-date-badge">
                                                <div className="month">{new Date(ev.event_date).toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
                                                <div className="day">{new Date(ev.event_date).getDate()}</div>
                                            </div>
                                            <div className="event-body">
                                                <h4>{ev.event_name}</h4>
                                                <p className="text-muted text-sm mt-1 mb-2">📍 {ev.location} &nbsp;|&nbsp; 👥 {ev.organized_by}</p>
                                                <p className="text-sm">{ev.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
