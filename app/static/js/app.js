// ═══════════════════════════════════════════════════════════════
//  CivicPulse — Main React App (Part 1: Utils + Auth + Civilian)
// ═══════════════════════════════════════════════════════════════

const { useState, useEffect, useRef, useCallback } = React;

// ─── Device Fingerprint ──────────────────────────────────────────────────────
async function getDeviceId() {
    const raw = navigator.userAgent + screen.width + 'x' + screen.height + screen.colorDepth;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Translation helper ──────────────────────────────────────────────────────
let _lang = 'en';
function t(key, sub) {
    const tr = window.TRANSLATIONS[_lang] || window.TRANSLATIONS.en;
    let val = key.split('.').reduce((o, k) => (o || {})[k], tr);
    if (val === undefined) val = key.split('.').reduce((o, k) => (o || {})[k], window.TRANSLATIONS.en);
    return val || key;
}

// ─── API helpers ─────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
    const res = await fetch(path, opts);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: json };
}

function apiGet(path) { return api(path); }
function apiPost(path, body) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function apiPostForm(path, formData) {
    return api(path, { method: 'POST', body: formData });
}

// ─── Snackbar ────────────────────────────────────────────────────────────────
function Snackbar({ message, onDone }) {
    useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
    return <div className="snackbar">{message}</div>;
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status, large }) {
    const labels = { red: t('status.red'), yellow: t('status.yellow'), green: t('status.green') };
    const cls = large ? `status-pill ${status}` : `badge badge-${status}`;
    return <span className={cls}>{labels[status] || status}</span>;
}

// ─── Category badge ──────────────────────────────────────────────────────────
function CatBadge({ cat }) {
    const icons = { Pothole: '🕳️', Streetlight: '💡', Garbage: '🗑️', Sewage: '🚰', Other: '📌' };
    return <span className="badge badge-blue">{icons[cat] || '📌'} {t(`categories.${cat}`) || cat}</span>;
}

// ─── Budget Box ──────────────────────────────────────────────────────────────
function BudgetBox() {
    const [budget, setBudget] = useState(null);
    useEffect(() => { apiGet('/api/budget').then(r => r.ok && setBudget(r.data)); }, []);
    if (!budget) return null;
    const pct = Math.round((budget.utilized_raw / budget.allocated_raw) * 100);
    return (
        <div className="budget-box mb-3">
            <div>
                <h4>🏛️ {t('budgetAllocated')}</h4>
                <div className="amount">{budget.allocated}</div>
            </div>
            <div className="budget-divider" />
            <div>
                <h4>📊 {t('budgetUtilized')}</h4>
                <div className="amount">{budget.utilized}</div>
                <div className="budget-bar"><div className="budget-bar-fill" style={{ width: pct + '%' }} /></div>
            </div>
            <div>
                <span className="badge badge-blue">{pct}% utilized</span>
            </div>
        </div>
    );
}

// ─── Leaflet Map ─────────────────────────────────────────────────────────────
function LeafletMap({ lat, lng, onMove, reports, height }) {
    const divRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);

    useEffect(() => {
        if (mapRef.current) return;
        const center = (lat && lng) ? [lat, lng] : [12.9716, 77.5946];
        const map = L.map(divRef.current, { zoomControl: true }).setView(center, 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        mapRef.current = map;

        if (onMove) {
            const pin = L.marker(center, { draggable: true }).addTo(map);
            markerRef.current = pin;
            pin.on('dragend', e => { const p = e.target.getLatLng(); onMove(p.lat, p.lng); });
            map.on('click', e => { pin.setLatLng(e.latlng); onMove(e.latlng.lat, e.latlng.lng); });
        }

        if (reports && reports.length > 0) {
            const colors = { red: '#E74C3C', yellow: '#F39C12', green: '#27AE60' };
            reports.forEach(r => {
                if (!r.latitude || !r.longitude) return;
                const color = colors[r.status] || '#888';
                const icon = L.divIcon({
                    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
                    className: '', iconSize: [14, 14], iconAnchor: [7, 7]
                });
                const m = L.marker([r.latitude, r.longitude], { icon }).addTo(map);
                m.bindPopup(`<div class="popup-title">${r.title}</div><div class="popup-meta">${r.category} · ${r.status}</div><div class="popup-meta">👍 ${r.upvotes} votes</div>${r.before_photo_url ? `<img src="${r.before_photo_url}" style="width:100%;margin-top:6px;border-radius:4px;" />` : ''}`);
            });
        }

        return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    }, []);

    useEffect(() => {
        if (!markerRef.current || !lat || !lng) return;
        markerRef.current.setLatLng([lat, lng]);
        mapRef.current && mapRef.current.setView([lat, lng], 15);
    }, [lat, lng]);

    return <div ref={divRef} className="map-container" style={{ height: height || '300px' }} />;
}

