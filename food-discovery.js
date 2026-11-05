/* Recommendations use confirmed choices only; the card draw remains uniform. */
(function (root) {
    'use strict';
    const DAY = 86400000;
    const localDay = time => Math.floor((time + 8 * 3600000) / DAY);
    function history(data, now = Date.now()) {
        return Object.entries(data?.history || {}).filter(([, entry]) => entry && typeof entry.restaurantId === 'string' && typeof entry.categoryId === 'string' && Number.isFinite(entry.confirmedAt) && entry.confirmedAt > 0 && entry.confirmedAt <= now)
            .map(([id, entry]) => ({ ...entry, id })).sort((a, b) => b.confirmedAt - a.confirmedAt || a.id.localeCompare(b.id));
    }
    function dailyTie(seed) {
        let value = 2166136261;
        for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
        return (value >>> 0) / 4294967296;
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
            const freshness = 45 * (1 - Math.exp(-(daysAgo ?? 14) / 7));
            const variety = 20 / Math.sqrt(1 + visits.length);
            const familiarity = 12 * Math.min(1, Math.log1p(count) / Math.log(7));
            const score = freshness + variety + familiarity - lastWeek * 5 - consecutivePenalty - (daysAgo === 0 ? 50 : 0) + dailyTie(`${today}:${categoryId}:${item.id}`) * 6;
            const reason = daysAgo === null ? '還沒留下用餐紀錄' : daysAgo >= 7 ? `${daysAgo} 天沒選了` : daysAgo === 0 ? '今天選過，仍可再選' : daysAgo === 1 ? '上次是昨天' : `${daysAgo} 天前選過`;
            return { ...item, excluded: excluded.includes(item.id), count, lastAt, daysAgo, score, reason };
        });
        const recommended = ranked.filter(item => !item.excluded).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
        const frequent = ranked.filter(item => item.count > 0).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt || a.id.localeCompare(b.id)).slice(0, 5);
        return { recommended, frequent, history: categoryHistory };
    }
    root.FoodDiscovery = { history, discover };
})(globalThis);
