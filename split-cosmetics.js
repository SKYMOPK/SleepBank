(function (root) {
    const families = {
        cat: { name: '貓咪萌系', accent: '#f5a6c9', bg: '#302338', desc: '柔和粉紫與貓咪的慶祝', shape: '<path d="M28 43 26 22 43 32Q60 23 77 32L94 22 92 43Q104 78 60 83 16 78 28 43Z" fill="currentColor"/><path d="M42 51v6m36-6v6m-24 8q6 7 12 0" fill="none" stroke="#302338" stroke-width="4" stroke-linecap="round"/><path d="M21 63H8m15 8H11m88-8h13m-15 8h12" stroke="currentColor" stroke-width="2"/>' },
        star: { name: '深夜星空', accent: '#a7d8f5', bg: '#172b3a', desc: '深夜星軌與流星拖尾', shape: '<path d="m66 20 7 23 24 7-24 8-7 24-8-24-24-8 24-7Z" fill="currentColor"/><path d="M12 91 45 65M8 73l23-15M39 98l16-23" stroke="currentColor" stroke-width="2"/><circle cx="100" cy="18" r="3" fill="currentColor"/>' },
        thunder: { name: '雷霆', accent: '#c4b6ff', bg: '#282635', desc: '暴風雲層與銳利電弧', shape: '<path d="M28 41a18 18 0 0 1 24-22 21 21 0 0 1 36 19q26 6 12 26H25Q9 53 28 41" fill="currentColor" opacity=".35"/><path d="m64 34-21 36h17l-8 31 30-45H64l10-22Z" fill="currentColor"/>' },
        matcha: { name: '抹茶靜心', accent: '#a5d7ad', bg: '#1e342d', desc: '墨綠葉片與水墨漣漪', shape: '<ellipse cx="60" cy="83" rx="43" ry="12" fill="none" stroke="currentColor" opacity=".5"/><path d="M31 62Q20 19 87 22 96 67 48 67Z" fill="currentColor"/><path d="m34 79 45-47M48 62l-2-17m14 7h16" fill="none" stroke="#1e342d" stroke-width="3"/>' },
        chess: { name: '王棋對弈', accent: '#e7d6a0', bg: '#292c31', desc: '黑檀棋格與王棋落子', shape: '<path d="M60 14v20m-10-10h20M38 43h44l-8 14H46Zm9 16h26l-4 26H51ZM33 88h54v12H33Z" fill="currentColor"/><path d="M12 108h96M22 105V82m76 23V82" stroke="currentColor" opacity=".4"/>' },
        rain: { name: '霧雨玻璃', accent: '#a9cbd1', bg: '#27373b', desc: '冷灰玻璃與細雨水波', shape: '<path d="M60 19Q91 60 84 74a26 26 0 0 1-48 0Q29 60 60 19Z" fill="currentColor" opacity=".7"/><path d="m26 17-7 16m82-4-7 16M14 58l-6 16M107 66l-5 12" stroke="currentColor" stroke-width="2"/><ellipse cx="60" cy="99" rx="37" ry="9" fill="none" stroke="currentColor" opacity=".6"/>' },
    };
    const catalog = {};
    for (const [family, item] of Object.entries(families)) {
        for (const type of ['color', 'effect']) {
            const id = `${family}_${type}`;
            catalog[id] = { ...item, id, family, type, limited: ['cat', 'thunder', 'chess'].includes(family), name: `${item.name} · ${type === 'color' ? '背景' : '新增特效'}` };
        }
    }
    catalog.homecoming_effect = { id: 'homecoming_effect', family: 'homecoming', type: 'effect', name: '回到宿舍', limited: true, accent: '#d7b68d', bg: '#211b15', desc: '推開木門，回到熟悉的暖光裡' };
    catalog.dorm_color = { id: 'dorm_color', family: 'dorm', type: 'color', name: '第一季 · 宿舍夜燈', limited: true, accent: '#d3b788', bg: '#171411', desc: '夜燈亮著，日常留在這裡' };
    for (const id of ['thunder_color', 'thunder_effect']) {
        Object.assign(catalog[id], { quality: 'special', accent: '#b9c8db', bg: '#151a24', desc: '厚雲壓境，悶雷從遠方滾過' });
    }
    for (const id of ['chess_color', 'chess_effect']) {
        Object.assign(catalog[id], { quality: 'special', accent: '#d6bc8b', bg: '#1b1612', desc: '深色棋桌前，關鍵一步安靜落下' });
    }
    function art(id) {
        const item = catalog[id];
        if (!item) return '';
        if (id === 'thunder_color' || id === 'thunder_effect') return '<img class="storm-art" src="assets/storm/preview.jpg?v=storm-1" alt="深灰藍的厚重雷暴雲層" loading="lazy">';
        if (id === 'chess_color' || id === 'chess_effect') return '<img class="chess-art" src="assets/chess/preview.jpg?v=chess-1" alt="暖光下的深木棋桌與立體王棋" loading="lazy">';
        if (id === 'dorm_color' || id === 'homecoming_effect') return `<img class="homecoming-art" src="assets/homecoming/${id === 'dorm_color' ? 'dorm-preview' : 'preview'}.jpg" alt="暖光中的雙人宿舍" loading="lazy">`;
        if (item.type === 'badge') return `<svg class="le-badge-art" viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="${id}-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff2c7"/><stop offset=".35" stop-color="#c4a877"/><stop offset=".6" stop-color="#faf0cf"/><stop offset="1" stop-color="#997346"/></linearGradient></defs><g stroke="url(#${id}-metal)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${item.shape}</g></svg>`;
        return `<svg viewBox="0 0 120 120" aria-hidden="true" style="color:${item.accent}">${item.shape}</svg>`;
    }
    function backdrop(id) {
        const item = catalog[id];
        if (!item) return 'none';
        if (item.family === 'chess') return 'none';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280"><g transform="translate(85 85)" color="${item.accent}" opacity=".055">${item.shape}</g></svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    }
    root.SplitCosmetics = { catalog, art, backdrop };
})(globalThis);
