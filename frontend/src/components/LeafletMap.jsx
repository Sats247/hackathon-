import React, { useEffect, useRef } from 'react';

export function LeafletMap({ lat, lng, onMove, reports, height }) {
    const divRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);

    useEffect(() => {
        if (mapRef.current) return;
        const center = (lat && lng) ? [lat, lng] : [12.9716, 77.5946];
        const map = window.L.map(divRef.current, { zoomControl: true }).setView(center, 14);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        mapRef.current = map;

        if (onMove) {
            const pin = window.L.marker(center, { draggable: true }).addTo(map);
            markerRef.current = pin;
            pin.on('dragend', e => { const p = e.target.getLatLng(); onMove(p.lat, p.lng); });
            map.on('click', e => { pin.setLatLng(e.latlng); onMove(e.latlng.lat, e.latlng.lng); });
        }

        if (reports && reports.length > 0) {
            const statusColorMap = { pending: '#E74C3C', in_progress: '#F39C12', resolved: '#27AE60' };
            reports.forEach(r => {
                if (!r.latitude || !r.longitude) return;
                const color = statusColorMap[r.status] || '#888';
                const icon = window.L.divIcon({
                    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
                    className: '', iconSize: [14, 14], iconAnchor: [7, 7]
                });
                const m = window.L.marker([r.latitude, r.longitude], { icon }).addTo(map);
                m.bindPopup(`<div class="popup-title">${r.title}</div><div class="popup-meta">${r.category} · ${r.status}</div><div class="popup-meta">👍 ${r.upvotes} votes</div>${r.before_photo_url ? `<img src="${r.before_photo_url}" style="width:100%;margin-top:6px;border-radius:4px;" />` : ''}`);
            });
        }

        return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    }, [lat, lng, onMove, reports]);

    useEffect(() => {
        if (!markerRef.current || !lat || !lng) return;
        markerRef.current.setLatLng([lat, lng]);
        mapRef.current && mapRef.current.setView([lat, lng], 15);
    }, [lat, lng]);

    return <div ref={divRef} className="map-container" style={{ height: height || '300px' }} />;
}