// ═══════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════
function LoginPage({ role, onLogin, onBack }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async e => {
        e.preventDefault();
        setLoading(true); setError('');
        const r = await apiPost('/api/auth/login', { username, password });
        setLoading(false);
        if (r.ok) onLogin(r.data);
        else setError(t('loginError'));
    };

    const isCoord = role === 'coordinator';
    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div className="icon">{isCoord ? '🏛️' : '👷'}</div>
                    <h2>{isCoord ? t('coordinatorLogin') : t('workerLogin')}</h2>
                    <p>{isCoord ? 'coordinator / coord123' : 'e.g. ravi / worker123'}</p>
                </div>
                <form onSubmit={submit}>
                    <div className="form-group">
                        <label className="form-label">{t('loginUsername')}</label>
                        <input className="form-control" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('loginPassword')}</label>
                        <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    {error && <div className="alert alert-error">{error}</div>}
                    <button className="btn btn-primary btn-full mt-2" disabled={loading}>
                        {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : t('login')}
                    </button>
                </form>
                <button className="btn btn-ghost btn-full mt-2" onClick={onBack}>← Back</button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// NGO REGISTRATION
// ═══════════════════════════════════════════════════════════════
function NGORegisterPage({ deviceId, onBack }) {
    const [form, setForm] = useState({ name: '', org_name: '', phone: '', area: '', profile_type: 'Social Worker' });
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);

    const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
    const submit = async e => {
        e.preventDefault();
        setLoading(true);
        const r = await apiPost('/api/ngo/register', { ...form, device_id: deviceId });
        setLoading(false);
        if (r.ok) setDone(true);
    };

    if (done) return (
        <div className="container page confirm-page">
            <div className="confirm-icon">✅</div>
            <h2>Registration Successful!</h2>
            <p className="text-muted mt-1">Your profile has been created. Your reports will now show a badge.</p>
            <button className="btn btn-primary mt-3" onClick={onBack}>Back to Home</button>
        </div>
    );

    return (
        <div className="container page">
            <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
                <div className="card-header"><h3>🤝 {t('registerNGO')}</h3><button className="btn btn-ghost btn-sm" onClick={onBack}>✕</button></div>
                <form onSubmit={submit}>
                    <div className="form-group"><label className="form-label">{t('name')} *</label><input className="form-control" value={form.name} onChange={set('name')} required /></div>
                    <div className="form-group"><label className="form-label">{t('orgName')}</label><input className="form-control" value={form.org_name} onChange={set('org_name')} /></div>
                    <div className="form-group"><label className="form-label">{t('phone')}</label><input className="form-control" value={form.phone} onChange={set('phone')} /></div>
                    <div className="form-group"><label className="form-label">{t('area')}</label><input className="form-control" value={form.area} onChange={set('area')} placeholder="e.g. Koramangala, Indiranagar" /></div>
                    <div className="form-group">
                        <label className="form-label">{t('profileType')}</label>
                        <select className="form-control" value={form.profile_type} onChange={set('profile_type')}>
                            <option value="Social Worker">{t('socialWorker')}</option>
                            <option value="NGO">{t('ngo')}</option>
                        </select>
                    </div>
                    <button className="btn btn-primary btn-full" disabled={loading}>{loading ? 'Registering...' : t('register')}</button>
                </form>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// CIVILIAN REPORT FLOW
// ═══════════════════════════════════════════════════════════════
function ReportFlow({ deviceId, onBack }) {
    const [step, setStep] = useState(1); // 1=Photo, 2=Location, 3=Details, 4=Confirm
    const [photoFile, setPhotoFile] = useState(null);
    const [photoURL, setPhotoURL] = useState('');
    const [aiStatus, setAiStatus] = useState(''); // ''|'validating'|'valid'|'invalid'
    const [lat, setLat] = useState(null);
    const [lng, setLng] = useState(null);
    const [manualAddress, setManualAddress] = useState('');
    const [geocoding, setGeocoding] = useState(false);
    const [locMode, setLocMode] = useState('auto'); // 'auto'|'manual'
    const [form, setForm] = useState({ title: '', description: '', category: 'Pothole' });
    const [submitting, setSubmitting] = useState(false);
    const [duplicate, setDuplicate] = useState(null);
    const [confirmed, setConfirmed] = useState(null);
    const [snack, setSnack] = useState('');
    const [detecting, setDetecting] = useState(false);

    // ── Step 1: Photo Upload + AI Validate ──────────────────────
    const handlePhoto = async file => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setSnack('File too large. Max 5MB.'); return; }
        setPhotoFile(file);
        setPhotoURL(URL.createObjectURL(file));
        setAiStatus('validating');
        const fd = new FormData();
        fd.append('photo', file);
        const r = await apiPostForm('/api/validate-image', fd);
        if (r.ok && r.data.result === 'Valid') setAiStatus('valid');
        else setAiStatus('invalid');
    };

    // ── Step 2: Geolocation ──────────────────────────────────────
    const detectLocation = () => {
        setDetecting(true);
        navigator.geolocation.getCurrentPosition(
            pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setDetecting(false); },
            () => { setLocMode('manual'); setDetecting(false); },
            { timeout: 8000 }
        );
    };

    const geocodeAddress = async () => {
        if (!manualAddress.trim()) return;
        setGeocoding(true);
        const r = await apiGet(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(manualAddress + ', Bangalore')}`);
        setGeocoding(false);
        if (r.ok && r.data.length > 0) {
            setLat(parseFloat(r.data[0].lat));
            setLng(parseFloat(r.data[0].lon));
        } else {
            setSnack('Address not found. Try a more specific address.');
        }
    };

    // ── Submit ───────────────────────────────────────────────────
    const submit = async (force = false) => {
        setSubmitting(true);
        const fd = new FormData();
        fd.append('photo', photoFile);
        fd.append('title', form.title);
        fd.append('description', form.description);
        fd.append('category', form.category);
        fd.append('device_id', deviceId);
        if (lat) fd.append('latitude', lat);
        if (lng) fd.append('longitude', lng);
        if (manualAddress) fd.append('manual_address', manualAddress);
        if (force) fd.append('force', '1');

        const r = await apiPostForm('/api/reports', fd);
        setSubmitting(false);
        if (r.status === 429) { setSnack('Rate limit: max 3 reports per hour.'); return; }
        if (r.status === 422) { setAiStatus('invalid'); setStep(1); return; }
        if (r.ok && r.data.duplicate) { setDuplicate(r.data.existing_report); return; }
        if (r.ok && r.data.success) { setConfirmed(r.data.report); setStep(4); return; }
        setSnack('Submission failed. Please try again.');
    };

    const upvoteDuplicate = async () => {
        const r = await apiPost(`/api/reports/${duplicate.id}/upvote`, { device_id: deviceId });
        if (r.ok && r.data.success) { setSnack(`Upvoted! Energy left: ${r.data.energy_left}`); setDuplicate(null); onBack(); }
        else setSnack(r.data.error || 'Could not upvote.');
    };

    // ── Step indicators ──────────────────────────────────────────
    const steps = ['Photo', 'Location', 'Details'];

    return (
        <div className="container page">
            {snack && <Snackbar message={snack} onDone={() => setSnack('')} />}

            {/* Duplicate Modal */}
            {duplicate && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>⚠️ {t('duplicateFound')}</h3>
                        <p>{t('duplicatePrompt')}</p>
                        <div className="card-sm mb-2" style={{ background: 'var(--bg)' }}>
                            <strong>{duplicate.title}</strong>
                            <div className="text-muted mt-1">{duplicate.category} · 👍 {duplicate.upvotes}</div>
                        </div>
                        <div className="modal-btns">
                            <button className="btn btn-primary" onClick={upvoteDuplicate}>{t('upvoteExisting')}</button>
                            <button className="btn btn-secondary" onClick={() => { setDuplicate(null); submit(true); }}>{t('submitAnyway')}</button>
                        </div>
                    </div>
                </div>
            )}

            {step < 4 && (
                <>
                    <div className="section-heading">
                        <div className="section-heading-icon">📋</div>
                        <div><h2>{t('reportIssue')}</h2><p>Help us fix Bangalore, one issue at a time</p></div>
                    </div>
                    {/* Step bar */}
                    <div className="steps mb-3">
                        {steps.map((s, i) => (
                            <div key={i} className="step-item">
                                <div className={`step-dot ${step > i + 1 ? 'done' : step === i + 1 ? 'active' : ''}`}>
                                    {step > i + 1 ? '✓' : i + 1}
                                </div>
                                {i < steps.length - 1 && <div className={`step-line ${step > i + 1 ? 'done' : ''}`} />}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* STEP 1 — PHOTO */}
            {step === 1 && (
                <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
                    <h3 className="mb-3">📷 Upload a Photo</h3>
                    <div className="upload-zone" onClick={() => document.getElementById('photo-input').click()}>
                        <input id="photo-input" type="file" accept=".jpg,.jpeg,.png" style={{ display: 'none' }}
                            onChange={e => handlePhoto(e.target.files[0])} />
                        <div className="upload-icon">📷</div>
                        <div className="upload-text">Click to upload a photo of the issue</div>
                        <div className="upload-hint">JPG or PNG, max 5MB</div>
                    </div>

                    {photoURL && (
                        <div className="photo-preview mt-2">
                            <img src={photoURL} alt="preview" style={{ width: '100%', height: 220, objectFit: 'cover' }} />
                        </div>
                    )}

                    {aiStatus === 'validating' && (
                        <div className="alert alert-info mt-2">
                            <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                            {t('validating')}
                        </div>
                    )}
                    {aiStatus === 'valid' && <div className="alert alert-success mt-2">✅ {t('photoVerified')}</div>}
                    {aiStatus === 'invalid' && <div className="alert alert-error mt-2">❌ {t('photoInvalid')}</div>}

                    <div className="flex gap-2 mt-3">
                        <button className="btn btn-secondary" onClick={onBack}>{t('back')}</button>
                        <button className="btn btn-primary" disabled={aiStatus !== 'valid'}
                            onClick={() => setStep(2)}>{t('next')} →</button>
                    </div>
                </div>
            )}

            {/* STEP 2 — LOCATION */}
            {step === 2 && (
                <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
                    <h3 className="mb-3">📍 Location</h3>
                    <div className="flex gap-2 mb-3">
                        <button className={`btn ${locMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLocMode('auto')}>Auto-detect</button>
                        <button className={`btn ${locMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLocMode('manual')}>Enter Address</button>
                    </div>

                    {locMode === 'auto' && (
                        <>
                            {!lat ? (
                                <button className="btn btn-primary btn-full" onClick={detectLocation} disabled={detecting}>
                                    {detecting ? t('detecting') : t('detectLocation')}
                                </button>
                            ) : (
                                <div className="alert alert-success">📍 {t('locationDetected')} ({lat.toFixed(5)}, {lng.toFixed(5)})</div>
                            )}
                        </>
                    )}

                    {locMode === 'manual' && (
                        <div className="form-group">
                            <label className="form-label">{t('enterAddress')}</label>
                            <div className="flex gap-2">
                                <input className="form-control" value={manualAddress} onChange={e => setManualAddress(e.target.value)}
                                    placeholder={t('addressPlaceholder')} />
                                <button className="btn btn-primary" onClick={geocodeAddress} disabled={geocoding}>
                                    {geocoding ? '...' : '🔍'}
                                </button>
                            </div>
                        </div>
                    )}

                    {lat && lng && <LeafletMap lat={lat} lng={lng} onMove={(a, b) => { setLat(a); setLng(b); }} />}

                    <div className="flex gap-2 mt-3">
                        <button className="btn btn-secondary" onClick={() => setStep(1)}>{t('back')}</button>
                        <button className="btn btn-primary" disabled={!lat} onClick={() => setStep(3)}>{t('next')} →</button>
                    </div>
                    <p className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
                        * Location optional if address is known
                    </p>
                    <div className="flex gap-2">
                        {!lat && <button className="btn btn-ghost btn-sm" onClick={() => setStep(3)}>Skip location →</button>}
                    </div>
                </div>
            )}

            {/* STEP 3 — DETAILS */}
            {step === 3 && (
                <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
                    <h3 className="mb-3">📝 Issue Details</h3>
                    <div className="form-group">
                        <label className="form-label">{t('category')} *</label>
                        <select className="form-control" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                            {['Pothole', 'Streetlight', 'Garbage', 'Sewage', 'Other'].map(c => (
                                <option key={c} value={c}>{t(`categories.${c}`)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('title')} *</label>
                        <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Large pothole on MG Road near bus stop" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('description')}</label>
                        <textarea className="form-control" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Any additional details (optional)" />
                    </div>
                    <div className="flex gap-2 mt-2">
                        <button className="btn btn-secondary" onClick={() => setStep(2)}>{t('back')}</button>
                        <button className="btn btn-primary" disabled={!form.title || submitting} onClick={() => submit()}>
                            {submitting ? 'Submitting...' : t('submit')}
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 4 — CONFIRM */}
            {step === 4 && confirmed && (
                <div className="confirm-page">
                    <div className="confirm-icon">🎉</div>
                    <h2>{t('confirmSubmission')}</h2>
                    <p className="text-muted mt-1">Your report has been submitted and is now pending review.</p>
                    <div className="confirm-id">#{confirmed.id}</div>
                    <div className="mt-2"><StatusBadge status="red" /></div>
                    <div className="flex gap-2 mt-3" style={{ justifyContent: 'center' }}>
                        <button className="btn btn-secondary" onClick={onBack}>Back to Home</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// WORKER DASHBOARD
// ═══════════════════════════════════════════════════════════════
function WorkerDashboard({ user, onLogout }) {
    const [tasks, setTasks] = useState([]);
    const [lang, setLang] = useState('en');
    const [snack, setSnack] = useState('');
    const [loading, setLoading] = useState(true);
    const [afterPhotoModal, setAfterPhotoModal] = useState(null); // task id

    _lang = lang;

    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        setLoading(true);
        const r = await apiGet(`/api/worker/tasks?username=${user.username}`);
        if (r.ok) {
            // Sort by worker GPS if available
            let taskList = r.data;
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(pos => {
                    const { latitude: wlat, longitude: wlng } = pos.coords;
                    taskList = taskList.slice().sort((a, b) => {
                        const distA = a.latitude ? Math.hypot(a.latitude - wlat, a.longitude - wlng) : Infinity;
                        const distB = b.latitude ? Math.hypot(b.latitude - wlat, b.longitude - wlng) : Infinity;
                        return distA - distB;
                    });
                    setTasks(taskList);
                }, () => setTasks(taskList));
            } else {
                setTasks(taskList);
            }
        }
        setLoading(false);
    };

    const speak = (task) => {
        let text = '';
        if (lang === 'kn') {
            text = `${task.title}. ಸ್ಥಳ: ${task.manual_address || 'ಮಾಹಿತಿ ಇಲ್ಲ'}`;
        } else if (lang === 'hi') {
            text = `${task.title}. स्थान: ${task.manual_address || 'अज्ञात'}`;
        } else {
            const addr = task.manual_address || (task.latitude ? `${task.latitude.toFixed(4)}, ${task.longitude.toFixed(4)}` : 'unknown location');
            text = `${task.title} at ${addr}`;
        }
        const msg = new SpeechSynthesisUtterance(text);
        if (lang === 'kn') msg.lang = 'kn-IN';
        else if (lang === 'hi') msg.lang = 'hi-IN';
        else msg.lang = 'en-IN';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(msg);
    };

    const startWork = async (id) => {
        await apiPost(`/api/reports/${id}/status`, { status: 'yellow' });
        setSnack('Task started!');
        loadTasks();
    };

    const markDone = (id) => {
        setAfterPhotoModal(id);
    };

    const submitDone = async (id, file) => {
        const fd = new FormData();
        fd.append('photo', file);
        const r = await apiPostForm(`/api/reports/${id}/after-photo`, fd);
        if (r.ok) { setSnack('Task marked done!'); setAfterPhotoModal(null); loadTasks(); }
        else setSnack('Failed to upload photo.');
    };

    const langOptions = [
        { code: 'en', label: 'EN' },
        { code: 'kn', label: 'ಕನ್ನಡ' },
        { code: 'hi', label: 'हिंदी' }
    ];

    return (
        <div>
            {snack && <Snackbar message={snack} onDone={() => setSnack('')} />}

            {/* After Photo Modal */}
            {afterPhotoModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>📷 {t('uploadAfterPhoto')}</h3>
                        <p>{t('afterPhotoPrompt')}</p>
                        <input type="file" accept=".jpg,.jpeg,.png" id="after-photo-input"
                            style={{ display: 'none' }}
                            onChange={e => { if (e.target.files[0]) submitDone(afterPhotoModal, e.target.files[0]); }} />
                        <div className="flex gap-2 mt-2">
                            <button className="btn btn-green btn-full" onClick={() => document.getElementById('after-photo-input').click()}>
                                📷 Choose Photo
                            </button>
                            <button className="btn btn-secondary" onClick={() => setAfterPhotoModal(null)}>{t('cancel')}</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="worker-header">
                <div>
                    <h2>👷 {t('workerDashboard')}</h2>
                    <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{user.name} · {user.category}</div>
                </div>
                <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="lang-toggle">
                        {langOptions.map(l => (
                            <button key={l.code} className={`lang-btn ${lang === l.code ? 'active' : ''}`}
                                onClick={() => { setLang(l.code); _lang = l.code; }}>
                                {l.label}
                            </button>
                        ))}
                    </div>
                    <button className="btn-header danger" onClick={onLogout}>{t('logout')}</button>
                </div>
            </div>

            <div className="worker-page">
                {loading ? (
                    <div className="flex-center" style={{ padding: '3rem' }}><div className="spinner" /></div>
                ) : tasks.length === 0 ? (
                    <div className="card text-center mt-3">
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                        <h3>{t('noTasks')}</h3>
                    </div>
                ) : (
                    tasks.map(task => (
                        <div key={task.id} className="task-card">
                            <div className="task-card-header">
                                <div style={{ flex: 1 }}>
                                    <div className="task-card-title">{task.title}</div>
                                    <div className="task-card-addr">
                                        📍 {task.manual_address || (task.latitude ? `${task.latitude.toFixed(4)}, ${task.longitude.toFixed(4)}` : 'No location')}
                                    </div>
                                    <div className="flex gap-1 mt-2" style={{ flexWrap: 'wrap' }}>
                                        <StatusBadge status={task.status} large />
                                        <CatBadge cat={task.category} />
                                        <span className="badge badge-blue">👍 {task.upvotes}</span>
                                    </div>
                                </div>
                                <button className="btn btn-ghost" style={{ fontSize: '1.3rem' }} onClick={() => speak(task)} title={t('speak')}>
                                    🔊
                                </button>
                            </div>

                            {task.before_photo_url && (
                                <img className="task-card-photo" src={task.before_photo_url} alt="Before" />
                            )}

                            <div className="task-card-actions">
                                {task.latitude && task.longitude && (
                                    <a href={`https://www.google.com/maps/search/?api=1&query=${task.latitude},${task.longitude}`}
                                        target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-full">
                                        🗺️ {t('openMaps')}
                                    </a>
                                )}
                                <div className="task-card-row">
                                    {task.status === 'red' && (
                                        <button className="btn btn-yellow btn-full" onClick={() => startWork(task.id)}>
                                            ▶️ {t('startWork')}
                                        </button>
                                    )}
                                    {(task.status === 'red' || task.status === 'yellow') && (
                                        <button className="btn btn-green btn-full" onClick={() => markDone(task.id)}>
                                            ✅ {t('markDone')}
                                        </button>
                                    )}
                                    {task.status === 'green' && (
                                        <div className="badge badge-green" style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', width: '100%', justifyContent: 'center' }}>
                                            ✅ Completed
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// COORDINATOR DASHBOARD
// ═══════════════════════════════════════════════════════════════
function CoordDashboard({ user, onLogout }) {
    const [tab, setTab] = useState('pulse');
    const [reports, setReports] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [events, setEvents] = useState([]);
    const [snack, setSnack] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [rejectModal, setRejectModal] = useState(null);
    const [rejectNote, setRejectNote] = useState('');
    const [assignSelections, setAssignSelections] = useState({});
    const [eventForm, setEventForm] = useState({ event_name: '', event_date: '', location: '', description: '', organized_by: '' });
    const chartRefs = useRef({});
    const chartInstances = useRef({});

    const WORKERS = ['Ravi (Roads)', 'Suresh (Electrical)', 'Ananya (Sanitation)', 'Priya (General)'];

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        const [rr, ar, er] = await Promise.all([
            apiGet('/api/reports'),
            apiGet('/api/analytics'),
            apiGet('/api/events')
        ]);
        if (rr.ok) setReports(rr.data);
        if (ar.ok) setAnalytics(ar.data);
        if (er.ok) setEvents(er.data);
    };

    // Charts
    useEffect(() => {
        if (tab !== 'analytics' || !analytics) return;
        setTimeout(() => {
            renderCharts();
        }, 100);
    }, [tab, analytics]);

    const renderCharts = () => {
        const cats = analytics.by_category || [];
        const statuses = analytics.by_status || [];
        const daily = analytics.daily || [];

        const makeChart = (key, type, data, options) => {
            if (chartInstances.current[key]) { chartInstances.current[key].destroy(); }
            const el = document.getElementById(`chart-${key}`);
            if (!el) return;
            chartInstances.current[key] = new Chart(el, { type, data, options: { responsive: true, maintainAspectRatio: false, ...options } });
        };

        makeChart('cat', 'bar', {
            labels: cats.map(c => c.category),
            datasets: [{ label: 'Issues', data: cats.map(c => c.count), backgroundColor: ['#2E6DA4', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'], borderRadius: 6 }]
        }, { plugins: { legend: { display: false } } });

        makeChart('daily', 'line', {
            labels: daily.map(d => d.day),
            datasets: [{ label: 'Reports/day', data: daily.map(d => d.count), borderColor: '#2E6DA4', backgroundColor: 'rgba(46,109,164,0.1)', tension: 0.4, fill: true }]
        }, {});

        const statusColors = { red: '#E74C3C', yellow: '#F39C12', green: '#27AE60' };
        makeChart('status', 'doughnut', {
            labels: statuses.map(s => s.status),
            datasets: [{ data: statuses.map(s => s.count), backgroundColor: statuses.map(s => statusColors[s.status] || '#888') }]
        }, { plugins: { legend: { position: 'bottom' } } });
    };

    const assign = async (reportId) => {
        const worker = assignSelections[reportId];
        if (!worker) return;
        await apiPost(`/api/reports/${reportId}/assign`, { worker });
        setSnack(`Assigned to ${worker}`);
        loadAll();
    };

    const approve = async (id) => {
        await apiPost(`/api/reports/${id}/approve`, {});
        setSnack('Approved!');
        loadAll();
    };

    const rejectReport = async () => {
        await apiPost(`/api/reports/${rejectModal}/reject`, { note: rejectNote });
        setSnack('Rejected and sent back.');
        setRejectModal(null); setRejectNote('');
        loadAll();
    };

    const createEvent = async (e) => {
        e.preventDefault();
        const r = await apiPost('/api/events', eventForm);
        if (r.ok) { setSnack('Event created!'); setEventForm({ event_name: '', event_date: '', location: '', description: '', organized_by: '' }); loadAll(); }
    };

    const redReports = reports.filter(r => r.status === 'red' && (!filterCat || r.category === filterCat));
    const greenReports = reports.filter(r => r.status === 'green');

    const tabs = [
        { key: 'pulse', label: '📊 Pulse' },
        { key: 'triage', label: '🔴 Triage' },
        { key: 'validation', label: '✅ Validation' },
        { key: 'analytics', label: '📈 Analytics' },
        { key: 'events', label: '📅 Events' }
    ];

    return (
        <div>
            {snack && <Snackbar message={snack} onDone={() => setSnack('')} />}

            {rejectModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>✗ Reject Report</h3>
                        <p>Provide a reason for rejection. The status will be set back to red.</p>
                        <textarea className="form-control mb-2" placeholder={t('rejectNote')} value={rejectNote}
                            onChange={e => setRejectNote(e.target.value)} />
                        <div className="modal-btns">
                            <button className="btn btn-red" onClick={rejectReport}>Confirm Reject</button>
                            <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>{t('cancel')}</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="site-header">
                <div className="brand">
                    <div className="brand-icon">🏛️</div>
                    <div><div className="brand-name">{t('coordDashboard')}</div><div className="brand-sub">{user.name}</div></div>
                </div>
                <button className="btn-header danger" onClick={onLogout}>{t('logout')}</button>
            </div>

            <div className="container coord-page">
                <div className="tabs">
                    {tabs.map(tb => (
                        <button key={tb.key} className={`tab-btn ${tab === tb.key ? 'active' : ''}`}
                            onClick={() => setTab(tb.key)}>{tb.label}</button>
                    ))}
                </div>

                {/* TAB: PULSE */}
                {tab === 'pulse' && analytics && (
                    <div>
                        <BudgetBox />
                        <div className="grid-4 mb-3">
                            <div className="metric-card">
                                <div className="metric-icon">⏱️</div>
                                <div className="metric-value">{analytics.avg_response_hours}<span style={{ fontSize: '1rem', fontWeight: 500 }}>{t('hours')}</span></div>
                                <div className="metric-label">{t('avgResponse')}</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-icon">🟡</div>
                                <div className="metric-value">{analytics.active_tasks}</div>
                                <div className="metric-label">{t('activeTasks')}</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-icon">🔥</div>
                                <div className="metric-value">{analytics.community_pressure}</div>
                                <div className="metric-label">{t('communityPressure')}</div>
                            </div>
                            <div className="metric-card">
                                <div className="metric-icon">📋</div>
                                <div className="metric-value">{reports.length}</div>
                                <div className="metric-label">Total Reports</div>
                            </div>
                        </div>
                        <div className="grid-3">
                            {[{ s: 'red', label: 'Pending' }, { s: 'yellow', label: 'In Progress' }, { s: 'green', label: 'Resolved' }].map(item => {
                                const count = reports.filter(r => r.status === item.s).length;
                                return (
                                    <div key={item.s} className="card" style={{ borderTop: `4px solid var(--${item.s})` }}>
                                        <div style={{ fontSize: '2rem', fontWeight: 800, color: `var(--${item.s})` }}>{count}</div>
                                        <div className="text-muted">{item.label} Issues</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* TAB: TRIAGE */}
                {tab === 'triage' && (
                    <div>
                        <div className="filter-bar mb-3">
                            <label>{t('filterByCategory')}:</label>
                            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                                <option value="">{t('all')}</option>
                                {['Pothole', 'Streetlight', 'Garbage', 'Sewage', 'Other'].map(c => (
                                    <option key={c} value={c}>{t(`categories.${c}`)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th><th>Photo</th><th>Title</th><th>Category</th>
                                        <th>Location</th><th>Upvotes</th><th>Date</th>
                                        <th>{t('assignWorker')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {redReports.length === 0 ? (
                                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No pending reports 🎉</td></tr>
                                    ) : redReports.map(r => (
                                        <tr key={r.id}>
                                            <td>#{r.id}</td>
                                            <td>{r.before_photo_url ? <img className="thumb-img" src={r.before_photo_url} alt="" /> : '—'}</td>
                                            <td><strong>{r.title}</strong></td>
                                            <td><CatBadge cat={r.category} /></td>
                                            <td style={{ fontSize: '0.82rem' }}>{r.manual_address || (r.latitude ? `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}` : '—')}</td>
                                            <td><span className="badge badge-blue">👍 {r.upvotes}</span></td>
                                            <td style={{ fontSize: '0.8rem' }}>{(r.created_at || '').substring(0, 10)}</td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <select className="form-control" style={{ minWidth: 160, padding: '0.35rem 0.5rem', fontSize: '0.82rem' }}
                                                        value={assignSelections[r.id] || ''}
                                                        onChange={e => setAssignSelections(s => ({ ...s, [r.id]: e.target.value }))}>
                                                        <option value="">Select worker</option>
                                                        {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
                                                    </select>
                                                    <button className="btn btn-primary btn-sm" onClick={() => assign(r.id)}>{t('assign')}</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB: VALIDATION */}
                {tab === 'validation' && (
                    <div>
                        <div className="grid-2">
                            {greenReports.length === 0 ? (
                                <div className="card text-center" style={{ gridColumn: '1/-1' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎉</div>
                                    <h3>No reports pending validation</h3>
                                </div>
                            ) : greenReports.map(r => (
                                <div key={r.id} className="card">
                                    <div className="card-header">
                                        <h3>#{r.id} — {r.title}</h3>
                                        {r.approved_by_coordinator
                                            ? <span className="badge badge-green">✓ Verified</span>
                                            : <span className="badge badge-yellow">Awaiting Review</span>}
                                    </div>
                                    <div className="flex gap-2 mb-2">
                                        <CatBadge cat={r.category} />
                                        {r.assigned_worker && <span className="badge badge-blue">👷 {r.assigned_worker}</span>}
                                    </div>
                                    <div className="photo-pair">
                                        <div>
                                            {r.before_photo_url
                                                ? <img src={r.before_photo_url} alt="Before" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                                                : <div style={{ height: 160, background: 'var(--bg)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No photo</div>}
                                            <div className="photo-label">{t('beforePhoto')}</div>
                                        </div>
                                        <div>
                                            {r.after_photo_url
                                                ? <img src={r.after_photo_url} alt="After" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
                                                : <div style={{ height: 160, background: 'var(--bg)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No after photo</div>}
                                            <div className="photo-label">{t('afterPhoto')}</div>
                                        </div>
                                    </div>
                                    {r.coordinator_note && (
                                        <div className="alert alert-warning mt-2">📝 {r.coordinator_note}</div>
                                    )}
                                    {!r.approved_by_coordinator && (
                                        <div className="flex gap-2 mt-2">
                                            <button className="btn btn-green" style={{ flex: 1 }} onClick={() => approve(r.id)}>✓ {t('approve')}</button>
                                            <button className="btn btn-red" style={{ flex: 1 }} onClick={() => { setRejectModal(r.id); setRejectNote(''); }}>✗ {t('reject')}</button>
                                        </div>
                                    )}
                                    {r.approved_by_coordinator && (
                                        <div className="alert alert-success mt-2">✓ Verified by Coordinator on {r.approval_date}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB: ANALYTICS */}
                {tab === 'analytics' && (
                    <div className="grid-2" style={{ gap: '1.5rem' }}>
                        <div className="chart-card">
                            <div className="chart-title">📊 Issues by Category</div>
                            <canvas id="chart-cat"></canvas>
                        </div>
                        <div className="chart-card">
                            <div className="chart-title">🍩 Status Breakdown</div>
                            <canvas id="chart-status"></canvas>
                        </div>
                        <div className="chart-card" style={{ gridColumn: '1/-1' }}>
                            <div className="chart-title">📈 Daily Reports (Last 30 Days)</div>
                            <canvas id="chart-daily"></canvas>
                        </div>
                    </div>
                )}

                {/* TAB: EVENTS */}
                {tab === 'events' && (
                    <div className="grid-2">
                        <div className="card">
                            <div className="card-header"><h3>📅 {t('createEvent')}</h3></div>
                            <form onSubmit={createEvent}>
                                {[
                                    { key: 'event_name', label: t('eventName'), type: 'text', req: true },
                                    { key: 'event_date', label: t('eventDate'), type: 'date', req: true },
                                    { key: 'location', label: t('location'), type: 'text' },
                                    { key: 'organized_by', label: t('organizedBy'), type: 'text' },
                                ].map(f => (
                                    <div key={f.key} className="form-group">
                                        <label className="form-label">{f.label}{f.req ? ' *' : ''}</label>
                                        <input className="form-control" type={f.type} required={f.req}
                                            value={eventForm[f.key]}
                                            onChange={e => setEventForm(ef => ({ ...ef, [f.key]: e.target.value }))} />
                                    </div>
                                ))}
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-control" value={eventForm.description}
                                        onChange={e => setEventForm(ef => ({ ...ef, description: e.target.value }))} />
                                </div>
                                <button className="btn btn-primary btn-full">{t('createEvent')}</button>
                            </form>
                        </div>
                        <div>
                            <h3 className="mb-2">Upcoming Events</h3>
                            {events.length === 0 ? (
                                <div className="card text-center"><p className="text-muted">No events yet.</p></div>
                            ) : events.map(ev => (
                                <div key={ev.id} className="event-card mb-2">
                                    <div className="event-date">📅 {ev.event_date}</div>
                                    <div className="event-title">{ev.event_name}</div>
                                    <div className="event-org">📍 {ev.location}</div>
                                    {ev.organized_by && <div className="event-org">🤝 {ev.organized_by}</div>}
                                    {ev.description && <p className="text-muted mt-1" style={{ fontSize: '0.82rem' }}>{ev.description}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════
function App() {
    const [view, setView] = useState('home'); // home|report|feed|login-worker|login-coord|ngo|worker-dash|coord-dash
    const [user, setUser] = useState(null);
    const [deviceId, setDeviceId] = useState('');

    useEffect(() => {
        getDeviceId().then(id => setDeviceId(id));
    }, []);

    const handleLogin = (data) => {
        setUser(data);
        if (data.role === 'worker') setView('worker-dash');
        else if (data.role === 'coordinator') setView('coord-dash');
    };

    const logout = () => { setUser(null); setView('home'); };

    if (view === 'login-worker') return <LoginPage role="worker" onLogin={handleLogin} onBack={() => setView('home')} />;
    if (view === 'login-coord') return <LoginPage role="coordinator" onLogin={handleLogin} onBack={() => setView('home')} />;
    if (view === 'ngo') return <NGORegisterPage deviceId={deviceId} onBack={() => setView('home')} />;
    if (view === 'report') return <ReportFlow deviceId={deviceId} onBack={() => setView('home')} />;
    if (view === 'worker-dash' && user?.role === 'worker') return <WorkerDashboard user={user} onLogout={logout} />;
    if (view === 'coord-dash' && user?.role === 'coordinator') return <CoordDashboard user={user} onLogout={logout} />;

    // HOME
    return (
        <div>
            <header className="site-header">
                <div className="brand">
                    <div className="brand-icon">🏙️</div>
                    <div><div className="brand-name">CivicPulse</div><div className="brand-sub">Bangalore Civic Portal</div></div>
                </div>
                <div className="header-actions">
                    <button className="btn-header" onClick={() => setView('login-worker')}>👷 Worker</button>
                    <button className="btn-header" onClick={() => setView('login-coord')}>🏛️ Coordinator</button>
                </div>
            </header>

            <div className="hero">
                <div className="hero-badge">📢 Bangalore Civic Issue Portal</div>
                <h1>Report. Track. Resolve.</h1>
                <p>Help make Bangalore better. Report potholes, broken streetlights, garbage, and sewage issues — and hold your government accountable.</p>
                <div className="hero-buttons">
                    <button className="btn btn-white btn-lg" onClick={() => setView('report')}>
                        📋 Report an Issue
                    </button>
                </div>
                <div className="hero-links">
                    <a className="hero-link" onClick={() => setView('ngo')} style={{ cursor: 'pointer' }}>🤝 Register as Social Worker / NGO</a>
                    <a className="hero-link" onClick={() => setView('login-worker')} style={{ cursor: 'pointer' }}>👷 Government Worker Login</a>
                    <a className="hero-link" onClick={() => setView('login-coord')} style={{ cursor: 'pointer' }}>🏛️ Coordinator Login</a>
                </div>
            </div>

            <div className="container" style={{ padding: '3rem 1.5rem' }}>
                <BudgetBox />

                <div className="grid-3 mt-3">
                    {[
                        { icon: '📋', title: 'Report Issues', desc: 'Submit civic problems with photos. AI verifies every report instantly.' },
                        { icon: '👷', title: 'Direct to Workers', desc: 'Reports are routed automatically to government workers based on category.' },
                        { icon: '✅', title: 'Track Resolution', desc: 'Get updates when workers and coordinators review your reported tasks.' }
                    ].map((f, i) => (
                        <div key={i} className="card text-center">
                            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{f.icon}</div>
                            <h3 style={{ marginBottom: '0.5rem' }}>{f.title}</h3>
                            <p className="text-muted">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Mount ───────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
