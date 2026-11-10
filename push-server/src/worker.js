import { buildPushPayload } from '@block65/webcrypto-web-push';
import { FirebaseStore, customToken } from './firebase.js';
import { commitEvent } from './ledger.js';
import { HttpError, fail, hash, notification, other, player, randomToken, recordDraft, secretMatches, settlementDraft, validId, validateSubscription } from './protocol.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const terminal = event => ['sent', 'cancelled', 'failed', 'expired'].includes(event.status);
const backoff = attempt => [15000, 60000, 300000, 1800000][Math.min(attempt, 3)];
export class DormPush {
    constructor(ctx, env) {
        this.ctx = ctx; this.env = env; this.storage = ctx.storage;
        this.db = new FirebaseStore(env); this.jobs = new Map();
    }
    async fetch(request) {
        try { return json(await this.route(request)); }
        catch (error) { return json({ error: error instanceof HttpError ? error.message : '推播服務暫時無法使用，請重試' }, error.status || 503); }
    }
    async body(request) {
        if (Number(request.headers.get('Content-Length')) > 65536) fail(413, '請求過大');
        const reader = request.body?.getReader(), chunks = []; let size = 0;
        if (reader) {
            try {
                while (true) {
                    const { done, value } = await reader.read(); if (done) break;
                    size += value.byteLength;
                    if (size > 65536) { await reader.cancel(); fail(413, '請求過大'); }
                    chunks.push(value);
                }
            } finally { reader.releaseLock(); }
        }
        const buffer = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
        const text = new TextDecoder().decode(buffer);
        try { return JSON.parse(text || '{}'); } catch { fail(400, '請求格式錯誤'); }
    }
    async device(request) {
        const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, '請先啟用此裝置');
        const id = await hash(token); let device = await this.storage.get(`device:${id}`);
        if (!device || device.expiresAt <= Date.now()) fail(401, '裝置授權已失效，請重新啟用');
        const access = await this.db.read(`_dormAccess/devices/device_${id}`);
        if (!access || access.userId !== device.userId || !Number.isFinite(access.expiresAt) || access.expiresAt <= Date.now()) fail(401, '裝置授權已失效，請重新啟用');
        if (device.expiresAt - Date.now() < 30 * 86400000) {
            const expiresAt = Date.now() + 180 * 86400000;
            const registry = await this.db.update(`_dormAccess/devices/device_${id}`, current => {
                if (!current || current.userId !== device.userId) return undefined;
                return { ...current, expiresAt: Math.max(current.expiresAt, expiresAt) };
            });
            if (!registry || registry.expiresAt <= Date.now()) fail(401, '裝置授權已失效，請重新啟用');
            device = await this.storage.transaction(async tx => {
                const current = await tx.get(`device:${id}`);
                if (!current || current.expiresAt <= Date.now()) fail(401, '裝置授權已失效，請重新啟用');
                const renewed = { ...current, expiresAt: registry.expiresAt };
                await tx.put(`device:${id}`, renewed);
                return renewed;
            });
        }
        return { ...device, id };
    }
    async wakeAt(time) {
        const current = await this.storage.getAlarm();
        if (!current || current > time) await this.storage.setAlarm(time);
    }
    async route(request) {
        const path = new URL(request.url).pathname;
        if (request.method === 'GET' && path === '/config') return {
            publicKey: this.env.VAPID_PUBLIC_KEY || '', ready: Boolean(this.env.ADMIN_SECRET && this.env.VAPID_PUBLIC_KEY && this.env.VAPID_PRIVATE_KEY && this.env.FIREBASE_SERVICE_ACCOUNT),
        };
        if (path.startsWith('/admin/')) return this.admin(request, path);
        if (request.method === 'POST' && path === '/pair') {
            const input = await this.body(request), userId = player(input.userId);
            if (typeof input.invitation !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.invitation)) fail(403, '私人啟用連結無效');
            const inviteKey = `invite:${await hash(input.invitation)}`;
            const token = randomToken(), tokenHash = await hash(token);
            await this.storage.transaction(async tx => {
                const invite = await tx.get(inviteKey);
                if (!invite || invite.expiresAt < Date.now() || invite.remaining < 1) fail(403, '私人啟用連結已失效，請索取新連結');
                const devices = await tx.list({ prefix: 'device:' });
                if ([...devices.values()].filter(device => device.userId === userId && device.expiresAt > Date.now()).length >= 8) fail(409, '此使用者已達裝置上限，請管理者移除舊裝置');
                await tx.put(inviteKey, { ...invite, remaining: invite.remaining - 1 });
                await tx.put(`device:${tokenHash}`, { userId, createdAt: Date.now(), expiresAt: Date.now() + 180 * 86400000 });
            });
            try {
                const device = await this.storage.get(`device:${tokenHash}`);
                await this.db.update(`_dormAccess/devices/device_${tokenHash}`, () => ({ userId, expiresAt: device.expiresAt }));
            } catch (error) {
                await this.storage.transaction(async tx => {
                    await tx.delete(`device:${tokenHash}`);
                    const invite = await tx.get(inviteKey);
                    if (invite && invite.expiresAt > Date.now()) await tx.put(inviteKey, { ...invite, remaining: invite.remaining + 1 });
                });
                throw error;
            }
            return { token, userId };
        }
        const device = await this.device(request);
        if (path === '/status' && request.method === 'GET') {
            const enabled = await this.storage.get(`enabled:${device.userId}`);
            return { userId: device.userId, enabled: Boolean(enabled), notificationConfigured: typeof enabled === 'boolean', subscribedHere: Boolean(await this.storage.get(`sub:${device.id}`)) };
        }
        if (path === '/firebase-token' && request.method === 'GET') {
            return { token: await customToken(this.env, `device_${device.id}`), expiresAt: device.expiresAt };
        }
        const input = await this.body(request);
        if (request.method !== 'POST') fail(405, '不支援此操作');
        if (path === '/subscription') {
            const subscription = validateSubscription(input.subscription);
            const subscriptions = await this.storage.list({ prefix: 'sub:' });
            if ([...subscriptions.entries()].some(([key, item]) => key !== `sub:${device.id}` && item.subscription.endpoint === subscription.endpoint)) fail(409, '此訂閱已綁定另一部裝置，請先停用原裝置');
            await this.storage.transaction(async tx => {
                await tx.put(`sub:${device.id}`, { userId: device.userId, subscription, createdAt: Date.now() });
                await tx.put(`enabled:${device.userId}`, true);
            });
            return { enabled: true, subscribedHere: true };
        }
        if (path === '/disable') {
            await this.storage.transaction(async tx => {
                await tx.put(`enabled:${device.userId}`, false);
                const all = await tx.list({ prefix: 'sub:' });
                for (const [key, item] of all) if (item.userId === device.userId) await tx.delete(key);
            });
            return { enabled: false, subscribedHere: false };
        }
        if (path === '/forget') {
            await this.db.update(`_dormAccess/devices/device_${device.id}`, () => null);
            await this.storage.delete(`sub:${device.id}`); await this.storage.delete(`device:${device.id}`);
            return { removed: true };
        }
        if (path === '/ledger/create' || path === '/ledger/settle') {
            const type = path.endsWith('create') ? 'expense' : 'settlement', recordId = validId(input.id);
            const intent = type === 'expense' ? recordDraft(input.record) : settlementDraft(input);
            const id = `${type}:${recordId}`, fingerprint = await hash(JSON.stringify(intent));
            // Install the alarm before accepting durable work; retries survive a closed browser.
            await this.wakeAt(Date.now() + 1000);
            await this.storage.transaction(async tx => {
                const prior = await tx.get(`event:${id}`);
                if (prior) {
                    if (prior.actorUserId !== device.userId || prior.fingerprint !== fingerprint) fail(409, '此操作已由其他內容使用');
                    return;
                }
                const day = new Date().toISOString().slice(0, 10), rateKey = `rate:${device.userId}:${day}`;
                const count = Number(await tx.get(rateKey) || 0);
                if (count >= 200) fail(429, '今日新增操作已達保護上限');
                await tx.put(rateKey, count + 1);
                await tx.put(`event:${id}`, { id, type, recordId, intent, fingerprint, actorUserId: device.userId, recipients: [other(device.userId)], createdAt: Date.now(), status: 'writing', nextAt: Date.now(), attempts: 0, deliveries: {} });
            });
            await this.process(id, true);
            const event = await this.storage.get(`event:${id}`);
            if (event.status === 'failed') fail(409, event.error || '資料已變更，請重新確認');
            if (event.status === 'writing') fail(503, '資料仍在確認，請保持原內容重試');
            const record = await this.db.read(`split/${type === 'expense' ? 'records' : 'settlements'}/${recordId}`);
            return { id: recordId, record, eventId: id };
        }
        if (path === '/ready') {
            const id = String(input.eventId || '');
            if (this.jobs.has(id)) await this.jobs.get(id);
            const nextAt = await this.storage.transaction(async tx => {
                const event = await tx.get(`event:${id}`);
                if (!event || event.actorUserId !== device.userId) fail(404, '找不到這次操作');
                if (event.status !== 'pending' || event.acknowledgedAt) return null;
                const now = Date.now();
                await tx.put(`event:${id}`, { ...event, acknowledgedAt: now, nextAt: now + 7000 });
                return now + 7000;
            });
            if (nextAt) await this.wakeAt(nextAt);
            return { accepted: true };
        }
        fail(404, '找不到此操作');
    }
    async admin(request, path) {
        const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
        if (!(await secretMatches(token, this.env.ADMIN_SECRET))) fail(403, '管理授權失敗');
        const input = await this.body(request);
        if (request.method !== 'POST') fail(405, '不支援此操作');
        if (path === '/admin/invitations') {
            const token = randomToken(), remaining = Number(input.uses ?? 2);
            if (!Number.isInteger(remaining) || remaining < 1 || remaining > 8) fail(400, '啟用次數需為 1 至 8');
            await this.storage.put(`invite:${await hash(token)}`, { remaining, expiresAt: Date.now() + 86400000 });
            return { activationUrl: new URL(`index.html#activate=${token}`, this.env.APP_URL).href, expiresInHours: 24 };
        }
        if (path === '/admin/announce') {
            const recordId = validId(input.id), title = String(input.title || '').trim(), body = String(input.body || '').trim();
            if (!title || title.length > 50 || !body || body.length > 250 || !['both', 'p1', 'p2'].includes(input.recipient)) fail(400, '公告內容無效');
            const id = `system:${recordId}`, intent = { title, body }, recipients = input.recipient === 'both' ? ['p1', 'p2'] : [input.recipient];
            const fingerprint = await hash(JSON.stringify({ intent, recipients }));
            await this.wakeAt(Date.now() + 1000);
            await this.storage.transaction(async tx => {
                const prior = await tx.get(`event:${id}`);
                if (prior && prior.fingerprint !== fingerprint) fail(409, '公告識別碼已使用');
                if (!prior) await tx.put(`event:${id}`, { id, type: 'system', recordId, actorUserId: 'admin', recipients, intent, fingerprint, status: 'pending', createdAt: Date.now(), nextAt: Date.now(), attempts: 0, deliveries: {} });
            });
            return { accepted: true, eventId: id };
        }
        if (path === '/admin/revoke-device') {
            const id = String(input.deviceId || '');
            if (!/^[A-Za-z0-9_-]{43}$/.test(id)) fail(400, '裝置識別碼無效');
            await this.db.update(`_dormAccess/devices/device_${id}`, () => null);
            await this.storage.delete(`device:${id}`); await this.storage.delete(`sub:${id}`); return { removed: true };
        }
        if (path === '/admin/status') {
            const devices = await this.storage.list({ prefix: 'device:' });
            const subscriptions = await this.storage.list({ prefix: 'sub:' });
            const events = await this.storage.list({ prefix: 'event:' });
            return {
                devices: [...devices].map(([key, item]) => ({ deviceId: key.slice(7), ...item, subscribed: subscriptions.has('sub:' + key.slice(7)) })),
                events: [...events.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(({ id, type, status, attempts, error }) => ({ id, type, status, attempts, error })),
            };
        }
        fail(404, '找不到此管理操作');
    }
    async process(id, writeOnly = false) {
        if (this.jobs.has(id)) return this.jobs.get(id);
        const job = this.processOne(id, writeOnly).finally(() => this.jobs.delete(id));
        this.jobs.set(id, job); return job;
    }
    async processOne(id, writeOnly) {
        let event = await this.storage.get(`event:${id}`);
        if (!event || terminal(event)) return;
        try {
            if (event.status === 'writing') {
                await commitEvent(this.db, event);
                event = { ...event, status: 'pending', committedAt: Date.now(), nextAt: Date.now() + 60000 };
                await this.storage.put(`event:${id}`, event); await this.wakeAt(event.nextAt);
            }
            if (writeOnly || event.nextAt > Date.now()) return;
            if (Date.now() - event.createdAt > 86400000) { event.status = 'expired'; await this.storage.put(`event:${id}`, event); return; }
            const data = event.type === 'system' ? null : await this.db.read(`split/${event.type === 'expense' ? 'records' : 'settlements'}/${event.recordId}`);
            if (event.type !== 'system' && (!data || data.deletedAt || data.undoneAt)) { event.status = 'cancelled'; await this.storage.put(`event:${id}`, event); return; }
            if (data?.budgetSync) throw new Error('Budget still pending');
            const payload = notification(event, data, this.env.APP_URL);
            const subscriptions = await this.storage.list({ prefix: 'sub:' });
            let pending = false;
            for (const [key, item] of subscriptions) {
                if (!event.recipients.includes(item.userId) || !(await this.storage.get(`enabled:${item.userId}`)) || ['sent', 'gone', 'skipped'].includes(event.deliveries[key])) continue;
                const device = await this.storage.get(`device:${key.slice(4)}`);
                if (!device || device.expiresAt <= Date.now()) { await this.storage.delete(key); continue; }
                const sent = await this.send(item.subscription, payload, event, item.userId);
                if (sent === 'gone') { await this.storage.delete(key); event.deliveries[key] = 'gone'; }
                else if (sent === 'sent') event.deliveries[key] = 'sent';
                else if (sent === 'skipped') event.deliveries[key] = 'skipped';
                else pending = true;
                await this.storage.put(`event:${id}`, event);
            }
            event.status = pending ? 'pending' : 'sent';
            event.nextAt = Date.now() + backoff(event.attempts++);
            if (event.attempts >= 5 && pending) event.status = 'failed';
            await this.storage.put(`event:${id}`, event);
            if (!terminal(event)) await this.wakeAt(event.nextAt);
        } catch (error) {
            event.attempts++;
            event.error = error instanceof HttpError ? error.message : '服務暫時無法連線';
            if ((error.status >= 400 && error.status < 500) || event.attempts >= 5) event.status = 'failed';
            event.nextAt = Date.now() + backoff(event.attempts - 1);
            await this.storage.put(`event:${id}`, event);
            if (!terminal(event)) await this.wakeAt(event.nextAt);
        }
    }
    async send(subscription, payload, event, userId) {
        const request = await buildPushPayload({ data: payload, options: { ttl: 3600, urgency: 'normal', topic: (await hash(event.id)).slice(0, 32) } }, subscription, {
            subject: this.env.VAPID_SUBJECT, publicKey: this.env.VAPID_PUBLIC_KEY, privateKey: this.env.VAPID_PRIVATE_KEY,
        });
        if (!(await this.storage.get(`enabled:${userId}`))) return 'skipped';
        const response = await fetch(subscription.endpoint, { ...request, redirect: 'manual', signal: AbortSignal.timeout(8000) });
        if ([404, 410].includes(response.status)) return 'gone';
        return response.ok ? 'sent' : 'retry';
    }
    async alarm() {
        // A continuation alarm is installed first so a failed invocation cannot strand work.
        await this.storage.setAlarm(Date.now() + 60000);
        const events = await this.storage.list({ prefix: 'event:' });
        // Small batches bound outbound calls even if many operations accumulated offline.
        const due = [...events.values()].filter(event => !terminal(event) && event.nextAt <= Date.now()).sort((a, b) => a.nextAt - b.nextAt).slice(0, 2);
        for (const event of due) await this.process(event.id);
        let next = Infinity;
        for (const event of (await this.storage.list({ prefix: 'event:' })).values()) {
            if (!terminal(event)) next = Math.min(next, event.nextAt);
            else if (Date.now() - event.createdAt > 30 * 86400000) await this.storage.delete(`event:${event.id}`);
        }
        for (const [key, item] of await this.storage.list({ prefix: 'invite:' })) if (item.expiresAt < Date.now()) await this.storage.delete(key);
        for (const [key, item] of await this.storage.list({ prefix: 'device:' })) if (item.expiresAt < Date.now()) { await this.storage.delete(key); await this.storage.delete(`sub:${key.slice(7)}`); }
        for (const [key] of await this.storage.list({ prefix: 'rate:' })) if (Date.parse(key.slice(-10)) < Date.now() - 2 * 86400000) await this.storage.delete(key);
        if (Number.isFinite(next)) await this.storage.setAlarm(Math.max(Date.now() + 1000, next));
        else await this.storage.deleteAlarm();
    }
}
export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin');
        const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
        if (origin && !allowed.includes(origin)) return json({ error: '網站來源不允許' }, 403);
        const headers = { 'Access-Control-Allow-Origin': origin || allowed[0] || '', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        const response = await env.DORM.get(env.DORM.idFromName('private-dorm')).fetch(request);
        const result = new Response(response.body, response); for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
        return result;
    },
};
