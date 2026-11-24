(function () {
    'use strict';
    const layers = [];
    const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

    function open(host, close, initialFocus) {
        const panel = host.querySelector('[role="dialog"], [role="alertdialog"]');
        if (!panel || layers.some(layer => layer.host === host)) return;
        if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1;
        layers.push({ host, panel, close, previous: document.activeElement });
        document.documentElement.classList.add('sb-modal-open');
        (initialFocus && panel.querySelector(initialFocus) || panel).focus({ preventScroll: true });
    }

    function finish(host) {
        const index = layers.findIndex(layer => layer.host === host);
        if (index < 0) return;
        const wasTop = index === layers.length - 1;
        const [{ previous }] = layers.splice(index, 1);
        document.documentElement.classList.toggle('sb-modal-open', layers.length > 0);
        if (!wasTop) return;
        const fallback = layers.at(-1)?.panel || document.querySelector('.sb-brand');
        (previous?.getClientRects().length ? previous : fallback)?.focus({ preventScroll: true });
    }

    document.addEventListener('keydown', event => {
        const active = layers.at(-1);
        if (!active || event.defaultPrevented || document.querySelector('dialog[open]')) return;
        const { panel, close } = active;
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        } else if (event.key === 'Tab') {
            const controls = [...panel.querySelectorAll(focusable)].filter(el => el.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (!first) {
                event.preventDefault();
            } else if (!controls.includes(document.activeElement) || document.activeElement === (event.shiftKey ? first : last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        }
    });
    function feedback(id, message = '') {
        const region = document.getElementById(id);
        if (!region) return;
        region.textContent = message;
        region.hidden = !message;
    }

    window.DormUI = { open, finish, feedback };

    const mount = document.querySelector('[data-dorm-shell]');
    if (!mount) return;
    const pages = [
        ['index', '首頁', 'M3 10.5 12 3l9 7.5M5 9v11h14V9M10 20v-6h4v6'],
        ['split', '帳本', 'M6 4h13v16H6zM9.5 8h6M9.5 12h6M9.5 16h4M4 8h3m-3 4h3m-3 4h3'],
        ['budget', '預算', 'M20 8H6a2 2 0 0 1 0-4h12a2 2 0 0 1 2 2v2Zm0 0h1v11H6a2 2 0 0 1-2-2V6m17 5h-5a2.5 2.5 0 1 0 0 5h5m-5-2.5h.01'],
        ['grip', '握力', 'M6 7v10M3 9v6m15-8v10m3-8v6M6 12h12'],
        ['food', '餐廳', 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM2 5v4l1 1v9m1-14v4l-1 1m19-5-1 4v3h1m0-7v14'],
    ];
    const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    const links = pages.map(([id, label, path]) =>
        `<a href="${id}.html"${mount.dataset.dormShell === id ? ' aria-current="page"' : ''}>${icon(path)}<span>${label}</span></a>`
    ).join('');
    if (!mount.hasChildNodes()) mount.innerHTML = `<div class="sb-app-rail"><div class="sb-app-bar">
        <a class="sb-brand" href="index.html" aria-label="宿舍系統首頁"><img src="assets/icons/dorm-180.png" alt="" width="30" height="30"><span>宿舍系統</span></a>
        <nav class="sb-app-nav sb-desktop-nav" aria-label="宿舍導覽">${links}</nav>
        <div id="dorm-notification-tools"></div>
    </div></div><nav class="sb-app-nav sb-mobile-nav" aria-label="宿舍導覽">${links}</nav>`;
    document.body.classList.add('sb-app-ready');

    // The address bar and pinch zoom are not a software keyboard.
    const viewport = window.visualViewport;
    const phone = matchMedia('(max-width: 800px)');
    const root = document.documentElement;
    const undo = document.getElementById('undoToast');
    if (undo && window.ResizeObserver) {
        new ResizeObserver(() => root.style.setProperty('--sb-undo-height', `${undo.offsetHeight}px`)).observe(undo);
    }
    function syncKeyboard() {
        const field = document.activeElement;
        const typing = field?.matches('textarea, input:not([readonly]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"])');
        const inset = viewport ? root.clientHeight - viewport.height : 0;
        const visible = phone.matches && typing && viewport?.scale === 1 && inset > 120;
        document.body.classList.toggle('sb-keyboard-open', visible);
        if (visible) root.style.setProperty('--sb-keyboard-inset', `${Math.max(0, inset - viewport.offsetTop)}px`);
        else root.style.removeProperty('--sb-keyboard-inset');
    }
    viewport?.addEventListener('resize', syncKeyboard);
    viewport?.addEventListener('scroll', syncKeyboard);
    phone.addEventListener('change', syncKeyboard);
    document.addEventListener('focusin', syncKeyboard);
    document.addEventListener('focusout', () => requestAnimationFrame(syncKeyboard));
    window.addEventListener('pageshow', syncKeyboard);
})();
