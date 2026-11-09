import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { importJWK, jwtVerify, generateKeyPair, exportPKCS8 } from 'jose';
import { DormPush } from '../src/worker.js';
import { recordDraft, validateSubscription, validId, b64, hash, core } from '../src/protocol.js';
import { adjustBudget } from '../src/budget.js';
import { commitEvent } from '../src/ledger.js';
import { FirebaseStore, customToken } from '../src/firebase.js';

const clone = value => value === undefined ? undefined : structuredClone(value);
class Storage {
    map = new Map(); alarm = null;
    async get(key) { return clone(this.map.get(key)); }
    async put(key, value) { this.map.set(key, clone(value)); }
    async delete(key) { this.map.delete(key); }
    async list({ prefix }) { return new Map([...this.map].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, clone(value)])); }
    async getAlarm() { return this.alarm; }
    async setAlarm(value) { this.alarm = value; }
    async deleteAlarm() { this.alarm = null; }
    queue = Promise.resolve();
    transaction(fn) { const task = this.queue.then(() => fn(this)); this.queue = task.catch(() => {}); return task; }
}
class Database {
    state = { split: { records: {}, settlements: {} } }; writes = 0;
    async read(path) { return clone(path.split('/').reduce((value, key) => value?.[key], this.state)) || null; }
    async update(path, fn) {
        const value = fn(await this.read(path)); if (value === undefined) return this.read(path);
        this.writes++;
        const parts = path.split('/'), leaf = parts.pop(); let parent = this.state;
        for (const part of parts) parent = parent[part] ||= {};
        if (value === null) delete parent[leaf]; else parent[leaf] = clone(value);
        return clone(value);
    }
}
async function subscription(endpoint = 'https://web.push.apple.com/test') {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    return { endpoint, keys: { p256dh: b64(await crypto.subtle.exportKey('raw', pair.publicKey)), auth: b64(crypto.getRandomValues(new Uint8Array(16))) } };
}
async function fixture() {
    const storage = new Storage(), server = new DormPush({ storage }, { APP_URL: 'https://example.com/SleepBank/', ADMIN_SECRET: 'private-test-only' });
    server.db = new Database(); const sent = [];
    server.send = async (sub, payload, event, userId) => { sent.push({ sub, payload, eventId: event.id, userId }); return 'sent'; };
    async function call(path, body, token) {
        const response = await server.fetch(new Request('https://worker.test' + path, { method: body === undefined ? 'GET' : 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: body === undefined ? undefined : JSON.stringify(body) }));
        return { status: response.status, body: await response.json() };
    }
    const invite = await call('/admin/invitations', { uses: 8 }, 'private-test-only');
    const invitation = new URL(invite.body.activationUrl).hash.slice(10);
    const a = (await call('/pair', { userId: 'p1', invitation })).body;
    const b = (await call('/pair', { userId: 'p2', invitation })).body;
    await call('/subscription', { subscription: await subscription('https://web.push.apple.com/a') }, a.token);
    await call('/subscription', { subscription: await subscription('https://web.push.apple.com/b') }, b.token);
    async function deliver(id) { const key = `event:${id}`, event = await storage.get(key); await storage.put(key, { ...event, nextAt: 0 }); await server.process(id); }
    return { server, storage, call, a, b, sent, deliver, invitation };
}
const draft = { p1_bought: 100.25, p2_bought: 50.5, payer: 'p1', note: '早餐' };

