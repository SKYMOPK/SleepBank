import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api = process.env.DORM_PUSH_API;
const admin = process.env.DORM_ADMIN_SECRET;
assert.ok(api?.startsWith('https://') && admin, 'Set the private deployment environment first.');
const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const devices = [];
async function call(path, body, token) {
    const response = await fetch(api + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    return { status: response.status, data: await response.json() };
}
async function google(action, body) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${config.vars.FIREBASE_WEB_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    assert.equal(response.status, 200, `Firebase ${action}: ${data.error?.message || response.status}`);
    return data;
}
async function read(path, token) {
    const url = new URL(path + '.json', config.vars.FIREBASE_DATABASE_URL);
    if (token) url.searchParams.set('auth', token);
    url.searchParams.set('shallow', 'true');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    await response.arrayBuffer();
    return response.status;
}
try {
    assert.equal((await call('/config')).data.ready, true);
    assert.equal((await call('/status')).status, 401);
    const blocked = await fetch(api + '/config', { headers: { Origin: 'https://unauthorized.invalid' } });
    assert.equal(blocked.status, 403);
    const invite = await call('/admin/invitations', { uses: 2 }, admin);
    assert.equal(invite.status, 200);
    const invitation = new URLSearchParams(new URL(invite.data.activationUrl).hash.slice(1)).get('activate');
    for (const userId of ['p1', 'p2']) {
        const pair = await call('/pair', { userId, invitation });
        assert.equal(pair.status, 200, pair.data.error || 'Device activation failed.');
        const device = { token: pair.data.token, idToken: null }; devices.push(device);
        const status = await call('/status', undefined, device.token);
        assert.equal(status.data.userId, userId);
        const credential = await call('/firebase-token', undefined, device.token);
        assert.equal(credential.status, 200);
        const signedIn = await google('signInWithCustomToken', { token: credential.data.token, returnSecureToken: true });
        device.idToken = signedIn.idToken;
        const claims = JSON.parse(Buffer.from(device.idToken.split('.')[1], 'base64url'));
        assert.match(claims.sub, /^device_[A-Za-z0-9_-]{43}$/);
        for (const path of ['/split', '/budget', '/foodPicker', '/splitPass']) assert.equal(await read(path, device.idToken), 200);
    }
    if (process.env.EXPECT_PROTECTED === '1') assert.equal(await read('/split'), 401);
    for (const device of devices) {
        assert.equal((await call('/forget', {}, device.token)).status, 200);
        assert.equal((await call('/status', undefined, device.token)).status, 401);
        if (process.env.EXPECT_PROTECTED === '1') assert.equal(await read('/split', device.idToken), 401);
    }
    console.log('Production smoke passed: both device identities, Firebase sign-in, four data paths, origin restrictions and revocation. No financial records written.');
} finally {
    const cleanup = await Promise.allSettled(devices.map(async device => {
        const forgotten = await call('/forget', {}, device.token);
        assert.ok([200, 401].includes(forgotten.status), 'Temporary device cleanup failed.');
        if (device.idToken) await google('delete', { idToken: device.idToken });
    }));
    assert.ok(cleanup.every(result => result.status === 'fulfilled'), 'Temporary device cleanup requires attention.');
}
