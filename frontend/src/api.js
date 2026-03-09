// ─── Translations ────────────────────────────────────────────────────────────
export let _lang = 'en';

export function setLang(lang) {
    _lang = lang;
}

export function t(key) {
    // We assume window.TRANSLATIONS is loaded from public/translations.js in index.html
    const tr = window.TRANSLATIONS[_lang] || window.TRANSLATIONS.en;
    let val = key.split('.').reduce((o, k) => (o || {})[k], tr);
    if (val === undefined) val = key.split('.').reduce((o, k) => (o || {})[k], window.TRANSLATIONS.en);
    return val || key;
}

// ─── API helpers ─────────────────────────────────────────────────────────────
export async function api(path, opts = {}) {
    const res = await fetch(path, opts);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: json };
}

export function apiGet(path) {
    return api(path);
}

export function apiPost(path, body) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

export function apiPostForm(path, formData) {
    return api(path, { method: 'POST', body: formData });
}

// ─── Device Fingerprint ──────────────────────────────────────────────────────
export async function getDeviceId() {
    const raw = navigator.userAgent + screen.width + 'x' + screen.height + screen.colorDepth;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
