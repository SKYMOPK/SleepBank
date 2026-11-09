import { SignJWT, importPKCS8 } from 'jose';
import { HttpError, fail } from './protocol.js';
const AUTH_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
export async function customToken(env, uid) {
    let account;
    try { account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '{}'); } catch { fail(503, '後端身分憑證格式無效'); }
    if (!account.client_email || !account.private_key) fail(503, '後端身分憑證尚未設定');
    const key = await importPKCS8(account.private_key, 'RS256');
    return new SignJWT({ uid }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(account.client_email)
        .setSubject(account.client_email).setAudience(AUTH_AUDIENCE).setIssuedAt().setExpirationTime('1h').sign(key);
}
export class FirebaseStore {
    constructor(env, fetcher) { this.env = env; this.fetcher = fetcher ? (...args) => fetcher(...args) : (...args) => globalThis.fetch(...args); this.cached = null; }
    async accessToken() {
        if (this.cached?.expires > Date.now() + 60000) return this.cached.token;
        if (!this.env.FIREBASE_WEB_API_KEY) fail(503, '後端資料庫尚未設定');
        const assertion = await customToken(this.env, 'dorm-push-service');
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(this.env.FIREBASE_WEB_API_KEY)}`;
        const response = await this.fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: assertion, returnSecureToken: true }), signal: AbortSignal.timeout(8000) });
        if (!response.ok) fail(503, '資料庫身分驗證尚未設定或無法連線');
        const data = await response.json();
        if (!data.idToken) fail(503, '資料庫身分驗證未成功');
        this.cached = { token: data.idToken, expires: Date.now() + Number(data.expiresIn || 3600) * 1000 };
        return this.cached.token;
    }
    async request(path, method = 'GET', value, etag) {
        const token = await this.accessToken();
        const url = new URL(`${path}.json`, this.env.FIREBASE_DATABASE_URL.replace(/\/$/, '') + '/');
        url.searchParams.set('auth', token);
        const response = await this.fetcher(url, { method, headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? { 'X-Firebase-ETag': 'true' } : {}), ...(etag ? { 'if-match': etag } : {}) }, body: value === undefined ? undefined : JSON.stringify(value), signal: AbortSignal.timeout(8000) });
        if (response.status === 412) return { conflict: true };
        if (!response.ok) throw new HttpError(503, '資料庫暫時無法連線，請重試');
        return { value: await response.json(), etag: response.headers.get('etag') };
    }
    async read(path) { return (await this.request(path)).value; }
    async update(path, transform) {
        for (let i = 0; i < 5; i++) {
            const before = await this.request(path);
            if (!before.etag) fail(503, '資料庫未提供版本資訊，已停止寫入');
            const next = transform(before.value);
            if (next === undefined) return before.value;
            const saved = await this.request(path, 'PUT', next, before.etag);
            if (!saved.conflict) return saved.value;
        }
        fail(503, '資料正由另一部裝置更新，請重試');
    }
}
