import '../../split-core.js';
export const core = globalThis.SplitLedgerCore;
export class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };
export const player = id => ['p1', 'p2'].includes(id) ? id : fail(400, '請選擇裝置使用者');
export const other = id => id === 'p1' ? 'p2' : 'p1';
export const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(id) && !['__proto__', 'prototype', 'constructor'].includes(id) ? id : fail(400, '紀錄識別碼無效');
export const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export const hash = async value => b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
export async function secretMatches(a, b) {
    if (!a || !b) return false;
    const left = await hash(a), right = await hash(b);
    let result = 0; for (let i = 0; i < left.length; i++) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
    return result === 0;
}
export function validateSubscription(input) {
    let url;
    try { url = new URL(input?.endpoint); } catch { fail(400, '推播訂閱無效'); }
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || input.endpoint.length > 4096 ||
        !(host.endsWith('.push.apple.com') || host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com')) fail(400, '不支援此推播服務');
    const key = (value, length) => {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail(400, '推播金鑰無效');
        try { if (atob(value.replace(/-/g, '+').replace(/_/g, '/')).length !== length) fail(400, '推播金鑰長度無效'); } catch { fail(400, '推播金鑰無效'); }
        return value;
    };
    const p256dh = key(input.keys?.p256dh, 65), auth = key(input.keys?.auth, 16);
    if (atob(p256dh.replace(/-/g, '+').replace(/_/g, '/')).charCodeAt(0) !== 4) fail(400, '推播公鑰無效');
    return { endpoint: url.href, expirationTime: input.expirationTime || null, keys: { p256dh, auth } };
}
export function recordDraft(value) {
    if (!value || !Number.isFinite(value.p1_bought) || !Number.isFinite(value.p2_bought) || value.p1_bought < 0 || value.p2_bought < 0 || value.p1_bought > 10000000 || value.p2_bought > 10000000 || String(value.note || '').length > 200) fail(400, '帳目內容無效');
    const validation = core.validateRecordDraft({ p1_bought: value.p1_bought, p2_bought: value.p2_bought, payer: value.payer, note: value.note });
    if (!validation.valid) fail(400, validation.reason);
    return validation.record;
}
export function settlementDraft(value) {
    if (!['all', 'selected'].includes(value?.mode) || !Array.isArray(value.ids) || !value.ids.length || value.ids.length > 1000) fail(400, '結清內容無效');
    const ids = [...new Set(value.ids.map(validId))].sort();
    return { mode: value.mode, ids };
}
export function notification(event, data, appUrl) {
    if (event.type === 'system') return { eventId: event.id, title: event.intent.title, body: event.intent.body, targetPath: new URL('index.html', appUrl).href };
    const settlement = event.type === 'settlement';
    const params = new URLSearchParams({ view: settlement ? 'settled' : 'unsettled', [settlement ? 'settlement' : 'record']: event.recordId });
    return {
        eventId: event.id, title: settlement ? '結清紀錄更新' : '宿舍帳本',
        body: settlement ? '室友新增了一筆結清紀錄。' : `室友新增了一筆 NT$${core.roundMoney(data.p1_bought + data.p2_bought).toLocaleString('zh-TW')} 的支出。`,
        targetPath: new URL(`split.html?${params}`, appUrl).href,
    };
}
