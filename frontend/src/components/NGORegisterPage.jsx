import React, { useState } from 'react';
import { apiPost, t } from '../api';

export function NGORegisterPage({ deviceId, onBack }) {
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
