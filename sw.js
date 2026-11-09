/* Notification-only worker: accounting requests and page assets remain network-managed. */
'use strict';
const safeTarget = value => {
    const base = new URL(self.registration.scope);
    try {
        const target = new URL(value, base);
        if (target.origin === base.origin && [new URL('index.html', base).pathname, new URL('split.html', base).pathname].includes(target.pathname)) return target.href;
    } catch (_) { /* Use the application home. */ }
    return new URL('index.html', base).href;
};
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
    event.waitUntil((async () => {
        let data = {};
        try { data = event.data?.json() || {}; } catch (_) { /* Every push must show a visible notification on Safari. */ }
        const id = typeof data.eventId === 'string' && /^[A-Za-z0-9:_-]{1,130}$/.test(data.eventId) ? data.eventId : 'system';
        await self.registration.showNotification(typeof data.title === 'string' ? data.title.slice(0, 60) : '宿舍系統', {
            body: typeof data.body === 'string' ? data.body.slice(0, 300) : '有新的宿舍系統訊息',
            icon: new URL('assets/icons/dorm-192.png', self.registration.scope).href,
            tag: `dorm:${id}`, renotify: false,
            data: { targetPath: safeTarget(data.targetPath), eventId: id },
        });
    })());
});
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
        const target = safeTarget(event.notification.data?.targetPath);
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = windows.find(client => client.url.startsWith(self.registration.scope));
        if (existing) {
            try { await existing.navigate(target); return await existing.focus(); }
            catch (_) { /* A window can close between matchAll and navigation. */ }
        }
        return self.clients.openWindow(target);
    })());
});
self.addEventListener('pushsubscriptionchange', event => {
    event.waitUntil(self.clients.matchAll({ type: 'window' }).then(windows => Promise.all(windows.map(client => client.postMessage({ type: 'dorm:subscription-changed' })))));
});
