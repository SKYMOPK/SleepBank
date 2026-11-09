import assert from 'node:assert/strict';
import { FirebaseStore } from '../src/firebase.js';
import { DormPush } from '../src/worker.js';
import { generateKeyPair, exportPKCS8 } from 'jose';
const project = 'demo-dorm-security';
const database = process.env.FIREBASE_DATABASE_EMULATOR_HOST, auth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!database?.startsWith('127.0.0.1:') || !auth?.startsWith('127.0.0.1:')) throw new Error('This test only runs against local Firebase emulators.');
const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
async function signIn(uid, custom) {
    const now = Math.floor(Date.now() / 1000);
    const token = custom || `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ iss: 'emulator-test@example.com', sub: 'emulator-test@example.com', aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 3600, uid })}.`;
    const response = await fetch(`http://${auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-test-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }) });
    const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data.idToken;
}
async function call(path, token, method = 'GET', value) {
    const url = new URL(`http://${database}/${path}.json`);
    url.searchParams.set('ns', project + '-default-rtdb');
    if (token) url.searchParams.set('auth', token);
    return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
}
const service = await signIn('dorm-push-service'), device = await signIn('device_good'), expired = await signIn('device_expired'), outsider = await signIn('device_outsider');
assert.ok((await call('_dormAccess/devices/device_good', service, 'PUT', { userId: 'p1', expiresAt: Date.now() + 60000 })).ok);
assert.ok((await call('_dormAccess/devices/device_expired', service, 'PUT', { userId: 'p2', expiresAt: Date.now() - 60000 })).ok);
for (const path of ['split', 'budget', 'foodPicker', 'splitPass']) {
    assert.equal((await call(path, null)).ok, false, `${path}: public reads denied`);
    assert.equal((await call(path, null, 'PUT', { nope: true })).ok, false, `${path}: public writes denied`);
    assert.equal((await call(path, outsider)).ok, false, `${path}: unknown identity denied`);
    assert.equal((await call(path, expired)).ok, false, `${path}: expired identity denied`);
    assert.equal((await call(path, device, 'PUT', { saved: true })).ok, true, `${path}: paired device writes`);
    assert.deepEqual(await (await call(path, device)).json(), { saved: true }, `${path}: paired device reads`);
    assert.equal((await call(path, service)).ok, true, `${path}: service reads through rules`);
}
assert.equal((await call('_dormAccess/devices/device_good', device)).ok, false, 'devices cannot read the registry');
assert.equal((await call('_dormAccess/devices/device_good', device, 'PUT', { expiresAt: Date.now() + 999999 })).ok, false, 'devices cannot extend their own access');
assert.equal((await call('_dormAccess/devices/device_outsider', outsider, 'PUT', { expiresAt: Date.now() + 999999 })).ok, false, 'unknown devices cannot grant themselves access');
const store = new FirebaseStore({ FIREBASE_DATABASE_URL: `http://${database}/` }, (url, options) => {
    url.searchParams.set('ns', project + '-default-rtdb'); return fetch(url, options);
});
store.accessToken = async () => device;
await assert.rejects(store.update('_dormAccess/devices/device_outsider', () => ({ expiresAt: Date.now() + 99999 })), 'the real backend REST adapter must obey the registry rules');
store.accessToken = async () => service;
await store.update('_dormAccess/devices/device_outsider', () => ({ expiresAt: Date.now() + 99999 }));
assert.equal((await call('split', outsider)).ok, true, 'the service can explicitly enable a device');
assert.equal((await call('_dormAccess/devices/device_good', service, 'DELETE')).ok, true, 'service can revoke access');
assert.equal((await call('split', device)).ok, false, 'revocation denies a previously issued token immediately');
class Storage {
    data = new Map(); alarm = null; queue = Promise.resolve();
    async get(key) { return structuredClone(this.data.get(key)); }
    async put(key, value) { this.data.set(key, structuredClone(value)); }
    async delete(key) { this.data.delete(key); }
    async list({ prefix }) { return new Map([...this.data].filter(([key]) => key.startsWith(prefix))); }
    async getAlarm() { return this.alarm; }
    async setAlarm(value) { this.alarm = value; }
    async deleteAlarm() { this.alarm = null; }
    transaction(fn) { const task = this.queue.then(() => fn(this)); this.queue = task.catch(() => {}); return task; }
}
const signing = await generateKeyPair('RS256', { extractable: true });
const env = { APP_URL: 'https://example.test/', ADMIN_SECRET: 'local-emulator-only', FIREBASE_DATABASE_URL: `http://${database}/`, FIREBASE_WEB_API_KEY: 'fake-test-key', FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'test@example.iam.gserviceaccount.com', private_key: await exportPKCS8(signing.privateKey) }) };
const worker = new DormPush({ storage: new Storage() }, env);
worker.db = new FirebaseStore(env, (url, options) => {
    const requestUrl = new URL(url);
    if (requestUrl.hostname === 'identitytoolkit.googleapis.com') return fetch(`http://${auth}/identitytoolkit.googleapis.com${requestUrl.pathname}${requestUrl.search}`, options);
    requestUrl.searchParams.set('ns', project + '-default-rtdb'); return fetch(requestUrl, options);
});
async function workerCall(path, payload, bearer) {
    const response = await worker.fetch(new Request('https://worker.test' + path, { method: payload === undefined ? 'GET' : 'POST', headers: bearer ? { Authorization: 'Bearer ' + bearer } : {}, body: payload === undefined ? undefined : JSON.stringify(payload) }));
    const value = await response.json(); if (!response.ok) throw new Error(`${path}: ${response.status} ${value.error}`); return value;
}
const invite = await workerCall('/admin/invitations', { uses: 1 }, 'local-emulator-only');
const activation = new URL(invite.activationUrl).hash.slice('#activate='.length);
const paired = await workerCall('/pair', { userId: 'p1', invitation: activation });
const signed = await workerCall('/firebase-token', undefined, paired.token);
const pairedIdToken = await signIn(null, signed.token);
assert.equal((await call('split', pairedIdToken)).ok, true, 'real worker pairing grants the device access');
const record = await workerCall('/ledger/create', { id: 'record-emulator-01', record: { p1_bought: 12.5, p2_bought: 30, payer: 'p1', note: 'test' } }, paired.token);
assert.equal(record.record.p1_bought, 12.5, 'real worker commits through Firebase rules');
await workerCall('/forget', {}, paired.token);
assert.equal((await call('split', pairedIdToken)).ok, false, 'real worker revocation immediately blocks existing tokens');
console.log('Firebase emulators: paired device, unknown user, expiry, immediate revocation, service access and registry protection passed.');
