import React, { useState, useEffect } from 'react';

export function PhotoGallery({ reports }) {
    const [filterStatus, setFilterStatus] = useState('');
    const photos = reports.reduce((acc, r) => {
        if (filterStatus && r.status !== filterStatus) return acc;
        const cat = r.category || 'Other';
        const catEmoji = { Pothole: '🕳️', Streetlight: '💡', Garbage: '🗑️', Sewage: '🚰', Other: '📌' }[cat] || '📌';
        const statusLabel = { pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved' }[r.status] || r.status;
        if (r.before_photo_url) {
            acc.push({
                src: r.before_photo_url,
                label: `${catEmoji} ${cat} — ${statusLabel}`,
                date: r.created_at,
                id: r.id
            });
        }
        if (r.after_photo_url) {
            acc.push({
                src: r.after_photo_url,
                label: `✅ Fixed: ${cat}`,
                date: r.updated_at,
                id: r.id + '-after'
            });
        }
        return acc;
    }, []);

    // Sort newest images first
    photos.sort((a, b) => new Date(b.date) - new Date(a.date));

    return (
        <div className="gallery-section mt-4">
            <div className="container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <h3 className="mb-3">📸 {window.TRANSLATIONS.en.gallery}</h3>
                </div>

                {/* Filter bar */}
                <div className="filter-bar mb-3">
                    <label>Filter by status:</label>
                    {[['', 'All'], ['pending', '🔴 Pending'], ['in_progress', '🟡 In Progress'], ['resolved', '🟢 Resolved']].map(([val, label]) => (
                        <button key={val} className={`btn btn-sm ${filterStatus === val ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilterStatus(val)}>{label}</button>
                    ))}
                </div>

                {photos.length === 0 ? (
                    <div className="card text-center text-muted" style={{ padding: '3rem' }}>
                        📸 No photos found for this filter.
                    </div>
                ) : (
                    <div className="photo-grid">
                        {photos.map(p => (
                            <div key={p.id} className="photo-card" style={{ backgroundImage: `url(${p.src})` }}>
                                <div className="photo-label">{p.label}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
