/* Shared restaurant management and per-tab draw presentation. */
(function () {
    'use strict';
    const C = window.FoodCore;
    const D = window.FoodDiscovery;
    const $ = id => document.getElementById(id);
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const storageKey = 'dorm-food-round-v1';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = { shuffle: 1600, anticipation: 160, flip: 480, revealGap: 240, revealPause: 80 };
    try {
        const appearance = JSON.parse(localStorage.getItem('split-appearance-v1') || '{}');
        const selected = appearance.shared?.color;
        if (['star_color', 'matcha_color', 'rain_color', 'thunder_color', 'cat_color', 'chess_color', 'dorm_color'].includes(selected)) document.body.dataset.theme = selected;
    } catch (_) { /* Default theme remains available. */ }
    const state = { data: null, connected: false, category: '', exclusions: {}, draw: null, discovery: 'recommended', busy: false, checking: false, editor: null, confirm: null, timers: [], initializing: false, missing: false, error: '' };
    let db, rootRef, connectionRef, toastTimer;
    const returnFocus = new Map();
    try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
        state.category = typeof saved.category === 'string' ? saved.category : '';
        state.discovery = saved.discovery === 'frequent' ? 'frequent' : 'recommended';
        state.exclusions = saved.exclusions && typeof saved.exclusions === 'object' && !Array.isArray(saved.exclusions) ? saved.exclusions : {};
        if (saved.draw && Array.isArray(saved.draw.ids) && saved.draw.ids.length <= 3 && saved.draw.ids.length > 0 && Array.isArray(saved.draw.names) && saved.draw.ids.length === saved.draw.names.length && ['shuffling', 'waiting', 'revealing', 'result', 'complete'].includes(saved.draw.phase)) {
            state.draw = saved.draw;
            if (state.draw.phase === 'shuffling') state.draw.phase = 'waiting';
            if (state.draw.phase === 'revealing') state.draw.phase = Number.isInteger(state.draw.selected) && state.draw.selected >= 0 && state.draw.selected < state.draw.ids.length ? 'result' : 'waiting';
            if (['result', 'complete'].includes(state.draw.phase) && !(Number.isInteger(state.draw.selected) && state.draw.selected >= 0 && state.draw.selected < state.draw.ids.length)) state.draw = null;
        }
    } catch (_) { /* A damaged session starts a new round. */ }
    function persist() {
        try { sessionStorage.setItem(storageKey, JSON.stringify({ category: state.category, discovery: state.discovery, exclusions: state.exclusions, draw: state.draw })); } catch (_) { /* The page still works without storage. */ }
    }
    function later(callback, delay) {
        const timer = setTimeout(() => { state.timers = state.timers.filter(item => item !== timer); callback(); }, delay);
        state.timers.push(timer);
    }
    function clearTimers() { state.timers.forEach(clearTimeout); state.timers = []; }
    function notify(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }
    function exclusions(id = state.category) { return Array.isArray(state.exclusions[id]) ? state.exclusions[id] : []; }
    function categoryName(id) { return state.data?.categories?.[id]?.name || '分類已移除'; }
    function currentPool() { return C.pool(state.data, state.category, exclusions().map(item => item.id)); }
    function validSelection() {
        const d = state.draw;
        const item = d && state.data?.restaurants?.[d.ids[d.selected]];
        return Boolean(d && state.data?.categories?.[d.category] && item && item.enabled !== false && item.categories?.[d.category]);
    }
    function button(text, action, style = 'secondary') { return `<button type="button" class="${style}" data-draw-action="${action}">${text}</button>`; }
    function showOverlay(id, focus) {
        if ($(id).hidden) returnFocus.set(id, document.activeElement);
        $(id).hidden = false; document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => (focus ? $(focus) : $(id).querySelector('button'))?.focus());
    }
    function closeOverlay(id) {
        $(id).hidden = true;
        if ($('manageOverlay').hidden && $('editorOverlay').hidden && $('confirmOverlay').hidden) document.body.style.overflow = '';
        const previous = returnFocus.get(id); if (previous?.isConnected) previous.focus(); returnFocus.delete(id);
    }
    function drawFace(id, name, index, revealed, selected, disabled, shuffling) {
        const lengthClass = name.length > 24 || (name.length > 16 && categoryName(state.category).length > 10) ? ' very-long' : name.length > 12 ? ' long' : '';
        return `<button type="button" class="draw-card${revealed ? ' revealed' : ''}${selected ? ' chosen' : ''}${shuffling ? ' is-shuffling' : ''}" data-card="${index}" data-item="${escape(id)}" ${disabled ? 'disabled' : ''} aria-label="${revealed ? `${selected ? '已選中' : '未選中'} ${escape(name)}` : `選擇第 ${index + 1} 張卡片`}"><span class="draw-card-inner"><span class="card-face card-back" aria-hidden="true"><span class="card-number">0${index + 1}</span><svg><use href="#i-plate"></use></svg></span><span class="card-face card-face-front" ${revealed ? '' : 'aria-hidden="true"'}><strong class="${lengthClass}">${escape(name)}</strong><small>${escape(categoryName(state.category))}</small></span></span></button>`;
    }
    function renderCategories() {
        const visible = C.categories(state.data).filter(item => !item.hidden);
        $('categoryList').innerHTML = visible.length ? visible.map(item => `<button type="button" data-category="${escape(item.id)}" aria-pressed="${item.id === state.category}">${escape(item.name)}</button>`).join('') : `<span class="empty">${state.data ? '目前沒有顯示中的分類，請至分類管理新增或顯示' : '正在載入分類'}</span>`;
    }
    function renderDraw() {
        const d = state.draw;
        const p = currentPool();
        const category = state.data?.categories?.[state.category];
        $('poolCount').textContent = category ? `${p.eligible.length} 間可抽` : '';
        $('drawDescription').textContent = category ? `從「${category.name}」的餐廳中抽出最多三間` : '先選擇一個顯示中的分類';
        let stage = '', message = '', actions = '';
        if (!d) {
            stage = [0, 1, 2].map(i => drawFace('', '', i, false, false, true, false)).join('');
            if (!state.data) message = state.error || '正在載入餐廳清單';
            else if (!category) message = '請先新增或顯示一個分類';
            else if (!p.members.length) { message = '這個分類還沒有餐廳'; actions = button('新增餐廳', 'manage'); }
            else if (!p.active.length) { message = '這個分類目前沒有啟用的餐廳'; actions = button('管理餐廳', 'manage'); }
            else if (!p.eligible.length) { message = '這輪已經沒有可以抽的餐廳了'; actions = button('重新開始本輪', 'reset') + button('新增餐廳', 'manage'); }
            else { message = '準備好了嗎？'; actions = button('開始抽籤', 'start', 'primary'); }
        } else {
            const revealAll = ['result', 'complete'].includes(d.phase);
            stage = d.ids.map((id, index) => drawFace(id, d.names[index], index, revealAll || (d.phase === 'revealing' && (d.revealed || []).includes(index)), d.selected === index && d.selected != null, d.phase !== 'waiting', d.phase === 'shuffling')).join('');
            if (d.phase === 'shuffling') { message = '正在洗牌'; actions = button('跳過動畫', 'skip'); }
            if (d.phase === 'waiting') message = '選一張卡片，看看今天吃什麼';
            if (d.phase === 'revealing') { message = '正在揭曉'; actions = button('跳過動畫', 'skip'); }
            if (d.phase === 'result') {
                message = state.checking ? '正在記錄這次選擇' : !validSelection() || d.invalid ? '選中的餐廳已停用、刪除或不屬於此分類，請重新抽籤' : !state.connected ? '請連線後確認餐廳狀態' : `你選中了 <strong>${escape(d.names[d.selected])}</strong>`;
                actions = state.checking ? '' : validSelection() && !d.invalid ? button('不要，換一間', 'reject') + (state.connected ? button('就吃這間', 'accept', 'primary') : '') : button('重新抽籤', 'redraw', 'primary');
            }
            if (d.phase === 'complete') { message = `決定了，這次就吃 <strong>${escape(d.names[d.selected])}</strong>${d.confirmationId && state.data?.history?.[d.confirmationId] ? '<small class="meal-recorded">已記下這次選擇</small>' : ''}`; actions = button('開始新的一輪', 'reset', 'primary'); }
        }
        $('cardStage').dataset.count = String(d ? d.ids.length : 3);
        $('cardStage').classList.toggle('has-selection', Number.isInteger(d?.selected));
        const existing = [...$('cardStage').querySelectorAll('.draw-card')];
        if (!d || existing.length !== d.ids.length || existing.some((card, i) => card.dataset.item !== d.ids[i])) $('cardStage').innerHTML = stage;
        else existing.forEach((card, i) => {
            const revealed = ['result', 'complete'].includes(d.phase) || (d.phase === 'revealing' && (d.revealed || []).includes(i));
            const selected = d.selected === i;
            card.classList.toggle('revealed', revealed); card.classList.toggle('chosen', selected); card.classList.toggle('is-shuffling', d.phase === 'shuffling');
            card.disabled = d.phase !== 'waiting';
            card.setAttribute('aria-label', revealed ? `${selected ? '已選中' : '未選中'} ${d.names[i]}` : `選擇第 ${i + 1} 張卡片`);
            card.querySelector('.card-face-front').setAttribute('aria-hidden', String(!revealed));
            card.querySelector('.card-face-front small').textContent = categoryName(state.category);
        });
        if ($('drawMessage').innerHTML !== message) $('drawMessage').innerHTML = message;
        if ($('drawActions').innerHTML !== actions) $('drawActions').innerHTML = actions;
    }
    function renderExcluded() {
        const list = exclusions();
        $('excludedCount').textContent = String(list.length);
        $('resetRound').disabled = !state.category || (!list.length && !state.draw);
        $('excludedList').innerHTML = list.length ? list.map(item => `<div class="excluded-item"><span>${escape(state.data?.restaurants?.[item.id]?.name || item.name || '已移除的餐廳')}</span><button type="button" data-restore="${escape(item.id)}" aria-label="恢復 ${escape(item.name)}">恢復</button></div>`).join('') : '<p class="empty">目前沒有排除的餐廳</p>';
    }
    function renderDiscovery() {
        const result = D.discover(state.data, state.category, exclusions().map(item => item.id));
        const frequent = state.discovery === 'frequent';
        const items = frequent ? result.frequent : result.recommended;
        const blocked = !state.connected || state.busy || state.checking || ['shuffling', 'revealing'].includes(state.draw?.phase);
        $('showRecommended').setAttribute('aria-pressed', String(!frequent));
        $('showFrequent').setAttribute('aria-pressed', String(frequent));
        $('discoveryContext').textContent = state.data?.categories?.[state.category]?.name || '';
        $('discoveryCaption').textContent = frequent ? '近 90 天，兩人確認過的選擇' : result.history.length ? '參考近期選擇，讓每一餐多一點變化' : '先從清單裡找靈感，記錄後會更懂你的日常';
        let html = items.map((item, index) => `<button class="discovery-item${!frequent && index === 0 ? ' featured' : ''}" type="button" data-suggest-id="${escape(item.id)}" ${blocked || item.excluded ? 'disabled' : ''} aria-label="選擇${escape(item.name)}"><span class="discovery-mark" aria-hidden="true">${frequent ? String(index + 1).padStart(2, '0') : `<svg><use href="#i-plate"/></svg>`}</span><span class="discovery-copy"><strong>${escape(item.name)}</strong><small>${frequent ? `近 90 天選過 ${item.count} 次${item.excluded ? ' · 本輪已排除' : ''}` : escape(item.reason)}</small></span><svg class="discovery-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></button>`).join('');
        if (!items.length) {
            const eligible = currentPool().eligible.length;
            const text = !state.data ? '正在整理餐廳清單' : !eligible ? '這餐目前沒有可選的餐廳' : '還沒有常吃紀錄';
            const detail = !state.data ? '連線後會顯示可選餐廳' : !eligible ? '新增餐廳，或恢復本輪排除的選擇' : '按下「就吃這間」後，常吃的店會整理在這裡';
            html = `<div class="discovery-empty"><svg aria-hidden="true"><use href="#i-plate"/></svg><strong>${text}</strong><p>${detail}</p></div>`;
        }
        if ($('discoveryList').innerHTML !== html) $('discoveryList').innerHTML = html;
        const allHistory = D.history(state.data);
        $('mealHistoryCount').textContent = allHistory.length ? String(allHistory.length) : '';
        const date = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        const history = allHistory.slice(0, 30).map(entry => `<div class="meal-history-row"><span><strong>${escape(entry.restaurantName || '未命名餐廳')}</strong><small>${escape(date.format(entry.confirmedAt))} · ${escape(entry.categoryName || '餐別已移除')}</small></span><button class="icon-button" type="button" data-remove-meal="${escape(entry.id)}" aria-label="刪除${escape(entry.restaurantName)}的用餐紀錄" title="刪除用餐紀錄" ${blocked ? 'disabled' : ''}><svg aria-hidden="true"><use href="#i-trash"/></svg></button></div>`).join('') || '<p class="empty">還沒有用餐紀錄</p>';
        const historyHtml = (allHistory.length > 30 ? '<p class="history-note">顯示最近 30 筆</p>' : '') + history;
        if ($('mealHistoryList').innerHTML !== historyHtml) $('mealHistoryList').innerHTML = historyHtml;
    }
    function renderManagement() {
        const cats = C.categories(state.data);
        const previous = $('restaurantFilter').value || 'all';
        $('restaurantFilter').innerHTML = '<option value="all">全部分類</option><option value="uncategorized">未分類</option>' + cats.map(cat => `<option value="${escape(cat.id)}">${escape(cat.name)}${cat.hidden ? '（隱藏）' : ''}</option>`).join('');
        $('restaurantFilter').value = [...$('restaurantFilter').options].some(option => option.value === previous) ? previous : 'all';
        const search = C.cleanName($('restaurantSearch').value).toLocaleLowerCase();
        const filter = $('restaurantFilter').value;
        const rows = C.restaurants(state.data).filter(item => {
            const ids = Object.keys(item.categories || {}).filter(id => state.data?.categories?.[id]);
            return item.name.toLocaleLowerCase().includes(search) && (filter === 'all' || (filter === 'uncategorized' ? ids.length === 0 : ids.includes(filter)));
        }).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
        $('restaurantList').innerHTML = rows.length ? rows.map(item => {
            const labels = Object.keys(item.categories || {}).filter(id => state.data?.categories?.[id]).map(categoryName);
            return `<article class="manage-row"><div class="manage-row-heading"><div><div class="manage-name">${escape(item.name)}</div><p class="manage-meta">${escape(labels.join('、') || '未分類')} · ${item.enabled === false ? '已停用' : '啟用中'}</p></div></div><div class="row-actions"><button type="button" data-action="edit-restaurant" data-id="${escape(item.id)}">編輯</button><button type="button" data-action="toggle-restaurant" data-id="${escape(item.id)}">${item.enabled === false ? '重新啟用' : '停用'}</button><button type="button" data-action="delete-restaurant" data-id="${escape(item.id)}">刪除</button></div></article>`;
        }).join('') : '<p class="empty">沒有符合條件的餐廳</p>';
        $('categoryManagementList').innerHTML = cats.length ? cats.map((cat, index) => `<article class="manage-row"><div class="manage-row-heading"><div><div class="manage-name">${escape(cat.name)}</div><p class="manage-meta">${cat.hidden ? '已隱藏' : '顯示中'} · ${C.pool(state.data, cat.id).members.length} 間餐廳</p></div></div><div class="row-actions"><button type="button" data-action="move-up" data-id="${escape(cat.id)}" aria-label="${escape(cat.name)}上移" ${index === 0 ? 'disabled' : ''}><svg><use href="#i-up"></use></svg></button><button type="button" data-action="move-down" data-id="${escape(cat.id)}" aria-label="${escape(cat.name)}下移" ${index === cats.length - 1 ? 'disabled' : ''}><svg><use href="#i-down"></use></svg></button><button type="button" data-action="edit-category" data-id="${escape(cat.id)}">改名</button><button type="button" data-action="toggle-category" data-id="${escape(cat.id)}">${cat.hidden ? '顯示' : '隱藏'}</button><button type="button" data-action="delete-category" data-id="${escape(cat.id)}">刪除</button></div></article>`).join('') : '<p class="empty">還沒有分類，請新增一個分類</p>';
    }
    function render() { renderCategories(); renderDraw(); renderExcluded(); renderDiscovery(); if (!$('manageOverlay').hidden) renderManagement(); }
    function updateConnection() {
        const el = $('connection');
        el.className = `connection ${state.connected && !state.error ? 'online' : 'offline'}`;
        el.textContent = state.error || (state.connected ? (state.busy ? '正在同步資料' : '已連線 · 兩人共用清單') : '離線 · 無法儲存變更');
        renderDraw();
        renderDiscovery();
    }
    function selectCategory(id) {
        if (id === state.category) return;
        clearTimers(); state.category = id; state.draw = null; persist(); render();
    }
    function beginDraw() {
        const p = currentPool();
        if (!state.data?.categories?.[state.category] || !p.eligible.length) { state.draw = null; persist(); render(); return; }
        const ids = C.draw(p.eligible);
        state.draw = { category: state.category, ids, names: ids.map(id => state.data.restaurants[id].name), phase: reduced.matches ? 'waiting' : 'shuffling', selected: null, revealed: [] };
        persist(); render();
        if (state.draw.phase === 'shuffling') later(() => { if (state.draw?.phase === 'shuffling') { state.draw.phase = 'waiting'; persist(); render(); } }, motion.shuffle);
    }
    function choose(index) {
        const d = state.draw;
        if (!d || d.phase !== 'waiting' || index < 0 || index >= d.ids.length) return;
        d.selected = index; d.phase = reduced.matches ? 'result' : 'revealing'; d.revealed = reduced.matches ? d.ids.map((_, i) => i) : []; persist(); render();
        if (!reduced.matches) {
            const remaining = d.ids.map((_, i) => i).filter(i => i !== index);
            later(() => { if (state.draw === d && d.phase === 'revealing') { d.revealed.push(index); persist(); render(); } }, motion.anticipation);
            const othersStart = motion.anticipation + motion.flip + motion.revealPause;
            remaining.forEach((i, offset) => later(() => { if (state.draw === d && d.phase === 'revealing') { d.revealed.push(i); persist(); render(); } }, othersStart + offset * motion.revealGap));
            const duration = remaining.length ? othersStart + (remaining.length - 1) * motion.revealGap + motion.flip : motion.anticipation + motion.flip;
            later(() => { if (state.draw === d && d.phase === 'revealing') { d.phase = 'result'; persist(); render(); } }, duration);
        }
    }
    function skipAnimation() {
        clearTimers(); const d = state.draw; if (!d) return;
        if (d.phase === 'shuffling') d.phase = 'waiting';
        else if (d.phase === 'revealing') { d.phase = 'result'; d.revealed = d.ids.map((_, i) => i); }
        persist(); render();
    }
    const handleMotionPreference = event => { if (event.matches && ['shuffling', 'revealing'].includes(state.draw?.phase)) skipAnimation(); };
    reduced.addEventListener('change', handleMotionPreference);
    function resetRound() { clearTimers(); if (state.category) delete state.exclusions[state.category]; state.draw = null; persist(); render(); }
    async function drawAction(action) {
        if (state.checking || state.busy) return;
        if (action === 'start' || action === 'redraw') beginDraw();
        else if (action === 'skip') skipAnimation();
        else if (action === 'reset') resetRound();
        else if (action === 'manage') openManagement('restaurant');
        else if (action === 'accept' && state.draw?.phase === 'result') {
            if (!state.connected || !validSelection()) { render(); notify('請連線並確認餐廳仍可使用'); return; }
            const draw = state.draw;
            draw.confirmationId ||= rootRef.child('history').push().key;
            draw.confirmedAt ||= Date.now();
            persist();
            state.checking = true; renderDraw(); renderDiscovery();
            try {
                const saved = await writeAction({ type: 'meal-confirm', id: draw.confirmationId, restaurantId: draw.ids[draw.selected], categoryId: draw.category, now: draw.confirmedAt });
                if (saved && state.draw === draw) { draw.phase = 'complete'; persist(); }
            } catch (_) { notify('無法記錄這次選擇，請檢查連線後重試'); }
            finally { state.checking = false; render(); }
        } else if (action === 'reject' && state.draw?.phase === 'result') {
            const d = state.draw; const list = exclusions().slice();
            if (!list.some(item => item.id === d.ids[d.selected])) list.push({ id: d.ids[d.selected], name: d.names[d.selected] });
            state.exclusions[state.category] = list; state.draw = null; persist(); beginDraw();
        }
    }
    function openManagement(tab) {
        $('restaurantsTab').setAttribute('aria-selected', String(tab === 'restaurant'));
        $('categoriesTab').setAttribute('aria-selected', String(tab === 'category'));
        $('restaurantManagement').hidden = tab !== 'restaurant'; $('categoryManagement').hidden = tab !== 'category';
        $('manageTitle').textContent = tab === 'restaurant' ? '管理餐廳' : '管理分類';
        showOverlay('manageOverlay'); renderManagement();
    }
    function openEditor(kind, id) {
        const item = kind === 'category' ? state.data?.categories?.[id] : state.data?.restaurants?.[id];
        if (id && !item) { notify('資料已被移除'); return; }
        state.editor = { kind, id: id || null };
        $('editorTitle').textContent = `${id ? (kind === 'category' ? '修改' : '編輯') : '新增'}${kind === 'category' ? '分類' : '餐廳'}`;
        $('editorNameLabel').textContent = kind === 'category' ? '分類名稱' : '餐廳名稱';
        $('editorName').maxLength = kind === 'category' ? 20 : 40; $('editorName').value = item?.name || '';
        $('editorCategories').hidden = kind !== 'restaurant';
        $('editorCategoryList').innerHTML = C.categories(state.data).map(cat => `<label><input type="checkbox" value="${escape(cat.id)}" ${item?.categories?.[cat.id] || (!id && cat.id === state.category) ? 'checked' : ''}>${escape(cat.name)}${cat.hidden ? '（隱藏）' : ''}</label>`).join('') || '<p class="empty">請先新增分類</p>';
        $('editorError').textContent = ''; showOverlay('editorOverlay', 'editorName');
    }
    function confirmAction(title, message, action, label = '確認刪除', danger = true) { state.confirm = action; $('confirmTitle').textContent = title; $('confirmMessage').textContent = message; $('acceptConfirm').textContent = label; $('acceptConfirm').className = danger ? 'danger' : 'primary'; showOverlay('confirmOverlay', 'cancelConfirm'); }
    async function writeAction(action) {
        if (!state.connected || !rootRef) { notify('目前離線，無法儲存；輸入內容仍保留'); return false; }
        if (state.busy) return false;
        state.busy = true; updateConnection(); $('saveEditor').disabled = true;
        let reason = '';
        const warn = setTimeout(() => notify('仍在等待同步，請保持頁面開啟'), 6000);
        try {
            const result = await rootRef.transaction(current => {
                if (!current) { reason = '共用資料尚未載入或已被移除，請重新整理'; return undefined; }
                const next = C.mutate(current, action); reason = next.error || '';
                return next.error ? undefined : next.data;
            }, undefined, false);
            if (!result.committed) { const message = reason || '資料已變更，請重試'; if (!$('editorOverlay').hidden) $('editorError').textContent = message; else notify(message); return false; }
            notify(action.type === 'meal-confirm' ? '已記下這次用餐選擇' : action.type === 'meal-delete' ? '已刪除用餐紀錄' : '已儲存並同步'); return true;
        } catch (_) { if (!$('editorOverlay').hidden) $('editorError').textContent = '儲存失敗，請檢查連線後重試'; else notify('儲存失敗，請檢查連線後重試'); return false; }
        finally { clearTimeout(warn); state.busy = false; $('saveEditor').disabled = false; updateConnection(); }
    }
    function managementAction(action, id) {
        const cat = state.data?.categories?.[id], item = state.data?.restaurants?.[id];
        if (action === 'edit-category') openEditor('category', id);
        else if (action === 'edit-restaurant') openEditor('restaurant', id);
        else if (action === 'toggle-category' && cat) writeAction({ type: 'category-visibility', id, hidden: !cat.hidden });
        else if ((action === 'move-up' || action === 'move-down') && cat) writeAction({ type: 'category-move', id, direction: action === 'move-up' ? -1 : 1 });
        else if (action === 'toggle-restaurant' && item) writeAction({ type: 'restaurant-enabled', id, enabled: item.enabled === false, now: Date.now() });
        else if (action === 'delete-category' && cat) confirmAction('刪除分類', `確定刪除「${cat.name}」？餐廳不會被刪除，沒有其他分類的餐廳將保留為未分類。`, () => writeAction({ type: 'category-delete', id }));
        else if (action === 'delete-restaurant' && item) confirmAction('刪除餐廳', `確定刪除「${item.name}」？此操作會同步給另一位使用者。`, () => writeAction({ type: 'restaurant-delete', id }));
    }
    $('categoryList').addEventListener('click', event => { const el = event.target.closest('[data-category]'); if (el) selectCategory(el.dataset.category); });
    $('cardStage').addEventListener('click', event => { const el = event.target.closest('[data-card]'); if (el) choose(Number(el.dataset.card)); });
    $('drawActions').addEventListener('click', event => { const el = event.target.closest('[data-draw-action]'); if (el) drawAction(el.dataset.drawAction); });
    $('showRecommended').addEventListener('click', () => { state.discovery = 'recommended'; persist(); renderDiscovery(); });
    $('showFrequent').addEventListener('click', () => { state.discovery = 'frequent'; persist(); renderDiscovery(); });
    $('discoveryList').addEventListener('click', event => {
        const target = event.target.closest('[data-suggest-id]');
        if (!target || target.disabled || state.busy || state.checking) return;
        const id = target.dataset.suggestId;
        const category = state.category;
        const item = currentPool().eligible.find(restaurant => restaurant.id === id);
        if (!item) return;
        confirmAction('這餐就吃這間？', `${item.name} · ${categoryName(category)}`, async () => {
            if (category !== state.category || !currentPool().eligible.some(restaurant => restaurant.id === id)) { notify('餐廳或分類已變更，請重新選擇'); return; }
            clearTimers();
            state.draw = { category, ids: [id], names: [item.name], phase: 'result', selected: 0, revealed: [0] };
            persist(); render();
            await drawAction('accept');
        }, '就吃這間', false);
    });
    $('mealHistoryList').addEventListener('click', event => {
        const target = event.target.closest('[data-remove-meal]');
        if (!target || target.disabled) return;
        const id = target.dataset.removeMeal;
        const entry = state.data?.history?.[id];
        if (entry) confirmAction('刪除這筆用餐紀錄？', `「${entry.restaurantName}」將不再計入常吃與推薦，餐廳仍保留在清單中。`, () => writeAction({ type: 'meal-delete', id }));
    });
    $('resetRound').addEventListener('click', resetRound);
    $('excludedList').addEventListener('click', event => { const el = event.target.closest('[data-restore]'); if (!el) return; state.exclusions[state.category] = exclusions().filter(item => item.id !== el.dataset.restore); persist(); render(); });
    $('openManage').addEventListener('click', () => openManagement('restaurant'));
    $('manageCategories').addEventListener('click', () => openManagement('category'));
    $('restaurantsTab').addEventListener('click', () => openManagement('restaurant'));
    $('categoriesTab').addEventListener('click', () => openManagement('category'));
    $('addRestaurant').addEventListener('click', () => openEditor('restaurant'));
    $('addCategory').addEventListener('click', () => openEditor('category'));
    $('restaurantSearch').addEventListener('input', renderManagement); $('restaurantFilter').addEventListener('change', renderManagement);
    $('manageOverlay').addEventListener('click', event => { const el = event.target.closest('[data-action]'); if (el) managementAction(el.dataset.action, el.dataset.id); });
    document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => { if (!state.busy) closeOverlay(el.dataset.close === 'editor' ? 'editorOverlay' : 'manageOverlay'); }));
    $('editorForm').addEventListener('submit', async event => {
        event.preventDefault(); if (!state.editor || !rootRef) { $('editorError').textContent = '尚未連線，無法儲存'; return; }
        const { kind, id } = state.editor; const newId = id || rootRef.child(kind === 'category' ? 'categories' : 'restaurants').push().key;
        const action = { type: `${kind}-save`, id: newId, edit: Boolean(id), name: $('editorName').value, now: Date.now(), categories: [...$('editorCategoryList').querySelectorAll('input:checked')].map(input => input.value) };
        if (await writeAction(action)) closeOverlay('editorOverlay');
    });
    $('cancelConfirm').addEventListener('click', () => closeOverlay('confirmOverlay'));
    $('acceptConfirm').addEventListener('click', async () => { if (!state.confirm) return; const action = state.confirm; state.confirm = null; closeOverlay('confirmOverlay'); await action(); });
    document.addEventListener('keydown', event => {
        const top = ['confirmOverlay', 'editorOverlay', 'manageOverlay'].map($).find(el => !el.hidden);
        if (!top) return;
        if (event.key === 'Escape') { if (!state.busy) closeOverlay(top.id); return; }
        if (event.key !== 'Tab') return;
        const focusable = [...top.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [href]')].filter(el => el.getClientRects().length);
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('pagehide', event => { if (event.persisted) skipAnimation(); else { clearTimers(); reduced.removeEventListener('change', handleMotionPreference); if (rootRef) rootRef.off(); if (connectionRef) connectionRef.off(); } clearTimeout(toastTimer); });
    try {
        firebase.initializeApp({ apiKey: 'AIzaSyB567-hOy8kSYC3KNTomBty0oZmFRHN8ng', authDomain: 'accounting-system-53ed3.firebaseapp.com', databaseURL: 'https://accounting-system-53ed3-default-rtdb.firebaseio.com', projectId: 'accounting-system-53ed3', storageBucket: 'accounting-system-53ed3.firebasestorage.app', messagingSenderId: '76627672581', appId: '1:76627672581:web:5e1ead01e77cade980e66c' });
        db = firebase.database(); rootRef = db.ref('foodPicker'); connectionRef = db.ref('.info/connected');
        const ensureInitialized = () => {
            if (!state.connected || !state.missing || state.initializing) return;
            state.initializing = true;
            rootRef.transaction(current => current === null ? C.initialData() : undefined, undefined, false).catch(() => { state.error = '無法初始化餐廳資料'; updateConnection(); }).finally(() => { state.initializing = false; });
        };
        connectionRef.on('value', snap => { state.connected = Boolean(snap.val()); updateConnection(); ensureInitialized(); });
        rootRef.on('value', snap => {
            const data = snap.val();
            state.missing = !data;
            if (!data) { ensureInitialized(); return; }
            state.data = data; state.error = '';
            const pending = state.draw;
            const confirmed = pending?.confirmationId && data.history?.[pending.confirmationId];
            if (confirmed && confirmed.restaurantId === pending.ids[pending.selected] && confirmed.categoryId === pending.category) pending.phase = 'complete';
            const visible = C.categories(data).filter(cat => !cat.hidden);
            if (!data.categories?.[state.category] || data.categories[state.category].hidden) {
                if (state.category && state.draw) notify('目前分類已被刪除或隱藏，請選擇其他分類');
                clearTimers(); state.category = visible[0]?.id || ''; state.draw = null;
            }
            persist(); render(); updateConnection();
        }, () => { state.error = '無法載入餐廳資料，請檢查連線'; updateConnection(); render(); });
    } catch (_) { state.error = '無法連接資料庫，請檢查網路後重新整理'; updateConnection(); }
    render();
})();
