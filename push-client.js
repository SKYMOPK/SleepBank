(function (root) {
    'use strict';
    const apiUrl = String(root.DormPushConfig?.apiUrl || '').replace(/\/$/, '');
    const protectData = Boolean(root.DormPushConfig?.protectData);
    const key = 'dorm-push-device-v1', pendingKey = 'dorm-push-pending-v1', ackKey = 'dorm-push-acks-v1', cacheKey = 'dorm-push-status-cache-v1';
    const names = { p1: '至凱', p2: '柏致' };
    const read = (name, fallback) => { try { return JSON.parse(localStorage.getItem(name)) || fallback; } catch (_) { return fallback; } };
    const save = (name, value) => { localStorage.setItem(name, JSON.stringify(value)); };
    let device = read(key, null), config = null, status = null, registration = null, busy = false, selected = 'p1', invitation = '', error = '';
    let dialog, checkbox, statusText, workerPromise, refreshVersion = 0;
    let uiReadyResolve;
    const uiReady = new Promise(resolve => { uiReadyResolve = resolve; });
    let operationLock = Promise.resolve();
    function withOperationLock(task) {
        if (navigator.locks) return navigator.locks.request('dorm-ledger-write', task);
        const next = operationLock.then(task, task); operationLock = next.catch(() => {}); return next;
    }
    const base = new URL('.', document.currentScript.src);
    const appleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    function supportReason() {
        if (!['https:', 'http:'].includes(location.protocol) || !isSecureContext) return '請從 HTTPS 網站開啟宿舍系統';
        if (appleMobile() && !standalone()) return '請點 Safari「分享」→「加入主畫面」，再從主畫面開啟';
        if (!('serviceWorker' in navigator) || !('PushManager' in root) || !('Notification' in root)) return '此瀏覽器不支援推播通知';
        return '';
    }
    async function request(path, body, authenticated = true) {
        if (!apiUrl) throw new Error('推播服務尚未設定');
        const response = await fetch(apiUrl + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated && device?.token ? { Authorization: `Bearer ${device.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), cache: 'no-store' });
        const value = await response.json();
        if (!response.ok) { const failure = new Error(value.error || '推播服務無法連線'); failure.status = response.status; throw failure; }
        return value;
    }
    function registerWorker() {
        if (!workerPromise) workerPromise = navigator.serviceWorker.register(new URL('sw.js', base), { scope: base.pathname }).then(async value => {
            registration = value;
            let timer;
            try { await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('通知元件尚未就緒，請重試')), 10000); })]); }
            finally { clearTimeout(timer); }
            return value;
        }).catch(failure => { workerPromise = null; throw failure; });
        return workerPromise;
    }
    const decodeKey = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    function render() {
        if (!dialog) return;
        dialog.setAttribute('aria-busy', String(busy));
        const paired = Boolean(device?.token);
        dialog.querySelector('.dp-identity').hidden = paired;
        dialog.querySelector('.dp-device').hidden = !paired;
        dialog.querySelector('.dp-device-name').textContent = names[device?.userId] || '';
        dialog.querySelectorAll('[data-dp-user]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.dpUser === selected)); button.disabled = busy; });
        dialog.querySelector('.dp-pair').disabled = busy || !config?.ready || (!supportReason() && !registration);
        dialog.querySelector('.dp-code').disabled = busy;
        dialog.querySelector('.dp-forget').disabled = busy;
        checkbox.checked = Boolean(status?.enabled);
        checkbox.disabled = busy || !paired || !config?.ready || (!status?.enabled && Boolean(supportReason()));
        let message = !apiUrl ? '推播服務尚未設定' : !config ? '正在確認推播服務' : !config.ready ? '推播服務尚未完成設定' : supportReason() || !paired && '先設定這部裝置的使用者' || '';
        if (!message && status?.enabled) {
            message = Notification.permission === 'denied' ? '帳號通知已開啟；此裝置已拒絕權限，請至系統通知設定調整' : !status.subscribedHere ? '帳號通知已開啟；此裝置尚未連接' : '通知已開啟';
        } else if (!message) message = '通知已關閉';
        statusText.textContent = busy ? '正在更新設定' : error || message;
        statusText.dataset.error = String(Boolean(error));
        const reconnect = dialog.querySelector('.dp-reconnect');
        reconnect.hidden = !paired || !status?.enabled || status?.subscribedHere || Boolean(supportReason());
        reconnect.disabled = busy || root.Notification?.permission === 'denied';
    }
    function clearStatusCache() { try { sessionStorage.removeItem(cacheKey); } catch (_) { /* Storage is optional. */ } }
    async function refresh(force = false) {
        if (!apiUrl || busy) { render(); return; }
        const version = ++refreshVersion;
        try {
            let cached = null;
            try { cached = JSON.parse(sessionStorage.getItem(cacheKey)); } catch (_) { /* Storage is optional. */ }
            if (force || !cached || cached.token !== (device?.token || '') || !Number.isFinite(cached.time) || Date.now() - cached.time < 0 || Date.now() - cached.time >= 60000) cached = null;
            const nextConfig = cached?.config || await request('/config', undefined, false);
            let nextStatus = status;
            if (device?.token) {
                nextStatus = cached?.status || await request('/status');
                if (!supportReason() && Notification.permission === 'granted') {
                    const worker = await registerWorker(), subscription = await worker.pushManager.getSubscription();
                    const oldKey = subscription?.options?.applicationServerKey;
                    const old = oldKey ? new Uint8Array(oldKey) : null, next = decodeKey(nextConfig.publicKey);
                    if (!subscription || (subscription.expirationTime && subscription.expirationTime <= Date.now()) || (old && (old.length !== next.length || old.some((value, i) => value !== next[i])))) nextStatus.subscribedHere = false;
                } else if (nextStatus.enabled) nextStatus.subscribedHere = false;
            }
            if (busy || version !== refreshVersion) return;
            config = nextConfig; status = nextStatus;
            if (!cached) { try { sessionStorage.setItem(cacheKey, JSON.stringify({ token: device?.token || '', time: Date.now(), config, status })); } catch (_) { /* Storage is optional. */ } }
            error = '';
        } catch (failure) {
            if (busy || version !== refreshVersion) return;
            error = failure.message; if (failure.status === 401) { clearStatusCache(); device = null; status = null; localStorage.removeItem(key); }
        }
        render();
    }
    async function enable() {
        if (busy) return;
        const unsupported = supportReason();
        if (unsupported) { error = unsupported; render(); return; }
        // Called directly from the click/change handler, before the first await (Safari requirement).
        refreshVersion++; busy = true; error = ''; render();
        try {
            const permission = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
            if (await permission !== 'granted') throw new Error('尚未授予通知權限；可至系統通知設定調整');
            const worker = await registerWorker();
            let subscription = await worker.pushManager.getSubscription();
            if (subscription?.expirationTime && subscription.expirationTime <= Date.now()) { await subscription.unsubscribe(); subscription = null; }
            if (subscription?.options?.applicationServerKey) {
                const old = new Uint8Array(subscription.options.applicationServerKey), next = decodeKey(config.publicKey);
                if (old.length !== next.length || old.some((value, i) => value !== next[i])) { await subscription.unsubscribe(); subscription = null; }
            }
            subscription ||= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(config.publicKey) });
            status = { ...status, ...await request('/subscription', { subscription: subscription.toJSON() }) };
            clearStatusCache();
        } catch (failure) { error = failure.message || '通知設定失敗，請重試'; }
        finally { busy = false; render(); }
    }
    async function disable() {
        if (busy) return;
        refreshVersion++; busy = true; error = ''; render();
        try {
            status = { ...status, ...await request('/disable', {}) };
            clearStatusCache();
            if (registration) { const subscription = await registration.pushManager.getSubscription(); await subscription?.unsubscribe(); }
        } catch (failure) { error = failure.message; }
        finally { busy = false; render(); }
    }
    function open() { if (!dialog.open) dialog.showModal(); render(); refresh(true); }
    async function pair() {
        if (busy) return;
        refreshVersion++; busy = true; error = ''; render();
        let subscription = null, paired = false;
        try {
            save(key + '-probe', true); localStorage.removeItem(key + '-probe');
            const pending = read(pendingKey, null);
            if (pending && pending.userId !== selected) throw new Error(`有${names[pending.userId] || '原使用者'}的帳目待確認，請先以相同身分啟用`);
            const raw = dialog.querySelector('.dp-code').value.trim();
            let code = raw;
            try { code = new URL(raw).hash.match(/activate=([A-Za-z0-9_-]+)/)?.[1] || raw; } catch (_) { /* A plain activation code also works. */ }
            if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error('請輸入有效的私人啟用碼或連結');
            if (!supportReason() && registration && config?.publicKey) {
                try {
                    subscription = registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(config.publicKey) })
                        .then(() => true, () => false);
                } catch (_) { subscription = Promise.resolve(false); }
            }
            device = await request('/pair', { invitation: code, userId: selected }, false);
            clearStatusCache();
            save(key, device); invitation = ''; dialog.querySelector('.dp-code').value = '';
            paired = true;
            root.dispatchEvent(new Event('dorm:device-paired'));
        } catch (failure) { error = failure.message; }
        finally { busy = false; if (!error) await refresh(true); else render(); }
        if (paired && subscription && !error && status && (status.enabled || status.notificationConfigured === false)) {
            if (await subscription) await enable();
            else { error = '裝置已啟用，通知尚未獲得允許；可在通知設定中調整'; render(); }
        }
    }
    async function requireDevice() {
        if (!device?.token) { open(); throw new Error('請先設定這部裝置的使用者'); }
    }
    async function protect() {
        if (!protectData) return;
        await uiReady;
        const gate = document.createElement('div');
        gate.className = 'dorm-access-gate'; gate.setAttribute('role', 'status');
        gate.innerHTML = '<div><h2>啟用這部裝置</h2><p>請使用私人啟用碼連接宿舍系統。</p><button type="button">啟用或重試</button><a href="index.html">返回首頁</a></div>';
        document.body.append(gate);
        const message = gate.querySelector('p'), action = gate.querySelector('button');
        while (true) {
            if (!device?.token) {
                message.textContent = '請使用私人啟用碼連接宿舍系統。';
                dialog.classList.add('dp-activation');
                dialog.querySelector('#dp-title').textContent = '啟用宿舍系統';
                open();
                await new Promise(resolve => {
                    const paired = () => { root.removeEventListener('dorm:device-paired', paired); resolve(); };
                    root.addEventListener('dorm:device-paired', paired);
                    action.onclick = () => open();
                });
            }
            try {
                if (dialog.open) dialog.close();
                dialog.classList.remove('dp-activation');
                dialog.querySelector('#dp-title').textContent = '通知設定';
                message.textContent = '正在確認這部裝置'; action.disabled = true;
                if (!root.firebase?.auth) throw new Error('身分驗證元件載入失敗，請檢查網路');
                const auth = root.firebase.auth();
                await auth.setPersistence(root.firebase.auth.Auth.Persistence.LOCAL);
                let existing = null;
                if (typeof auth.onAuthStateChanged === 'function' && root.crypto?.subtle) {
                    existing = await new Promise((resolve, reject) => {
                        let unsubscribe;
                        unsubscribe = auth.onAuthStateChanged(user => { if (unsubscribe) unsubscribe(); resolve(user); }, reject);
                    });
                    const hash = new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(device.token)));
                    const expected = 'device_' + btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                    if (existing?.uid !== expected) existing = null;
                }
                if (!existing) {
                    const result = await request('/firebase-token');
                    await auth.signInWithCustomToken(result.token);
                }
                gate.remove(); if (dialog.open) dialog.close(); return;
            } catch (failure) {
                if (failure.status === 401) { device = null; status = null; localStorage.removeItem(key); }
                message.textContent = failure.status === 401 ? '裝置授權已失效，請重新啟用。' : (failure.message || '無法連接，請稍後重試。');
                action.disabled = false; action.textContent = device ? '重新連線' : '重新啟用';
                await new Promise(resolve => { action.onclick = resolve; });
            }
        }
    }
    async function commitUnlocked(kind, id, payload, basis) {
        await requireDevice();
        let pending = read(pendingKey, null);
        if (pending && (pending.userId !== device.userId || pending.kind !== kind || pending.basis !== basis)) throw new Error('有一筆操作仍待確認，請先以原內容重試或重新開啟頁面');
        if (!pending) { pending = { kind, id, payload, basis, userId: device.userId }; save(pendingKey, pending); }
        try {
            const result = await request(kind === 'expense' ? '/ledger/create' : '/ledger/settle', { id: pending.id, ...pending.payload });
            localStorage.removeItem(pendingKey); return result;
        } catch (failure) {
            if (failure.status >= 400 && failure.status < 500) localStorage.removeItem(pendingKey);
            throw failure;
        }
    }
    const commit = (...args) => withOperationLock(() => commitUnlocked(...args));
    async function readyEvent(eventId) {
        const list = read(ackKey, []); if (!list.includes(eventId)) { list.push(eventId); save(ackKey, list.slice(-20)); }
        try { await request('/ready', { eventId }); save(ackKey, read(ackKey, []).filter(id => id !== eventId)); } catch (_) { /* Server has its own durable fallback alarm. */ }
    }
    async function resumePending() {
        if (!apiUrl || !device?.token || busy) return;
        await withOperationLock(async () => {
            const pending = read(pendingKey, null);
            if (pending && pending.userId === device.userId) {
                try {
                    const result = await commitUnlocked(pending.kind, pending.id, pending.payload, pending.basis);
                    root.dispatchEvent(new CustomEvent('dorm:operation-recovered', { detail: result }));
                } catch (_) { /* Keep the same id for a later retry. */ }
            }
        });
        for (const id of read(ackKey, [])) await readyEvent(id);
    }
    function init() {
        const match = location.hash.match(/^#activate=([A-Za-z0-9_-]{43})$/);
        if (match) { invitation = match[1]; history.replaceState(null, '', location.pathname + location.search); }
        dialog = document.createElement('dialog'); dialog.className = 'dorm-push-dialog';
        dialog.setAttribute('aria-labelledby', 'dp-title');
        dialog.innerHTML = `<div class="dp-heading"><h2 id="dp-title">通知設定</h2><button type="button" class="dp-close" aria-label="關閉通知設定"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="dp-identity"><span class="dp-label">這是誰的裝置？</span><div class="dp-users" role="group" aria-label="裝置使用者"><button type="button" data-dp-user="p1" aria-pressed="true">至凱</button><button type="button" data-dp-user="p2" aria-pressed="false">柏致</button></div><input class="dp-code" type="password" autocomplete="off" placeholder="私人啟用碼或連結" aria-label="私人啟用碼或連結"><p>首次啟用後會記住，不需要每次登入。</p><button type="button" class="dp-pair">啟用這部裝置</button></div><div class="dp-device" hidden><span>此裝置：<strong class="dp-device-name"></strong></span><button type="button" class="dp-forget">解除此裝置</button></div><div class="dp-setting"><label for="dp-toggle">推播通知</label><div class="dp-switch"><input type="checkbox" role="switch" id="dp-toggle" aria-describedby="dp-help dp-status"><span aria-hidden="true"></span></div></div><p class="dp-help" id="dp-help">接收新支出、結清紀錄與重要系統通知。</p><p class="dp-status" id="dp-status" role="status" aria-live="polite"></p><button type="button" class="dp-pair dp-reconnect" hidden>重新連接此裝置</button>`;
        const scopeNote = document.createElement('p'); scopeNote.className = 'dp-help';
        scopeNote.textContent = '此開關適用於這位使用者的所有裝置。';
        dialog.querySelector('#dp-help').after(scopeNote);
        document.body.append(dialog); checkbox = dialog.querySelector('#dp-toggle'); statusText = dialog.querySelector('.dp-status');
        const launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'dorm-push-entry';
        launcher.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span>通知設定</span>';
        const footer = document.querySelector('.home-footer');
        if (footer) footer.append(launcher);
        else { const container = document.createElement('footer'); container.className = 'dorm-push-launcher'; container.append(launcher); document.body.append(container); }
        launcher.addEventListener('click', open);
        dialog.querySelector('.dp-close').addEventListener('click', () => { if (!busy) dialog.close(); });
        dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
        dialog.querySelectorAll('[data-dp-user]').forEach(button => button.addEventListener('click', () => { selected = button.dataset.dpUser; render(); }));
        dialog.querySelector('.dp-pair').addEventListener('click', pair);
        dialog.querySelector('.dp-reconnect').addEventListener('click', enable);
        checkbox.addEventListener('change', () => { if (checkbox.checked) enable(); else disable(); });
        dialog.querySelector('.dp-forget').addEventListener('click', async () => {
            if (busy) return;
            if (read(pendingKey, null)) { error = '有一筆帳目正在確認，請先完成重試再解除裝置'; render(); resumePending(); return; }
            busy = true; render();
            try {
                await request('/forget', {}); clearStatusCache(); device = null; status = null; localStorage.removeItem(key);
                if (protectData && root.firebase?.auth && root.firebase.apps?.[0]?.options?.projectId === 'accounting-system-53ed3') await root.firebase.auth().signOut();
                if (protectData) location.reload();
            }
            catch (failure) { error = failure.message; }
            finally { busy = false; render(); }
        });
        root.addEventListener('online', () => { refresh(true); resumePending(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(); resumePending(); } });
        root.addEventListener('storage', event => { if (event.key === key) { clearStatusCache(); device = read(key, null); refresh(true); } });
        navigator.serviceWorker?.addEventListener('message', event => { if (event.data?.type === 'dorm:subscription-changed') refresh(true); });
        if (!supportReason()) registerWorker().then(render).catch(() => { error = '通知元件載入失敗，請檢查網路後重試'; render(); });
        refresh(); resumePending();
        if (invitation) { dialog.querySelector('.dp-code').value = invitation; open(); }
        uiReadyResolve();
    }
    root.DormPush = {
        configured: Boolean(apiUrl), open, readyEvent, protect,
        createRecord(id, record) {
            const draft = { p1_bought: record.p1_bought, p2_bought: record.p2_bought, payer: record.payer, note: record.note };
            return commit('expense', id, { record: draft }, JSON.stringify(draft));
        },
        createSettlement(id, ids, mode) {
            const sorted = [...ids].sort(); return commit('settlement', id, { ids: sorted, mode }, JSON.stringify({ ids: sorted, mode }));
        },
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(window);
