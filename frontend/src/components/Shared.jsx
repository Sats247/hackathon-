import React, { useEffect } from 'react';

export function Snackbar({ message, onDone }) {
    useEffect(() => {
        const t = setTimeout(onDone, 3000);
        return () => clearTimeout(t);
    }, [onDone]);
    return <div className="snackbar">{message}</div>;
}

export function StatusBadge({ status, large }) {
    // Labels are hardcoded for simplicity here, or you can import `t` from api.js
    const labels = { pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved' };
    const colors = { pending: 'red', in_progress: 'yellow', resolved: 'green' };
    const color = colors[status] || status;
    const cls = large ? `status-pill ${color}` : `badge badge-${color}`;
    return <span className={cls}>{labels[status] || status}</span>;
}

export function CatBadge({ cat }) {
    const icons = { Pothole: '🕳️', Streetlight: '💡', Garbage: '🗑️', Sewage: '🚰', Other: '📌' };
    return <span className="badge badge-blue">{icons[cat] || '📌'} {cat || 'Other'}</span>;
}
