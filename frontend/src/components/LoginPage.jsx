import React, { useState } from 'react';
import { apiPost, t } from '../api';

export function LoginPage({ role, onLogin, onBack }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async e => {
        e.preventDefault();
        setLoading(true);
        setError('');
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
