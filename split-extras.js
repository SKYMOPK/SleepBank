(function (root) {
    const core = root.SplitPassCore;
    const config = root.SplitPassConfig;
    const cosmetics = root.SplitCosmetics;
    const catalog = cosmetics.catalog;
    const storageKey = 'split-appearance-v1';
    const queueKey = 'split-pass-outbox-v1';
    const icon = name => `<svg class="le-icon" viewBox="0 0 24 24" aria-hidden="true">${{
        palette: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4 2 2 0 0 1 0-4h3a4 4 0 0 0 4-4c0-4-5-6-9-6Z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="6" r="1"/><circle cx="15" cy="7" r="1"/>',
        pass: '<path d="M5 3h14v18H5Z M9 7h6m-6 4h6m-5 5 2 2 4-4"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
    }[name]}</svg>`;
    const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
    function writeLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browser storage can be disabled. */ } }
    const preferences = readLocal(storageKey, { user: 'p1', p1: {}, p2: {}, muted: true });
    preferences.shared ||= { ...(preferences[preferences.user] || preferences.p1 || {}) };
    let outbox = readLocal(queueKey, {});
    let db, ref, data = core.normalize(null), connected = false, serverOffset = 0;
    let mode = 'appearance', tab = 'color', loading = true, loadError = '';
    let panel, reveal, overlay, entry, previewNode, previousFocus, revealId, busy = false, syncing = false;
    let passError = '', lastClockKey = '';
    let timer, toastTimer;
    const now = () => Date.now() + serverOffset;
    const validSeasons = config.seasons;
    const configErrors = core.validate(validSeasons, catalog);
    const settings = () => preferences.shared;
    const has = id => !!data.collection[id];
    const active = () => configErrors.length ? null : core.seasonAt(validSeasons, now());
    const selectedSeason = () => validSeasons.find(s => s.id === panel?.querySelector('#le-season')?.value) || active() || validSeasons.at(-1);
    function applyBackground() {
        const id = settings().color;
        const item = catalog[id];
        const permitted = item && has(id);
        const scene = document.querySelector('#ledger-original-background');
        if (scene) scene.className = permitted ? `ledger-original-theme theme-${item.family}` : '';
        document.body.classList.toggle('le-themed', !!permitted);
        if (permitted) {
            document.body.style.setProperty('--ledger-bg', item.bg);
            document.body.style.setProperty('--ledger-scene', cosmetics.backdrop(id));
        } else {
            document.body.style.removeProperty('--ledger-bg');
            document.body.style.removeProperty('--ledger-scene');
        }
    }
    function statusText() {
        const s = active();
        return s ? `LV${core.level(data.seasons[s.id]?.xp || 0)}` : '待開季';
    }
    function updateEntry() {
        entry.querySelector('[data-pass-label]').textContent = statusText();
    }
    function amountPreview(total) {
        if (!previewNode) return;
        const s = active();
        if (!s) { previewNode.textContent = '通行證尚未開季 · 本筆不累積經驗'; return; }
        const state = data.seasons[s.id] || {};
        const amount = Math.max(0, Math.min(core.baseXp(total), 200 - (state.days?.[core.dayKey(now())] || 0), 1560 - (state.xp || 0)));
        previewNode.textContent = total > 0 ? `本筆預計 +${amount} EXP · 以儲存時剩餘額度為準` : '新增帳目可累積共用通行證經驗';
    }
    function toast(text) {
        document.querySelector('.le-toast')?.remove();
        clearTimeout(toastTimer);
        const el = document.createElement('div'); el.className = 'le-toast'; el.textContent = text; el.setAttribute('role', 'status');
        document.body.append(el); toastTimer = setTimeout(() => el.remove(), 3200);
    }
    function play(id) {
        root.LedgerOriginalEffects.play(id, matchMedia('(prefers-reduced-motion: reduce)').matches, preferences.muted);
    }
    function open(next) {
        mode = next; previousFocus = document.activeElement;
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
            document.body.style.setProperty('--ledger-scene', cosmetics.backdrop(id));
            document.querySelector('#ledger-original-background').className = `ledger-original-theme theme-${item.family}`;
            toast('背景預覽 · 關閉面板後恢復原設定');
        }
    }
    function equip(id) {
        if (!has(id) || catalog[id]?.type === 'badge') return;
        settings()[catalog[id].type] = id;
        writeLocal(storageKey, preferences); applyBackground(); render(); toast('已套用 · 僅影響此裝置');
    }
    function render() {
        const content = panel.querySelector('.le-content');
        const scroll = content.scrollTop;
        panel.querySelector('h2').textContent = mode === 'appearance' ? '你的帳本外觀' : '宿舍通行證';
        let html = '';
        if (mode === 'appearance') {
            html = `<div class="le-segments" aria-label="外觀類型"><button data-tab="color" aria-pressed="${tab === 'color'}">背景</button><button data-tab="effect" aria-pressed="${tab === 'effect'}">新增特效</button><button data-tab="badge" aria-pressed="${tab === 'badge'}">徽章</button></div>`;
            if (loading || loadError) html += `<div class="le-status${loadError ? ' error' : ''}" role="status">${loading ? '正在讀取外觀收藏…' : esc(loadError)}</div>`;
            const equipped = catalog[settings()[tab]];
            if (tab === 'badge') html += `<div class="le-equipped"><span class="le-eyebrow">第一季 · 宿舍日常</span><strong>紀念徽章 <span>${Object.values(catalog).filter(i => i.type === 'badge' && has(i.id)).length} / 12</span></strong></div>`;
            else html += `<div class="le-equipped"><span class="le-eyebrow">目前使用 · 此裝置</span><strong>${equipped && has(equipped.id) ? equipped.name : tab === 'color' ? '預設帳本背景' : '不播放新增特效'}</strong><div class="le-equipped-actions"><button class="le-secondary" data-disable ${!settings()[tab] ? 'disabled' : ''}>${tab === 'color' ? '恢復預設' : '關閉特效'}</button>${tab === 'effect' ? `<button class="le-secondary" data-mute aria-pressed="${preferences.muted}">${preferences.muted ? '音效：關閉' : '音效：開啟'}</button>` : ''}</div></div>`;
            const items = Object.values(catalog).filter(i => i.type === tab);
            for (const available of [true, false]) {
            const group = items.filter(item => has(item.id) === available);
            html += `<h3 class="le-group-title">${available ? '已擁有' : '尚未解鎖'}<span>${group.length}</span></h3>`;
            if (available && !group.length && !loading) html += '<div class="le-status">目前沒有已擁有的外觀</div>';
            html += '<div class="le-grid">';
            for (const item of group) {
                if (tab === 'badge') {
                    const rewardLevel = Object.entries(validSeasons[0].rewards).find(([, id]) => id === item.id)?.[0];
                    html += `<article class="le-card le-badge-card${item.tier === 'special' ? ' special' : ''}"><button class="le-badge-preview" data-preview="${item.id}" aria-label="查看${item.name}"><div class="le-art">${cosmetics.art(item.id)}<span class="le-badge-tier">${item.tier === 'special' ? '特別紀念' : '日常紀念'}</span></div><div class="le-card-info"><strong>${item.name}</strong><small>${available ? '已收藏' : `LV${rewardLevel} · 尚未解鎖`}</small></div></button></article>`;
                    continue;
                }
                const selected = settings()[tab] === item.id;
                html += `<article class="le-card${selected ? ' selected' : ''}${!available ? ' locked' : ''}"><div class="le-art ledger-original-theme theme-${item.family}" data-family="${item.family}" style="--art-bg:${item.bg}">${tab === 'effect' ? cosmetics.art(item.id) : ''}${selected && available ? '<span class="le-equipped-badge">使用中</span>' : ''}</div><div class="le-card-info"><strong>${item.name}</strong><small>${selected && available ? '此裝置已套用' : available ? '可立即使用' : '未解鎖 · 可預覽'}</small><div class="le-card-actions"><button data-preview="${item.id}">預覽</button><button data-equip="${item.id}" ${!available || selected ? 'disabled' : ''}>${selected && available ? '已套用' : available ? '套用' : '未解鎖'}</button></div></div></article>`;
            }
            html += '</div>';
            }
        } else {
            const season = selectedSeason();
            const state = data.seasons[season.id] || {};
            const xp = state.xp || 0, lv = core.level(xp), current = active()?.id === season.id;
            const ended = season.startAt !== null && now() >= core.seasonEnd(season);
            html += `<label for="le-season" class="le-eyebrow">賽季</label><select id="le-season" class="le-entry" style="width:100%;margin:8px 0 20px">${validSeasons.map(s => `<option value="${s.id}" ${s.id === season.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
            html += `<div class="le-progress"><div class="le-progress-head"><div class="le-level">LV${lv} <span>/ 40</span></div><span>${xp.toLocaleString()} / 1,560 EXP</span></div><div class="le-bar"><div style="width:${lv === 40 ? 100 : (xp % 40) / 40 * 100}%"></div></div><p>${lv === 40 ? '本季已滿級' : `下一級還需 ${40 - xp % 40} EXP`} · ${current ? `今日剩餘 ${Math.max(0, 200 - (state.days?.[core.dayKey(now())] || 0))} EXP` : ended ? '本季已結束' : '尚未開季'}</p></div>`;
            if (configErrors.length) html += `<div class="le-status error">設定需修正：${esc(configErrors.join('；'))}</div>`;
            else if (!season.enabled || season.startAt === null) html += '<div class="le-status">首季籌備中。獎勵可預覽，正式啟用後才開放領取；現在記帳不累積經驗。</div>';
            else html += `<div class="le-status">${ended ? '已結束' : '賽季期間'} · ${new Date(season.startAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} — ${new Date(core.seasonEnd(season)).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}<br>每日額度於台灣時間 04:00 重置。</div>`;
            if (!connected) html += '<div class="le-status error">尚未連線，經驗與領獎會在連線後處理。</div>';
            if (passError) html += `<div class="le-status error" role="status">${esc(passError)}</div>`;
            if (Object.keys(outbox).length) html += '<div class="le-status">有待同步的經驗紀錄，連線後會自動重試；不影響帳目儲存。</div>';
            html += `<div class="le-track-heading"><strong>賽季獎勵</strong><span>40 個等級 · 共用進度</span></div><div class="le-pass-track" style="--track-progress:${Math.min(1, xp / 1560) * 100}%"><div class="le-track-line"><div></div></div>`;
            for (let i = 1; i <= 40; i++) {
                const id = season.rewards?.[i], item = catalog[id], claimed = state.claimed?.[i];
                const unlocked = (state.peakLevel || lv) >= i && season.enabled && season.startAt !== null && now() >= season.startAt;
                html += `<div class="le-pass-row${i <= lv ? ' reached' : ''}${i === lv ? ' current' : ''}${claimed ? ' claimed' : ''}"><div class="le-track-label"><span class="le-row-level">LV ${i}</span><small>${(i - 1) * 40} EXP</small>${i === lv ? '<em>目前等級</em>' : ''}</div><span class="le-track-node" aria-hidden="true">${i}</span><div class="le-track-reward"><div class="le-reward-art">${item ? cosmetics.art(id) : '<span class="le-empty-art">—</span>'}</div><div><strong>${item ? item.name : '本級無獎勵'}</strong><small>${item ? item.type === 'badge' ? '紀念徽章' : item.limited ? '限定外觀' : '常駐外觀' : '持續累積進度'}${claimed ? ' · 已領取' : item && !season.enabled ? ' · 尚未開季' : item && unlocked ? ' · 可領取' : ''}</small></div>${item ? `<button class="le-secondary" data-preview="${id}">預覽</button><button class="${unlocked ? 'le-primary' : 'le-secondary'}" data-claim="${i}" ${!unlocked || !connected || busy ? 'disabled' : ''}>${claimed ? '重看' : busy ? '處理中' : '領取'}</button>` : ''}</div></div>`;
            }
            html += '</div>';
        }
        content.innerHTML = html; content.scrollTop = scroll;
    }
    async function transact(fn) {
        if (!connected) throw new Error('offline');
        const result = await ref.transaction(value => fn(value));
        return result.snapshot.val();
    }
    async function claim(lv) {
        const season = selectedSeason(), id = season.rewards[lv];
        if (!catalog[id] || busy || configErrors.length || !season.enabled || now() < season.startAt) return;
        if (data.seasons[season.id]?.claimed?.[lv]) return showReveal(id);
        busy = true; render();
        try {
            const claimedAt = now();
            const value = await transact(value => core.claim(value, season, lv, claimedAt));
            if (!value?.seasons?.[season.id]?.claimed?.[lv]) throw new Error('not-unlocked');
            showReveal(id);
        } catch { toast('領取未完成，請確認連線後重試'); }
        finally { busy = false; render(); }
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
        reveal.querySelector('.le-eyebrow').textContent = item.type === 'badge' ? `${item.tier === 'special' ? '特別紀念' : '日常紀念'} / ${has(id) ? '已收藏' : '設計預覽 · 尚未解鎖'}` : 'SHARED COLLECTION / 雙方共同解鎖';
        const source = validSeasons.find(s => Object.values(s.rewards || {}).includes(id));
        const rewardLevel = source && Object.entries(source.rewards).find(([, reward]) => reward === id)?.[0];
        const obtainedAt = source && data.seasons[source.id]?.claimedAt?.[rewardLevel];
        reveal.querySelector('p').textContent = item.type === 'badge' ? `${item.desc} · ${source?.name || '賽季紀念'} · LV${rewardLevel || '—'}${obtainedAt ? ` · ${new Date(obtainedAt).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}取得` : ''}` : '收藏永久保留，外觀可隨時更換。';
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
    const ORPHAN_PENDING_GRACE = 5 * 60 * 1000;
    function enqueue(key, action) {
        outbox[key] = action; writeLocal(queueKey, outbox); flush().catch(() => {});
    }
    async function flush() {
        if (syncing || !connected || configErrors.length) return;
        syncing = true;
        try {
            for (const [key, op] of Object.entries(outbox)) {
                if (op.kind === 'register' && !op.successAt) {
                    const record = (await db.ref(`split/records/${key}`).once('value')).val();
                    if (record && !record.deletedAt) {
                        op.successAt = Number(record.timestamp) || now();
                        writeLocal(queueKey, outbox);
                    }
                }
                await transact(value => {
                    if (op.kind === 'register') {
                        if (op.successAt) return core.finalizeRegistration(value, validSeasons, key, op.total, op.successAt);
                        const season = validSeasons.find(s => s.id === op.seasonId);
                        if (!season) return core.normalize(value);
                        const next = core.register(value, season, key, op.total, op.preparedAt);
                        if (!value?.seasons?.[season.id]?.entries?.[key]) next.seasons[season.id].entries[key].confirmed = false;
                        return next;
                    }
                    if (op.kind === 'confirm') {
                        const next = core.normalize(value);
                        const e = next.seasons[op.seasonId]?.entries?.[key];
                        if (e && !e.confirmed && e.status === 'pending') { e.confirmed = true; e.dueAt = op.time + 6000; }
                        return next;
                    }
                    if (op.kind === 'cancel') return core.discardPending(value, key);
                    return op.kind === 'restore' ? core.restore(value, op.seasonId, key) : core.revoke(value, op.seasonId, key);
                });
                if (outbox[key] === op && !(op.kind === 'register' && !op.successAt)) {
                    delete outbox[key]; writeLocal(queueKey, outbox);
                }
            }
            for (const [seasonId, s] of Object.entries(data.seasons)) {
                for (const [key, e] of Object.entries(s.entries || {})) {
                    if (e.status !== 'pending' || e.dueAt > now()) continue;
                    const record = (await db.ref(`split/records/${key}`).once('value')).val();
                    if (!record) {
                        const age = now() - Number(e.dueAt || e.savedAt || 0);
                        if (e.confirmed === false && age >= ORPHAN_PENDING_GRACE) await transact(value => core.discardPending(value, key));
                        continue;
                    }
                    if (record.deletedAt) await transact(value => core.revoke(value, seasonId, key));
                    else if (e.confirmed === false) {
                        if (!record.budgetSync) {
                            const savedAt = Number(record.timestamp) || now();
                            await transact(value => core.finalizeRegistration(value, validSeasons, key, e.total, savedAt));
                        }
                    }
                    else {
                        const before = data.seasons[seasonId]?.xp || 0;
                        const value = await transact(value => core.award(value, seasonId, key, now()));
                        const after = value.seasons[seasonId].xp;
                        const amount = value.seasons[seasonId].entries[key].amount;
                        if (amount > 0 && document.visibilityState === 'visible') toast(core.level(after) > core.level(before) ? `+${amount} EXP · 通行證升至 LV${core.level(after)}` : `+${amount} EXP · 共用進度已更新`);
                    }
                }
            }
        } catch {
            passError = '經驗同步尚未完成，會自動重試。若持續出現，請檢查通行證資料區的讀寫權限。';
            if (panel.classList.contains('open') && mode === 'pass') render();
        }
        finally { syncing = false; }
    }
    async function prepare(key, record) {
        const season = active();
        const preparedAt = now();
        const op = { kind: 'register', seasonId: season?.id || null, total: Number(record.p1_bought) + Number(record.p2_bought), preparedAt };
        outbox[key] = op; writeLocal(queueKey, outbox);
        if (connected) await flush();
    }
    function changed(key, before, after) {
        for (const [id, s] of Object.entries(data.seasons)) {
            if (!s.entries?.[key]) continue;
            if (before && !after) enqueue(key, { kind: 'revoke', seasonId: id });
            else if (!before && after) enqueue(key, { kind: 'restore', seasonId: id });
        }
    }
    function saved(key, record) {
        const current = outbox[key];
        const successAt = now();
        const total = Number(record?.p1_bought || 0) + Number(record?.p2_bought || 0);
        outbox[key] = {
            kind: 'register',
            seasonId: current?.kind === 'register' ? current.seasonId : null,
            total,
            preparedAt: current?.kind === 'register' ? current.preparedAt : successAt,
            successAt,
        };
        writeLocal(queueKey, outbox);
        flush().catch(() => {});
    }
    async function failed(key) {
        try {
            const record = (await db.ref(`split/records/${key}`).once('value')).val();
            if (record && !record.deletedAt) { saved(key, record); return; }
        } catch {
            // Keep the local pending operation. It will be reconciled after reconnecting.
            return;
        }
        const current = outbox[key];
        outbox[key] = { kind: 'cancel', seasonId: current?.seasonId || null };
        writeLocal(queueKey, outbox);
        flush().catch(() => {});
    }
    function init(database) {
        db = database; ref = db.ref('splitPass');
        preferences.p1 ||= {}; preferences.p2 ||= {};
        entry = document.createElement('div'); entry.className = 'ledger-extras';
        entry.innerHTML = `<button class="le-entry" data-open="pass">${icon('pass')}<span>通行證</span><small data-pass-label>待開季</small></button><button class="le-entry" data-open="appearance">${icon('palette')}<span>外觀收藏</span></button>`;
        document.querySelector('#view-input .page-wrapper').prepend(entry);
        previewNode = document.createElement('small'); previewNode.className = 'le-xp-preview'; document.querySelector('#previewText').after(previewNode);
        panel = document.createElement('div'); panel.className = 'le-backdrop';
        panel.innerHTML = `<section class="le-panel" role="dialog" aria-modal="true" aria-labelledby="le-title"><div class="le-heading"><div><span class="le-eyebrow">DORM / DAILY COLLECTION</span><h2 id="le-title">你的帳本外觀</h2></div><button class="le-close" aria-label="關閉面板">${icon('close')}</button></div><div class="le-content"></div></section>`;
        reveal = document.createElement('div'); reveal.className = 'le-reveal';
        reveal.innerHTML = '<section class="le-reveal-inner" role="dialog" aria-modal="true" aria-labelledby="le-reveal-title"><span class="le-eyebrow">SHARED COLLECTION / 雙方共同解鎖</span><div class="le-reveal-art"></div><h2 id="le-reveal-title"></h2><p>收藏永久保留，外觀可隨時更換。</p><div class="le-reveal-actions"><button class="le-secondary" data-reveal-close>略過／關閉</button><button class="le-secondary" data-reveal-preview>預覽</button><button class="le-primary" data-reveal-equip>套用</button></div></section>';
        overlay = document.createElement('div'); overlay.className = 'le-fx-overlay'; overlay.setAttribute('aria-hidden', 'true');
        document.body.append(panel, reveal, overlay);
        installBadgeTilt();
        const background = document.createElement('div');
        background.id = 'ledger-original-background'; background.setAttribute('aria-hidden', 'true'); document.body.prepend(background);
        entry.addEventListener('click', e => { const button = e.target.closest('[data-open]'); if (button) open(button.dataset.open); });
        panel.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (e.target === panel || b?.classList.contains('le-close')) return close();
            if (!b) return;
            if (b.dataset.tab) { tab = b.dataset.tab; render(); panel.querySelector('.le-content').scrollTop = 0; }
            if (b.dataset.preview) preview(b.dataset.preview);
            if (b.dataset.equip) equip(b.dataset.equip);
            if (b.hasAttribute('data-disable')) { settings()[tab] = null; writeLocal(storageKey, preferences); applyBackground(); render(); }
            if (b.hasAttribute('data-mute')) { preferences.muted = !preferences.muted; writeLocal(storageKey, preferences); render(); }
            if (b.dataset.claim) claim(Number(b.dataset.claim));
        });
        panel.addEventListener('change', e => { if (e.target.id === 'le-season') render(); });
        reveal.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-reveal-close')) { reveal.classList.remove('open'); panel.querySelector('.le-close').focus(); }
            if (b.hasAttribute('data-reveal-preview')) { reveal.classList.remove('open'); preview(revealId); panel.querySelector('.le-close').focus(); }
            if (b.hasAttribute('data-reveal-equip')) { equip(revealId); reveal.classList.remove('open'); panel.querySelector('.le-close').focus(); }
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
        ref.on('value', snapshot => {
            loading = false; loadError = ''; passError = ''; data = core.normalize(snapshot.val()); updateEntry(); applyBackground();
            if (panel.classList.contains('open')) render();
            amountPreview(Number(document.querySelector('#inp_p1').value) + Number(document.querySelector('#inp_p2').value));
        }, () => {
            loading = false; loadError = '外觀收藏資料無法讀取，請檢查連線及讀取權限。';
            passError = '通行證資料無法讀取，請檢查連線及讀取權限。';
            if (panel.classList.contains('open')) render();
        });
        db.ref('.info/connected').on('value', snapshot => { connected = snapshot.val() === true; if (connected) flush(); });
        db.ref('.info/serverTimeOffset').on('value', snapshot => { serverOffset = Number(snapshot.val()) || 0; });
        const startTimer = () => {
            clearInterval(timer);
            timer = setInterval(() => {
                flush(); updateEntry(); amountPreview(Number(document.querySelector('#inp_p1').value) + Number(document.querySelector('#inp_p2').value));
                const key = `${core.dayKey(now())}:${active()?.id || ''}:${connected}`;
                if (key !== lastClockKey && panel.classList.contains('open') && mode === 'pass') render();
                lastClockKey = key;
            }, 2000);
        };
        startTimer();
        window.addEventListener('pagehide', () => { clearInterval(timer); root.LedgerOriginalEffects.stop(); });
        window.addEventListener('pageshow', event => { if (event.persisted) { startTimer(); flush(); } });
        applyBackground(); amountPreview(0);
    }
    root.SplitExtras = { init, prepare, changed, saved, failed, amountPreview, added: () => { const id = settings().effect; if (has(id)) play(id); } };
})(globalThis);
