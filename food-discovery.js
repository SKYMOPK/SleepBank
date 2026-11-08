/* Recommendations use confirmed choices only; the card draw remains uniform. */
(function (root) {
    'use strict';
    const DAY = 86400000;
    const localDay = time => Math.floor((time + 8 * 3600000) / DAY);
    function lastChoiceLabel(daysAgo) {
        return daysAgo === null ? '尚未選過' : daysAgo === 0 ? '今天選過' : daysAgo === 1 ? '昨天選過' : `${daysAgo} 天前選過`;
    }
    function choiceAvailability(data, restaurantId, categoryId, excluded = []) {
        const item = data?.restaurants?.[restaurantId];
        const category = data?.categories?.[categoryId];
        if (!item) return { available: false, reason: '餐廳已移除' };
        if (item.enabled === false) return { available: false, reason: '餐廳已停用' };
        if (!category || category.hidden) return { available: false, reason: '分類已移除或隱藏' };
        if (!item.categories?.[categoryId]) return { available: false, reason: '已不屬於此分類' };
        if (excluded.includes(restaurantId)) return { available: false, reason: '本輪已排除' };
        return { available: true, reason: '' };
    }
    function history(data, now = Date.now()) {
        return Object.entries(data?.history || {}).filter(([, entry]) => entry && typeof entry.restaurantId === 'string' && typeof entry.categoryId === 'string' && Number.isFinite(entry.confirmedAt) && entry.confirmedAt > 0 && entry.confirmedAt <= now)
            .map(([id, entry]) => ({ ...entry, id })).sort((a, b) => b.confirmedAt - a.confirmedAt || a.id.localeCompare(b.id));
    }
    function dailyTie(seed) {
        let value = 2166136261;
        for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
        return (value >>> 0) / 4294967296;
    }
    function historyGroups(data, now = Date.now(), limit = 30) {
        const groups = [];
        const today = localDay(now);
        const format = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric' });
        for (const entry of history(data, now).slice(0, limit)) {
            const day = localDay(entry.confirmedAt);
            if (groups.at(-1)?.day !== day) groups.push({ day, label: day === today ? '今天' : day === today - 1 ? '昨天' : format.format(entry.confirmedAt), entries: [] });
            groups.at(-1).entries.push(entry);
        }
        return groups;
    }
    function discover(data, categoryId, excluded = [], now = Date.now()) {
        const all = history(data, now);
        const categoryHistory = all.filter(entry => entry.categoryId === categoryId);
        if (!data?.categories?.[categoryId] || data.categories[categoryId].hidden) return { recommended: [], frequent: [], history: categoryHistory };
        const available = root.FoodCore.pool(data, categoryId).active;
        const today = localDay(now);
        const recent = all.filter(entry => now - entry.confirmedAt < 90 * DAY);
        const recentWeek = all.filter(entry => now - entry.confirmedAt < 7 * DAY);
        const ranked = available.map(item => {
            const meals = all.filter(entry => entry.restaurantId === item.id);
            const visits = recent.filter(entry => entry.restaurantId === item.id);
            const count = visits.filter(entry => entry.categoryId === categoryId).length;
            const lastAt = meals[0]?.confirmedAt || null;
            const daysAgo = lastAt ? Math.max(0, today - localDay(lastAt)) : null;
            const lastWeek = recentWeek.filter(entry => entry.restaurantId === item.id).length;
            const consecutivePenalty = recentWeek.slice(0, 3).reduce((penalty, meal, index) => penalty + (meal.restaurantId === item.id ? [13, 9, 5][index] : 0), 0);
            // Waiting longer than three weeks adds no advantage over other dormant choices.
            const freshness = 45 * (1 - Math.exp(-Math.min(daysAgo ?? 14, 21) / 7));
            const variety = 20 / Math.sqrt(1 + visits.length);
            const familiarity = 16 * Math.min(1, Math.log1p(count) / Math.log(7));
            const familiarReturn = daysAgo >= 7 && count >= 3 ? 8 : 0;
            const score = freshness + variety + familiarity + familiarReturn - lastWeek * 5 - consecutivePenalty - (daysAgo === 0 ? 50 : 0) + dailyTie(`${today}:${categoryId}:${item.id}`) * 6;
            const reasonCode = daysAgo === null ? 'explore' : daysAgo === 0 ? 'today' : daysAgo < 3 && lastWeek >= 2 ? 'repeat' : daysAgo >= 7 && count >= 3 ? 'familiar' : daysAgo >= 7 ? 'return' : 'recent';
            const reason = ({ explore: '還沒有選過，今天換個口味', today: '今天剛選過，也可以再選', repeat: '最近常選這間，也看看其他選擇', familiar: `你常選的店，已經 ${daysAgo} 天沒選`, return: `${daysAgo} 天沒選了`, recent: lastChoiceLabel(daysAgo) })[reasonCode];
            return { ...item, excluded: excluded.includes(item.id), count, lastAt, daysAgo, score, reason, reasonCode };
        });
        const recommended = ranked.filter(item => !item.excluded).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
        const frequent = ranked.filter(item => item.count > 0).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt || a.id.localeCompare(b.id)).slice(0, 5);
        return { recommended, frequent, history: categoryHistory };
    }
    root.FoodDiscovery = { history, historyGroups, lastChoiceLabel, choiceAvailability, discover };
})(globalThis);
