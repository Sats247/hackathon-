import React, { useState } from 'react';
import { apiGet, apiPost, apiPostForm, t } from '../api';
import { Snackbar, StatusBadge } from './Shared';
import { LeafletMap } from './LeafletMap';

export function ReportFlow({ deviceId, onBack }) {
    const [step, setStep] = useState(1); // 1=Photo, 2=Location, 3=Details, 4=Confirm
    const [photoFile, setPhotoFile] = useState(null);
    const [photoURL, setPhotoURL] = useState('');
    const [aiStatus, setAiStatus] = useState(''); // ''|'validating'|'valid'|'invalid'
    const [aiReason, setAiReason] = useState('');
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
    const runValidation = async (file) => {
        setAiStatus('validating');
        setAiReason('');
        try {
            const fd = new FormData();
            fd.append('photo', file);
            const r = await apiPostForm('/api/validate-image', fd);
            if (r.ok && r.data.result === 'Invalid') {
                setAiStatus('invalid');
                setAiReason(r.data.reason || 'This image does not appear to show a civic issue.');
            } else {
                // Any other response (Valid, network error, etc.) -> allow user through
                setAiStatus('valid');
            }
        } catch (err) {
            // Network failure -> fail open so user isn't stuck
            setAiStatus('valid');
        }
    };

    const handlePhoto = async file => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setSnack('File too large. Max 5MB.'); return; }
        setPhotoFile(file);
        setPhotoURL(URL.createObjectURL(file));
        await runValidation(file);
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
                    {aiStatus === 'invalid' && (
                        <div className="alert alert-error mt-2">
                            <div>
                                <div>❌ {t('photoInvalid')}</div>
                                <div style={{ fontSize: '0.82rem', marginTop: '0.4rem', opacity: 0.8 }}>
                                    Make sure your photo clearly shows a civic issue (pothole, garbage, broken light, sewage).
                                    {aiReason && <div style={{ marginTop: '0.3rem', fontWeight: 500 }}>AI says: {aiReason}</div>}
                                </div>
                                <button className="btn btn-sm btn-secondary mt-2"
                                    onClick={() => photoFile && runValidation(photoFile)}>
                                    🔄 Try again
                                </button>
                                <button className="btn btn-sm btn-ghost mt-2" style={{ marginLeft: 8 }}
                                    onClick={() => setAiStatus('valid')}>
                                    Skip check →
                                </button>
                            </div>
                        </div>
                    )}

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
                    <div className="mt-2"><StatusBadge status="pending" /></div>
                    <div className="flex gap-2 mt-3" style={{ justifyContent: 'center' }}>
                        <button className="btn btn-secondary" onClick={onBack}>Back to Home</button>
                    </div>
                </div>
            )}
        </div>
    );
}