test('canonical draft rejects negatives and strips forged fields', () => {
    assert.throws(() => recordDraft({ ...draft, p1_bought: -1 }));
    const value = recordDraft({ ...draft, timestamp: 1, settled: true, budgetSync: { opId: 'fake' }, recipient: 'p1' });
    assert.deepEqual(Object.keys(value).sort(), ['note', 'p1_bought', 'p2_bought', 'payer']);
    for (const id of ['__proto__', 'constructor', 'prototype']) assert.throws(() => validId(id));
});
test('subscription rejects local, arbitrary, credentials and fake keys', async () => {
    const valid = await subscription(); assert.deepEqual(validateSubscription(valid), { ...valid, expirationTime: null });
    for (const endpoint of ['http://web.push.apple.com/a', 'https://127.0.0.1/a', 'https://evil.test/a', 'https://web.push.apple.com.evil.test/a', 'https://x:y@web.push.apple.com/a']) assert.throws(() => validateSubscription({ ...valid, endpoint }));
    assert.throws(() => validateSubscription({ ...valid, keys: { p256dh: 'bad', auth: 'bad' } }));
});
test('private pairing and administration cannot be invoked by ordinary devices', async () => {
    const f = await fixture();
    assert.equal((await f.call('/status')).status, 401);
    assert.equal((await f.call('/pair', { userId: 'p2', invitation: 'bad' })).status, 403);
    assert.equal((await f.call('/admin/announce', {}, f.a.token)).status, 403);
    assert.equal((await f.call('/admin/status', {}, 'private-test-only')).status, 200);
    const status = (await f.call('/status', undefined, f.a.token)).body;
    assert.deepEqual(Object.keys(status).sort(), ['enabled', 'subscribedHere', 'userId']);
});
test('pairing registers device access, forgetting revokes it without affecting the other device', async () => {
    const f = await fixture(), aId = 'device_' + await hash(f.a.token), bId = 'device_' + await hash(f.b.token);
    assert.equal((await f.server.db.read('_dormAccess/devices/' + aId)).userId, 'p1');
    assert.equal((await f.server.db.read('_dormAccess/devices/' + bId)).userId, 'p2');
    assert.equal((await f.call('/forget', {}, f.a.token)).status, 200);
    assert.equal(await f.server.db.read('_dormAccess/devices/' + aId), null);
    assert.ok(await f.server.db.read('_dormAccess/devices/' + bId));
    assert.equal((await f.call('/firebase-token', undefined, f.a.token)).status, 401);
});
test('active devices renew their access without a new invitation; revoked devices cannot renew', async () => {
    const f = await fixture(), id = await hash(f.a.token), path = '_dormAccess/devices/device_' + id;
    const old = await f.storage.get('device:' + id); old.expiresAt = Date.now() + 10 * 86400000;
    await f.storage.put('device:' + id, old); await f.server.db.update(path, item => ({ ...item, expiresAt: old.expiresAt }));
    assert.equal((await f.call('/status', undefined, f.a.token)).status, 200);
    assert.ok((await f.server.db.read(path)).expiresAt > Date.now() + 170 * 86400000);
    old.expiresAt = Date.now() + 10 * 86400000; await f.storage.put('device:' + id, old);
    await f.server.db.update(path, () => null);
    assert.equal((await f.call('/status', undefined, f.a.token)).status, 401);
    assert.equal(await f.server.db.read(path), null);
});
test('revoked or expired database access immediately blocks worker operations', async () => {
    for (const access of [null, { userId: 'p1', expiresAt: Date.now() - 1 }, { userId: 'p2', expiresAt: Date.now() + 86400000 }]) {
        const f = await fixture(), id = await hash(f.a.token);
        await f.server.db.update('_dormAccess/devices/device_' + id, () => access);
        assert.equal((await f.call('/status', undefined, f.a.token)).status, 401);
        assert.equal((await f.call('/ledger/create', { id: 'record-revoked', record: draft }, f.a.token)).status, 401);
        assert.ok(await f.storage.get('device:' + id));
        assert.equal((await f.call('/status', undefined, f.b.token)).status, 200);
    }
});
test('Firebase custom credential has the exact device identity and required audience', async () => {
    const keys = await generateKeyPair('RS256', { extractable: true });
    const email = 'test-only@example.iam.gserviceaccount.com';
    const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: email, private_key: await exportPKCS8(keys.privateKey) }) };
    const token = await customToken(env, 'device_abc');
    const verified = await jwtVerify(token, keys.publicKey, { audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', issuer: email, subject: email });
    assert.equal(verified.payload.uid, 'device_abc'); assert.ok(verified.payload.exp - verified.payload.iat <= 3600);
});
test('Firebase fetch does not bind a store instance to the runtime global function', async () => {
    const store = new FirebaseStore({ FIREBASE_DATABASE_URL: 'https://database.example/' }, async function () {
        assert.equal(this, undefined);
        return Response.json({ readable: true }, { headers: { etag: '"v1"' } });
    });
    store.cached = { token: 'test-only', expires: Date.now() + 600000 };
    assert.deepEqual(await store.read('split'), { readable: true });
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async function () {
            assert.equal(this, globalThis);
            return Response.json({ readable: true }, { headers: { etag: '"v1"' } });
        };
        const runtimeStore = new FirebaseStore({ FIREBASE_DATABASE_URL: 'https://database.example/' });
        runtimeStore.cached = { token: 'test-only', expires: Date.now() + 600000 };
        assert.deepEqual(await runtimeStore.read('split'), { readable: true });
    } finally { globalThis.fetch = original; }
});
test('A/B expense and settlement notify only the other user, persisted values and links', async () => {
    for (const role of ['a', 'b']) {
        const f = await fixture(), actor = f[role];
        const response = await f.call('/ledger/create', { id: 'record-0001', record: draft, recipient: actor.userId }, actor.token);
        assert.equal(response.status, 200);
        assert.equal(f.sent.length, 0, 'Undo grace must not send immediately');
        await f.deliver('expense:record-0001');
        assert.equal(f.sent.length, 1); assert.notEqual(f.sent[0].userId, actor.userId);
        assert.match(f.sent[0].payload.body, /150\.75/); assert.match(f.sent[0].payload.targetPath, /record=record-0001/);
        const settle = await f.call('/ledger/settle', { id: 'settle-0001', ids: ['record-0001'], mode: 'all' }, actor.token);
        assert.equal(settle.status, 200); assert.equal(settle.body.record.amount, 50.5);
        await f.deliver('settlement:settle-0001');
        assert.equal(f.sent.length, 2); assert.notEqual(f.sent[1].userId, actor.userId);
        assert.match(f.sent[1].payload.targetPath, /settlement=settle-0001/);
    }
});
test('retry and reload use stable event id; modified retries conflict; undo suppresses', async () => {
    const f = await fixture(), input = { id: 'record-0001', record: draft };
    await f.call('/ledger/create', input, f.a.token);
    await f.call('/ledger/create', input, f.a.token);
    assert.equal((await f.call('/ledger/create', { ...input, record: { ...draft, p1_bought: 3 } }, f.a.token)).status, 409);
    await f.call('/ready', { eventId: 'expense:record-0001' }, f.a.token);
    const event = await f.storage.get('event:expense:record-0001'); assert.ok(event.nextAt >= event.acknowledgedAt + 7000);
    await f.deliver(event.id); await f.deliver(event.id);
    assert.equal(f.sent.length, 1);
    await f.call('/ledger/create', { id: 'record-0002', record: draft }, f.a.token);
    await f.server.db.update('split/records/record-0002', () => null);
    await f.deliver('expense:record-0002'); assert.equal(f.sent.length, 1);
    await f.call('/ledger/settle', { id: 'settle-0001', ids: ['record-0001'], mode: 'selected' }, f.a.token);
    await f.server.db.update('split/settlements/settle-0001', value => ({ ...value, undoneAt: Date.now() }));
    await f.deliver('settlement:settle-0001'); assert.equal(f.sent.length, 1);
});
test('all toggle combinations and account-wide multi-device disable', async () => {
    for (const aOn of [true, false]) for (const bOn of [true, false]) {
        const f = await fixture();
        if (!aOn) await f.call('/disable', {}, f.a.token);
        if (!bOn) await f.call('/disable', {}, f.b.token);
        await f.call('/ledger/create', { id: 'record-0001', record: draft }, f.a.token); await f.deliver('expense:record-0001');
        await f.call('/ledger/create', { id: 'record-0002', record: draft }, f.b.token); await f.deliver('expense:record-0002');
        assert.equal(f.sent.length, Number(aOn) + Number(bOn));
    }
    const f = await fixture(), third = (await f.call('/pair', { userId: 'p2', invitation: f.invitation })).body;
    await f.call('/subscription', { subscription: await subscription('https://web.push.apple.com/third') }, third.token);
    await f.call('/disable', { userId: 'p1' }, f.b.token);
    assert.equal((await f.storage.list({ prefix: 'sub:' })).size, 1);
    assert.equal((await f.call('/status', undefined, f.a.token)).body.enabled, true);
});
test('subscription endpoint cannot be stolen by another device; expired subscriptions removed', async () => {
    const f = await fixture(); const sub = (await f.storage.get('sub:' + await hash(f.a.token))).subscription;
    assert.equal((await f.call('/subscription', { subscription: sub }, f.b.token)).status, 409);
    f.server.send = async () => 'gone';
    await f.call('/ledger/create', { id: 'record-0001', record: draft }, f.a.token); await f.deliver('expense:record-0001');
    assert.equal((await f.call('/status', undefined, f.b.token)).body.subscribedHere, false);
});
test('durable alarm resumes interrupted write, no delivery on failed Firebase write', async () => {
    const f = await fixture(), original = f.server.db.update.bind(f.server.db); let failing = true;
    f.server.db.update = (...args) => failing ? Promise.reject(new Error('offline')) : original(...args);
    assert.equal((await f.call('/ledger/create', { id: 'record-0001', record: draft }, f.a.token)).status, 503);
    assert.equal(f.sent.length, 0); assert.ok(f.storage.alarm);
    failing = false;
    const event = await f.storage.get('event:expense:record-0001'); await f.storage.put('event:' + event.id, { ...event, nextAt: 0 });
    await f.server.alarm(); assert.ok(await f.server.db.read('split/records/record-0001')); assert.equal(f.sent.length, 0);
    await f.deliver(event.id); assert.equal(f.sent.length, 1);
});
test('admin announcement recipient is restricted; repeated announcement is idempotent', async () => {
    const f = await fixture(), input = { id: 'announce-0001', title: '重要公告', body: '測試', recipient: 'p1' };
    assert.equal((await f.call('/admin/announce', input, 'private-test-only')).status, 200);
    await f.deliver('system:announce-0001');
    await f.call('/admin/announce', input, 'private-test-only'); await f.deliver('system:announce-0001');
    assert.equal(f.sent.length, 1); assert.equal(f.sent[0].userId, 'p1');
});
test('budget adjustment matches original browser transaction, cents and rollover unchanged', () => {
    const html = readFileSync(new URL('../../split.html', import.meta.url), 'utf8');
    const start = html.indexOf('    function dateKey(ts'), end = html.indexOf('    async function applyBudgetSync', start);
    const now = Date.parse('2026-11-09T02:00:00+08:00');
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const context = vm.createContext({ ledgerCore: core, Date: Clock, db: { ref: () => ({ transaction: fn => fn(context.raw) }) } });
    vm.runInContext(html.slice(start, end), context);
    for (const month of ['2026-11', '2026-10']) for (const date of ['2026-11-09', '2026-11-08']) for (const delta of [12.35, -0.45]) {
        const raw = { monthKey: month, monthBudget: 3000.25, locked: true, vault: 3.14, spentToday: 42.35, lastSettledDate: month + '-07', splitOps: {} };
        context.raw = clone(raw);
        const expected = vm.runInContext(`applyBudgetAdjustment('p1', ${delta}, '${date}', 'test-op')`, context);
        const actual = adjustBudget(raw, delta, date, 'test-op', now);
        assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
        context.raw = clone(actual);
        const originalRetry = vm.runInContext(`applyBudgetAdjustment('p1', ${delta}, '${date}', 'test-op')`, context);
        assert.deepEqual(JSON.parse(JSON.stringify(adjustBudget(actual, delta, date, 'test-op', now))), JSON.parse(JSON.stringify(originalRetry)), 'retry matches original rollover rounding without applying delta twice');
    }
});
test('re-entering committed expense does not duplicate budget; settlement uses existing core', async () => {
    const db = new Database(), now = Date.now(), day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    db.state.budget = { p1: { monthKey: day.slice(0, 7), monthBudget: 3000, vault: 0, spentToday: 0, lastSettledDate: day } };
    const event = { type: 'expense', recordId: 'record-0001', intent: draft, createdAt: now };
    await commitEvent(db, event, now); await commitEvent(db, event, now);
    assert.equal(db.state.budget.p1.spentToday, 100.25);
    assert.equal(db.state.split.records['record-0001'].budgetSync, undefined);
});
test('actual WebCrypto encryption is aes128gcm and VAPID signature verifies', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const publicKey = b64(await crypto.subtle.exportKey('raw', pair.publicKey));
    const client = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const clientPublic = new Uint8Array(await crypto.subtle.exportKey('raw', client.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
    const sub = { endpoint: 'https://web.push.apple.com/test', keys: { p256dh: b64(clientPublic), auth: b64(auth) } };
    const result = await buildPushPayload({ data: { title: '宿舍帳本' } }, sub, { publicKey, privateKey: jwk.d, subject: 'https://example.com/' });
    assert.equal(result.headers['content-encoding'], 'aes128gcm'); assert.ok(result.body.byteLength > 100);
    const token = result.headers.authorization.match(/t=([^,]+)/)[1];
    delete jwk.d; jwk.key_ops = ['verify'];
    const verified = await jwtVerify(token, await importJWK(jwk, 'ES256'), { audience: 'https://web.push.apple.com' });
    assert.equal(verified.payload.sub, 'https://example.com/');
    // Independently decrypt the RFC 8291 record as a browser would, including its padding delimiter.
    const bytes = new Uint8Array(result.body), salt = bytes.slice(0, 16), serverPublic = bytes.slice(21, 86), encode = value => new TextEncoder().encode(value);
    const peer = await crypto.subtle.importKey('raw', serverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, client.privateKey, 256);
    const hkdf = async (raw, salt, info, length) => {
        const key = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits']);
        return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
    };
    const ikm = await hkdf(shared, auth, new Uint8Array([...encode('WebPush: info\0'), ...clientPublic, ...serverPublic]), 32);
    const cek = await hkdf(ikm, salt, encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(ikm, salt, encode('Content-Encoding: nonce\0'), 12);
    const contentKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, contentKey, bytes.slice(86)));
    let end = plaintext.length - 1; while (plaintext[end] === 0) end--;
    assert.equal(plaintext[end], 2);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(plaintext.slice(0, end))), { title: '宿舍帳本' });
});
test('Firebase conditional writes retry conflicts and preserve concurrent data', async () => {
    let current = { one: 1 }, version = 1, putCount = 0;
    const db = new FirebaseStore({ FIREBASE_DATABASE_URL: 'https://test.firebaseio.com' }, async (_url, init) => {
        if (init.method === 'GET') return Response.json(current, { headers: { etag: String(version) } });
        putCount++;
        if (putCount === 1) { current.concurrent = true; version++; return new Response(null, { status: 412 }); }
        assert.equal(init.headers['if-match'], String(version));
        current = JSON.parse(init.body); version++; return Response.json(current);
    });
    db.accessToken = async () => 'test-only';
    const result = await db.update('split', prior => ({ ...prior, added: 2 }));
    assert.deepEqual(result, { one: 1, concurrent: true, added: 2 }); assert.equal(putCount, 2);
    db.fetcher = async () => Response.json(current);
    await assert.rejects(db.update('split', prior => ({ ...prior, unsafe: true })), /版本資訊/);
});
test('partial push failures retry only pending subscriptions with a finite limit', async () => {
    const f = await fixture(), third = (await f.call('/pair', { userId: 'p2', invitation: f.invitation })).body;
    await f.call('/subscription', { subscription: await subscription('https://web.push.apple.com/third') }, third.token);
    const attempts = [];
    f.server.send = async sub => { attempts.push(sub.endpoint); return sub.endpoint.endsWith('/third') ? 'retry' : 'sent'; };
    await f.call('/ledger/create', { id: 'record-0001', record: draft }, f.a.token);
    for (let i = 0; i < 8; i++) await f.deliver('expense:record-0001');
    assert.equal(attempts.filter(value => value.endsWith('/b')).length, 1);
    assert.equal(attempts.filter(value => value.endsWith('/third')).length, 5);
    assert.equal((await f.storage.get('event:expense:record-0001')).status, 'failed');
});
