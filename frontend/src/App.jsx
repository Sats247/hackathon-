import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, getDeviceId, setLang, t } from './api';
import { LoginPage } from './components/LoginPage';
import { ReportFlow } from './components/ReportFlow';
import { WorkerDashboard } from './components/WorkerDashboard';
import { CoordDashboard } from './components/CoordDashboard';
import { PhotoGallery } from './components/PhotoGallery';
import { NGORegisterPage } from './components/NGORegisterPage';
import { BudgetBox } from './components/BudgetBox';

export default function App() {
    const [deviceId, setDeviceId] = useState(null);
    const [reports, setReports] = useState([]);
    const [userRole, setUserRole] = useState('civilian'); // civilian, worker, coordinator
    const [workerProfile, setWorkerProfile] = useState(null);
    const [ngoProfile, setNgoProfile] = useState(null);
    const [route, setRoute] = useState('home'); // home, login, report, ngo

    const loadReports = async () => {
        const r = await apiGet('/api/reports');
        if (r.ok) setReports(r.data);
    };

    useEffect(() => {
        getDeviceId().then(id => {
            setDeviceId(id);
            apiGet(`/api/ngo/${id}`).then(r => r.ok && setNgoProfile(r.data));
        });
        loadReports();
    }, []);

    const handleLogin = (data) => {
        setUserRole(data.role);
        if (data.role === 'worker') setWorkerProfile(data.worker);
        setRoute('home');
    };

    const handleLogout = () => { setUserRole('civilian'); setWorkerProfile(null); setRoute('home'); };

    if (route === 'login') return <LoginPage role="worker" onLogin={handleLogin} onBack={() => setRoute('home')} />;
    if (route === 'coord_login') return <LoginPage role="coordinator" onLogin={handleLogin} onBack={() => setRoute('home')} />;
    if (route === 'report') return <ReportFlow deviceId={deviceId} onBack={() => { setRoute('home'); loadReports(); }} />;
    if (route === 'ngo') return <NGORegisterPage deviceId={deviceId} onBack={() => { setRoute('home'); apiGet(`/api/ngo/${deviceId}`).then(r => r.ok && setNgoProfile(r.data)); }} />;

    if (userRole === 'coordinator') return <CoordDashboard onLogout={handleLogout} />;
    if (userRole === 'worker' && workerProfile) return <WorkerDashboard worker={workerProfile} onLogout={handleLogout} />;

    return (
        <div>
            {/* Header */}
            <header className="header">
                <div className="container header-inner flex" style={{ justifyContent: 'space-between' }}>
                    <div className="flex gap-2">
                        <div className="logo">🏛️ CivCity</div>
                        <span className="badge badge-gray">{t('bengaluru')}</span>
                    </div>
                    <div className="flex gap-2">
                        <select className="form-control" style={{ width: 100 }} onChange={e => { setLang(e.target.value); window.location.reload(); }}>
                            <option value="en">English</option>
                            <option value="kn">ಕನ್ನಡ</option>
                            <option value="hi">हिंदी</option>
                        </select>
                        <button className="btn btn-ghost" onClick={() => setRoute('login')}>{t('workerLogin')}</button>
                    </div>
                </div>
            </header>

            {/* Hero */}
            <div className="hero">
                <div className="container">
                    <h1 className="hero-title">{t('heroTitle')}</h1>
                    <p className="hero-subtitle mb-4">Report potholes, broken streetlights, or garbage dumps. Track their status and upvote issues to increase priority.</p>
                    <div className="flex gap-2" style={{ justifyContent: 'center' }}>
                        <button className="btn btn-primary" style={{ fontSize: '1.2rem', padding: '1rem 2rem' }} onClick={() => setRoute('report')}>
                            📸 {t('reportIssueBtn')}
                        </button>
                    </div>

                    {!ngoProfile && (
                        <div className="mt-3">
                            <button className="btn btn-ghost btn-sm" onClick={() => setRoute('ngo')}>🔗 {t('registerNGO')}</button>
                        </div>
                    )}
                    {ngoProfile && (
                        <div className="badge badge-blue mt-3">
                            ✓ {ngoProfile.profile_type}: {ngoProfile.name}
                        </div>
                    )}
                </div>
            </div>

            {/* Main */}
            <div className="container" style={{ padding: '3rem 1rem' }}>
                <div className="grid-2 align-start">
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>📍 {t('liveReports')}</h2>
                            <span className="badge badge-yellow">{reports.length} Active Issues</span>
                        </div>
                        {reports.length === 0 ? (
                            <div className="card text-center text-muted" style={{ padding: '3rem' }}>No issues reported recently.</div>
                        ) : (
                            <div className="list-group">
                                {reports.slice(0, 5).map(r => (
                                    <div key={r.id} className="card list-group-item">
                                        <div className="flex gap-3">
                                            {r.before_photo_url ? (
                                                <img src={r.before_photo_url} alt="issue" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 'var(--rad)', flexShrink: 0 }} />
                                            ) : (
                                                <div style={{ width: 80, height: 80, background: 'var(--bg)', borderRadius: 'var(--rad)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '2rem' }}>📌</div>
                                            )}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <h4 style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</h4>
                                                    <span className={`badge badge-${{ pending: 'red', in_progress: 'yellow', resolved: 'green' }[r.status] || 'gray'}`}>
                                                        {{ pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved' }[r.status] || r.status}
                                                    </span>
                                                </div>
                                                <p className="task-meta mb-2">📍 {r.manual_address || (r.latitude ? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}` : 'No location')}</p>
                                                <div className="flex gap-2">
                                                    <span className="badge badge-blue">
                                                        {{ Pothole: '🕳️', Streetlight: '💡', Garbage: '🗑️', Sewage: '🚰' }[r.category] || '📌'} {r.category}
                                                    </span>
                                                    <span className="badge badge-gray">👍 {r.upvotes}</span>
                                                    {r.ngo_name && <span className="badge badge-green" title={r.ngo_type}>🤝 {r.ngo_name}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {reports.length > 5 && <div className="text-center mt-3"><button className="btn btn-secondary btn-full">View all recent reports →</button></div>}
                    </div>

                    <div>
                        <BudgetBox />
                        <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(46,109,164,0.1), rgba(0,0,0,0))' }}>
                            <h3 className="mb-2">🏛️ {t('communityEvents')}</h3>
                            <p className="text-muted mb-3 text-sm">Join local civic drives led by coordinators.</p>
                            <button className="btn btn-secondary btn-full">View Upcoming Events</button>
                        </div>
                    </div>
                </div>
            </div>

            <PhotoGallery reports={reports} />

            <footer className="footer">
                <div className="container" style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: '1rem', opacity: 0.5, cursor: 'pointer' }} onClick={() => setRoute('coord_login')}>
                        🔒 Coordinator Access
                    </div>
                    <p>© 2026 CivCity Bangalore.</p>
                </div>
            </footer>
        </div>
    );
}
