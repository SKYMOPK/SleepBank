import { randomBytes, webcrypto } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const [action, ...args] = process.argv.slice(2);
if (action === 'keys') {
    if (!args[0]) throw new Error('Specify a NEW private output file outside the repository: node admin.mjs keys <path>');
    const output = resolve(args[0]), appRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
    if (output === appRoot || output.startsWith(appRoot + sep)) throw new Error('Secret keys must be written outside the website/repository.');
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
    const privateKey = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d;
    await writeFile(output, JSON.stringify({ ADMIN_SECRET: randomBytes(32).toString('base64url'), VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log('Private key file created. Keep it outside Git. Do not regenerate keys for an existing deployment.');
    process.exit(0);
}
const api = process.env.DORM_PUSH_API?.replace(/\/$/, ''), secret = process.env.DORM_ADMIN_SECRET;
if (!api?.startsWith('https://') || !secret) throw new Error('Set DORM_PUSH_API (HTTPS) and DORM_ADMIN_SECRET locally; never paste secrets into chat.');
let path, payload;
if (action === 'invite') { path = 'invitations'; payload = { uses: Number(args[0] || 2) }; }
else if (action === 'status') { path = 'status'; payload = {}; }
else if (action === 'revoke') { path = 'revoke-device'; payload = { deviceId: args[0] }; }
else if (action === 'announce') {
    const [id, recipient, title, body] = args;
    if (!id || !recipient || !title || !body) throw new Error('announce <stable-id> <both|p1|p2> <title> <body>; repeats must keep the same id');
    path = 'announce'; payload = { id, recipient, title, body };
} else throw new Error('Use keys, invite, status, revoke or announce.');
const response = await fetch(`${api}/admin/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
const result = await response.json();
if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
console.log(JSON.stringify(result, null, 2));
