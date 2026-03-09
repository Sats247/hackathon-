import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, t } from '../api';
import { Snackbar, StatusBadge, CatBadge } from './Shared';

export function WorkerDashboard({ worker, onLogout }) {
    const [tasks, setTasks] = useState([]);
    const [snack, setSnack] = useState('');
    const [doneModal, setDoneModal] = useState(null); // task id
    const [afterPhoto, setAfterPhoto] = useState(null);
    const [uploading, setUploading] = useState(false);

    const loadTasks = async () => {
        const r = await apiGet(`/api/tasks/${worker.username}`);
        if (r.ok) setTasks(r.data);
    };
    useEffect(() => { loadTasks(); }, [worker]);

    const startWork = async (id) => {
        await apiPost(`/api/reports/${id}/status`, { status: 'in_progress' });
        setSnack('Task started!');
        loadTasks();
    };

    const markDone = (id) => setDoneModal(id);
    const submitDone = async () => {
        if (!afterPhoto) { setSnack('Photo required to mark done'); return; }
        setUploading(true);
        const fd = new FormData();
        fd.append('photo', afterPhoto);
        fd.append('status', 'resolved');
        const r = await apiPostForm(`/api/reports/${doneModal}/status`, fd);
        setUploading(false);
        if (r.ok) { setSnack('Task marked resolved!'); setDoneModal(null); setAfterPhoto(null); loadTasks(); }
        else setSnack('Failed to update task');
    };

    return (
        <div className="container page">
            {snack && <Snackbar message={snack} onDone={() => setSnack('')} />}
            <div className="card worker-header-card mb-4">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>👷 {t('workerDashboard')}</h2>
                        <div className="text-muted mt-1">{worker.display} ({worker.category})</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={onLogout}>{t('logout')}</button>
                </div>
            </div>

            {doneModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3>✅ Mark Task as Resolved</h3>
                        <p>Upload a photo showing the completed work.</p>
                        <input type="file" className="form-control mb-3" accept=".jpg,.png" onChange={e => setAfterPhoto(e.target.files[0])} />
                        <div className="modal-btns">
                            <button className="btn btn-ghost" onClick={() => setDoneModal(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={submitDone} disabled={!afterPhoto || uploading}>
                                {uploading ? 'Uploading...' : 'Submit Resolution'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <h3>📋 {t('yourTasks')} ({tasks.length})</h3>
            {tasks.length === 0 && <p className="text-muted mt-2">No tasks assigned to you right now. Great job!</p>}
            <div className="grid-2 mt-3">
                {tasks.map(task => (
                    <div className="card task-card" key={task.id}>
                        {task.before_photo_url && (
                            <div className="task-card-img" style={{ backgroundImage: `url(${task.before_photo_url})` }} />
                        )}
                        <div className="task-card-body">
                            <div className="flex" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <CatBadge cat={task.category} />
                                <StatusBadge status={task.status} />
                            </div>
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>{task.title}</h4>
                            <p className="task-meta mb-2">📍 {task.manual_address || (task.latitude && task.longitude ? `${task.latitude.toFixed(4)}, ${task.longitude.toFixed(4)}` : 'No location')}</p>
                            {task.description && <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem', flex: 1 }}>{task.description}</p>}
                            <div className="task-card-row">
                                {task.navigator_url && (
                                    <a href={task.navigator_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-full" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                                        🗺️ {t('navigate')}
                                    </a>
                                )}
                                <div className="task-card-row">
                                    {task.status === 'pending' && (
                                        <button className="btn btn-yellow btn-full" onClick={() => startWork(task.id)}>
                                            ▶️ {t('startWork')}
                                        </button>
                                    )}
                                    {(task.status === 'pending' || task.status === 'in_progress') && (
                                        <button className="btn btn-green btn-full" onClick={() => markDone(task.id)}>
                                            ✅ {t('markDone')}
                                        </button>
                                    )}
                                    {task.status === 'resolved' && (
                                        <div className="badge badge-green" style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', width: '100%', justifyContent: 'center' }}>
                                            ✅ Completed
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
