(function (root) {
    const cosmetics = root.SplitCosmetics;
    const catalog = cosmetics.catalog;
    const storageKey = 'split-appearance-v1';
    const icon = name => `<svg class="le-icon" viewBox="0 0 24 24" aria-hidden="true">${{
        palette: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4 2 2 0 0 1 0-4h3a4 4 0 0 0 4-4c0-4-5-6-9-6Z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="6" r="1"/><circle cx="15" cy="7" r="1"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
    }[name]}</svg>`;
    const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
    function writeLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browser storage can be disabled. */ } }
    const preferences = readLocal(storageKey, { user: 'p1', p1: {}, p2: {}, muted: true });
    preferences.shared ||= { ...(preferences[preferences.user] || preferences.p1 || {}) };
    let appearanceChanged = false;
    for (const type of ['color', 'effect']) {
        const id = preferences.shared[type];
        if (id && catalog[id]?.type !== type) {
            delete preferences.shared[type];
            appearanceChanged = true;
        }
    }
    if (appearanceChanged) writeLocal(storageKey, preferences);
    let tab = 'color';
    let panel, reveal, entry, previousFocus, revealId, toastTimer;
    function closeReward() {
        reveal.classList.remove('open');
        panel.querySelector('.le-close').focus();
    }
    const settings = () => preferences.shared;
    const has = id => !!catalog[id];
    function setMuted(muted) {
        preferences.muted = Boolean(muted);
        if (preferences.muted) { root.StormAudio?.clearPrime(); root.ChessAudio?.clearPrime(); }
        writeLocal(storageKey, preferences);
        root.dispatchEvent(new CustomEvent('ledger:mute-changed', { detail: { muted: preferences.muted } }));
    }
    function applyBackground() {
        const id = settings().color;
        const item = catalog[id];
        const permitted = item && has(id);
        const scene = document.querySelector('#ledger-original-background');
        if (scene) scene.className = permitted ? `ledger-original-theme theme-${item.family}` : '';
        document.body.classList.toggle('le-themed', !!permitted);
        document.body.dataset.theme = permitted ? item.family : 'default';
        if (permitted && item.family === 'dorm') root.DormBackground?.mount(scene);
        else root.DormBackground?.cleanup();
        if (permitted && item.family === 'thunder') root.SpecialThemes?.thunder.ambient.mount(scene);
        else root.SpecialThemes?.thunder.ambient.cleanup();
        if (permitted && item.family === 'chess') root.SpecialThemes?.chess.ambient.mount(scene);
        else root.SpecialThemes?.chess.ambient.cleanup();
        if (permitted) {
            document.body.style.setProperty('--ledger-bg', item.bg);
            document.body.style.setProperty('--ledger-scene', cosmetics.backdrop(id));
        } else {
            document.body.style.removeProperty('--ledger-bg');
            document.body.style.removeProperty('--ledger-scene');
        }
    }
    function toast(text) {
        document.querySelector('.le-toast')?.remove();
        clearTimeout(toastTimer);
        const el = document.createElement('div'); el.className = 'le-toast'; el.textContent = text; el.setAttribute('role', 'status');
        document.body.append(el); toastTimer = setTimeout(() => el.remove(), 3200);
    }
    function play(id) {
        // Presentation errors must never escape into the successful save/undo path.
        try {
            root.SpecialThemes?.thunder.stop();
            root.SpecialThemes?.chess.stop();
            root.LedgerOriginalEffects.stop();
            if (id === 'homecoming_effect') return root.HomecomingEffect?.play({ muted: preferences.muted });
            root.HomecomingEffect?.cleanup();
            if (id === 'thunder_effect') return root.SpecialThemes.thunder.onAdd({ muted: preferences.muted });
            if (id === 'chess_effect') return root.SpecialThemes.chess.onAdd({ muted: preferences.muted });
            root.LedgerOriginalEffects.play(id, matchMedia('(prefers-reduced-motion: reduce)').matches, preferences.muted);
        } catch (error) { console.warn('Effect unavailable', error); }
    }
    function open() {
        previousFocus = document.activeElement;
        panel.classList.add('open'); document.body.style.overflow = 'hidden'; render(); panel.querySelector('.le-content').scrollTop = 0; panel.querySelector('.le-close').focus();
    }
    function close() {
        panel.classList.remove('open'); document.body.style.overflow = ''; applyBackground(); previousFocus?.focus();
    }
    function preview(id) {
        const item = catalog[id];
        if (!item) return;
        if (item.type === 'badge') { showReveal(id); return; }
        if (item.type === 'effect') play(id);
        else {
            document.body.classList.add('le-themed'); document.body.style.setProperty('--ledger-bg', item.bg);
            document.body.dataset.theme = item.family;
            document.body.style.setProperty('--ledger-scene', cosmetics.backdrop(id));
            document.querySelector('#ledger-original-background').className = `ledger-original-theme theme-${item.family}`;
            if (item.family === 'dorm') root.DormBackground?.mount(document.querySelector('#ledger-original-background'));
            else root.DormBackground?.cleanup();
            if (item.family === 'thunder') root.SpecialThemes?.thunder.ambient.mount(document.querySelector('#ledger-original-background'));
            else root.SpecialThemes?.thunder.ambient.cleanup();
            if (item.family === 'chess') root.SpecialThemes?.chess.ambient.mount(document.querySelector('#ledger-original-background'));
            else root.SpecialThemes?.chess.ambient.cleanup();
            toast('背景預覽 · 關閉面板後恢復原設定');
        }
    }
    function equip(id) {
        if (!has(id) || catalog[id]?.type === 'badge') return;
        settings()[catalog[id].type] = id;
        if (id === 'homecoming_effect') {
            root.HomecomingEffect?.enable();
            root.HomecomingEffect?.prepare().catch(() => {});
        }
        if (id === 'chess_effect') root.SpecialThemes?.chess.prepare().catch(() => {});
        writeLocal(storageKey, preferences); applyBackground(); render(); toast('已套用 · 僅影響此裝置');
    }
    function render() {
        const content = panel.querySelector('.le-content');
        const scroll = content.scrollTop;
        const items = Object.values(catalog).filter(item => item.type === tab);
        const equipped = catalog[settings()[tab]];
        let html = `<div class="le-segments" aria-label="外觀類型"><button data-tab="color" aria-pressed="${tab === 'color'}">背景</button><button data-tab="effect" aria-pressed="${tab === 'effect'}">新增特效</button><button data-tab="badge" aria-pressed="${tab === 'badge'}">徽章</button></div>`;
        if (tab === 'badge') {
            html += `<div class="le-equipped"><span class="le-eyebrow">共同收藏</span><strong>紀念徽章 <span>${items.length}</span></strong></div>`;
        } else {
            html += `<div class="le-equipped"><span class="le-eyebrow">目前使用 · 此裝置</span><strong>${equipped && has(equipped.id) ? esc(equipped.name) : tab === 'color' ? '預設帳本背景' : '不播放新增特效'}</strong><div class="le-equipped-actions"><button class="le-secondary" data-disable ${!settings()[tab] ? 'disabled' : ''}>${tab === 'color' ? '恢復預設' : '關閉特效'}</button>${tab === 'effect' ? `<button class="le-secondary" data-mute aria-pressed="${preferences.muted}">${preferences.muted ? '音效：關閉' : '音效：開啟'}</button>` : ''}</div></div>`;
        }
        html += `<h3 class="le-group-title">已擁有<span>${items.length}</span></h3><div class="le-grid">`;
        for (const item of items) {
            if (tab === 'badge') {
                html += `<article class="le-card le-badge-card${item.tier === 'special' ? ' special' : ''}"><button class="le-badge-preview" data-preview="${item.id}" aria-label="查看${esc(item.name)}"><div class="le-art">${cosmetics.art(item.id)}<span class="le-badge-tier">${item.tier === 'special' ? '特別紀念' : '日常紀念'}</span></div><div class="le-card-info"><strong>${esc(item.name)}</strong><small>已收藏</small></div></button></article>`;
                continue;
            }
            const selected = settings()[tab] === item.id;
            html += `<article class="le-card${selected ? ' selected' : ''}"><div class="le-art ledger-original-theme theme-${item.family}" data-family="${item.family}" style="--art-bg:${item.bg}">${tab === 'effect' ? cosmetics.art(item.id) : ''}${selected && tab !== 'color' ? '<span class="le-equipped-badge">使用中</span>' : ''}</div><div class="le-card-info"><strong>${esc(item.name)}</strong><small>${selected ? '此裝置已套用' : '可立即使用'}</small><div class="le-card-actions"><button data-preview="${item.id}">預覽</button><button data-equip="${item.id}" ${selected ? 'disabled' : ''}>${selected ? '已套用' : '套用'}</button></div></div></article>`;
        }
        html += '</div>';
        content.innerHTML = html;
        content.scrollTop = scroll;
    }
    function showReveal(id) {
        revealId = id; const item = catalog[id];
        reveal.querySelector('.le-reveal-art').classList.toggle('special', item.type === 'badge' && item.tier === 'special');
        reveal.querySelector('.le-reveal-art').classList.toggle('is-badge', item.type === 'badge');
        reveal.querySelector('.le-reveal-art').style.setProperty('--art-bg', item.bg);
        const artwork = cosmetics.art(id);
        if (item.type === 'badge') {
            const silhouette = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><style>*{fill:white!important;stroke:white!important;stroke-width:2.6;opacity:1!important}</style>${item.shape}</svg>`;
            reveal.querySelector('.le-reveal-art').style.setProperty('--badge-silhouette', `url("data:image/svg+xml,${encodeURIComponent(silhouette)}")`);
            const side = suffix => artwork.replaceAll(id, `${id}-${suffix}`).replace('le-badge-art', 'le-badge-side-art');
            reveal.querySelector('.le-reveal-art').innerHTML = `<div class="le-badge-object"><div class="le-badge-depth back">${side('back')}</div><div class="le-badge-depth middle">${side('middle')}</div><div class="le-badge-depth bevel">${side('bevel')}</div><div class="le-badge-face">${artwork}</div></div>`;
            const face = reveal.querySelector('.le-badge-face svg');
            const ns = 'http://www.w3.org/2000/svg';
            const relief = document.createElementNS(ns, 'filter');
            relief.id = `${id}-relief`;
            relief.setAttribute('x', '-20%');
            relief.setAttribute('y', '-20%');
            relief.setAttribute('width', '140%');
            relief.setAttribute('height', '140%');
            relief.setAttribute('color-interpolation-filters', 'sRGB');
            relief.innerHTML = '<feGaussianBlur in="SourceAlpha" stdDeviation=".65" result="bump"/><feSpecularLighting in="bump" surfaceScale="3" specularConstant=".48" specularExponent="18" lighting-color="#fff1d0" result="shine"><feDistantLight azimuth="225" elevation="48"/></feSpecularLighting><feComposite in="shine" in2="SourceAlpha" operator="in" result="clippedShine"/><feComposite in="SourceGraphic" in2="clippedShine" operator="arithmetic" k2="1" k3=".65" result="lit"/><feDropShadow in="lit" dx=".65" dy="1.15" stdDeviation=".45" flood-color="#070c18" flood-opacity=".7"/>';
            face.querySelector('defs').append(relief);
            // Each enamel piece casts its own shadow rather than shading a single flat image.
            for (const part of face.querySelector('g').children) {
                part.setAttribute('filter', `url(#${relief.id})`);
            }
        } else { reveal.querySelector('.le-reveal-art').innerHTML = artwork; reveal.querySelector('.le-reveal-art').style.removeProperty('--badge-silhouette'); }
        resetBadgeTilt();
        reveal.querySelector('h2').textContent = item.name;
        reveal.querySelector('.le-eyebrow').textContent = item.type === 'badge' ? `${item.tier === 'special' ? '特別紀念' : '日常紀念'} / 已收藏` : '共同收藏';
        reveal.querySelector('p').textContent = item.type === 'badge' ? item.desc : '收藏永久保留，外觀可隨時更換。';
        reveal.querySelector('[data-reveal-equip]').hidden = item.type === 'badge';
        reveal.querySelector('[data-reveal-preview]').hidden = item.type === 'badge';
        reveal.classList.add('open'); reveal.querySelector('button').focus();
    }
    function resetBadgeTilt() {
        const art = reveal?.querySelector('.le-reveal-art');
        if (!art) return;
        art.classList.remove('tilting');
        for (const [key, value] of Object.entries({ '--badge-rx': '0deg', '--badge-ry': '0deg', '--badge-light-x': '40%', '--badge-light-y': '25%', '--badge-shadow-x': '0px', '--badge-shadow-y': '10px' })) art.style.setProperty(key, value);
    }
    function installBadgeTilt() {
        const art = reveal.querySelector('.le-reveal-art');
        let pointer = null, origin = null;
        const update = event => {
            if (!art.classList.contains('is-badge') || !reveal.classList.contains('open') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            if (event.pointerType !== 'mouse' && pointer !== event.pointerId) return;
            const rect = art.getBoundingClientRect();
            const dragging = pointer === event.pointerId && origin;
            const x = Math.max(-1, Math.min(1, dragging ? (event.clientX - origin.x) / rect.width * 2 : (event.clientX - rect.left) / rect.width * 2 - 1));
            const y = Math.max(-1, Math.min(1, dragging ? (event.clientY - origin.y) / rect.height * 2 : (event.clientY - rect.top) / rect.height * 2 - 1));
            art.classList.add('tilting');
            const angle = 12;
            // Hover follows the pointer like a display card; dragging rotates the grabbed object.
            art.style.setProperty('--badge-rx', `${(dragging ? y : -y) * angle}deg`);
            art.style.setProperty('--badge-ry', `${(dragging ? -x : x) * angle}deg`);
            art.style.setProperty('--badge-light-x', `${50 - x * 30}%`);
            art.style.setProperty('--badge-light-y', `${40 - y * 25}%`);
            art.style.setProperty('--badge-shadow-x', `${-x * 7}px`);
            art.style.setProperty('--badge-shadow-y', `${10 - y * 4}px`);
        };
        art.addEventListener('pointerdown', event => {
            if (!art.classList.contains('is-badge') || matchMedia('(prefers-reduced-motion: reduce)').matches || (pointer !== null && pointer !== event.pointerId)) return;
            pointer = event.pointerId; origin = { x: event.clientX, y: event.clientY };
            art.setPointerCapture(pointer); update(event);
        });
        art.addEventListener('pointermove', update);
        const finish = () => { pointer = null; origin = null; resetBadgeTilt(); };
        art.addEventListener('pointerup', finish);
        art.addEventListener('pointercancel', finish);
        art.addEventListener('lostpointercapture', finish);
        art.addEventListener('pointerleave', () => { if (pointer === null) resetBadgeTilt(); });
        matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', finish);
    }
    function init() {
        preferences.p1 ||= {}; preferences.p2 ||= {};
        entry = document.createElement('div'); entry.className = 'ledger-extras';
        entry.innerHTML = `<button class="le-entry" data-open="appearance" aria-label="外觀收藏" title="外觀收藏">${icon('palette')}<span>外觀收藏</span></button>`;
        (document.querySelector('.header-tools') || document.querySelector('#view-input .page-wrapper')).prepend(entry);
        panel = document.createElement('div'); panel.className = 'le-backdrop';
        panel.innerHTML = `<section class="le-panel" role="dialog" aria-modal="true" aria-labelledby="le-title"><div class="le-heading"><div><span class="le-eyebrow">DORM / DAILY COLLECTION</span><h2 id="le-title">你的帳本外觀</h2></div><button class="le-close" aria-label="關閉面板">${icon('close')}</button></div><div class="le-content"></div></section>`;
        reveal = document.createElement('div'); reveal.className = 'le-reveal';
        reveal.innerHTML = '<section class="le-reveal-inner" role="dialog" aria-modal="true" aria-labelledby="le-reveal-title"><span class="le-eyebrow">共同收藏</span><div class="le-reveal-art"></div><h2 id="le-reveal-title"></h2><p>收藏永久保留，外觀可隨時更換。</p><div class="le-reveal-actions"><button class="le-secondary" data-reveal-close>關閉</button><button class="le-secondary" data-reveal-preview>預覽</button><button class="le-primary" data-reveal-equip>套用</button></div></section>';
        document.body.append(panel, reveal);
        installBadgeTilt();
        const background = document.createElement('div');
        background.id = 'ledger-original-background'; background.setAttribute('aria-hidden', 'true'); document.body.prepend(background);
        entry.addEventListener('click', e => { if (e.target.closest('[data-open="appearance"]')) open(); });
        document.querySelector('#confirmOkBtn').addEventListener('click', () => {
            if (settings().effect === 'thunder_effect' && has('thunder_effect')) {
                root.StormAudio?.prime(preferences.muted || matchMedia('(prefers-reduced-motion: reduce)').matches);
            }
            if (document.querySelector('#confirmTitle')?.textContent === '確認新增' && settings().effect === 'chess_effect' && has('chess_effect')) {
                root.ChessAudio?.prime(preferences.muted || matchMedia('(prefers-reduced-motion: reduce)').matches);
            }
        }, { capture: true });
        panel.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (e.target === panel || b?.classList.contains('le-close')) return close();
            if (!b) return;
            if (b.dataset.tab) { tab = b.dataset.tab; render(); panel.querySelector('.le-content').scrollTop = 0; }
            if (b.dataset.preview) {
                if (b.dataset.preview === 'chess_effect') root.ChessAudio?.prime(preferences.muted || matchMedia('(prefers-reduced-motion: reduce)').matches);
                preview(b.dataset.preview);
            }
            if (b.dataset.equip) equip(b.dataset.equip);
            if (b.hasAttribute('data-disable')) { if (tab === 'effect') { root.HomecomingEffect?.cleanup(); root.SpecialThemes?.thunder.stop(); root.SpecialThemes?.chess.stop(); root.StormAudio?.clearPrime(); root.ChessAudio?.clearPrime(); root.LedgerOriginalEffects.stop(); } settings()[tab] = null; writeLocal(storageKey, preferences); applyBackground(); render(); }
            if (b.hasAttribute('data-mute')) { setMuted(!preferences.muted); render(); }
        });
        reveal.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-reveal-close')) closeReward();
            if (b.hasAttribute('data-reveal-preview')) { reveal.classList.remove('open'); preview(revealId); panel.querySelector('.le-close').focus(); }
            if (b.hasAttribute('data-reveal-equip')) { equip(revealId); closeReward(); }
        });
        document.addEventListener('keydown', e => {
            const target = reveal.classList.contains('open') ? reveal : panel.classList.contains('open') ? panel : null;
            if (!target) return;
            if (e.key === 'Escape') { if (target === reveal) { reveal.classList.remove('open'); panel.querySelector('.le-close').focus(); } else close(); }
            if (e.key === 'Tab') {
                const nodes = [...target.querySelectorAll('button:not(:disabled),select')].filter(el => el.getClientRects().length);
                const first = nodes[0], last = nodes.at(-1);
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
        window.addEventListener('pagehide', () => root.LedgerOriginalEffects.stop());
        applyBackground();
    }
    root.SplitExtras = {
        init,
        isMuted: () => Boolean(preferences.muted),
        setMuted,
        needsAddChime: () => settings().effect !== 'chess_effect' || !has(settings().effect),
        added: () => { const id = settings().effect; if (has(id)) play(id); },
    };
})(globalThis);
