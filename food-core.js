/* Pure data and draw rules for the shared restaurant picker. */
(function (root) {
    'use strict';
    const initialNames = ['早餐', '午餐', '晚餐', '宵夜'];
    const cleanName = value => String(value || '').trim().replace(/\s+/g, ' ');
    const nameKey = value => cleanName(value).normalize('NFKC').toLocaleLowerCase();
    const categories = data => Object.entries(data?.categories || {})
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
    const restaurants = data => Object.entries(data?.restaurants || {}).map(([id, value]) => ({ id, ...value }));
    function initialData() {
        return { initialized: true, categories: Object.fromEntries(initialNames.map((name, order) => [`default_${order}`, { name, order, hidden: false }])), restaurants: {} };
    }
    function mutate(current, action) {
        const data = current ? JSON.parse(JSON.stringify(current)) : initialData();
        data.categories ||= {};
        data.restaurants ||= {};
        const cat = data.categories[action.id];
        const restaurant = data.restaurants[action.id];
        const fail = error => ({ error });
        if (action.type === 'category-save') {
            const name = cleanName(action.name);
            if (!name || name.length > 20) return fail('分類名稱需為 1 至 20 個字');
            if (categories(data).some(item => item.id !== action.id && nameKey(item.name) === nameKey(name))) return fail('已有相同名稱的分類');
            if (action.edit && !cat) return fail('此分類已被刪除，請重新整理');
            data.categories[action.id] = cat ? { ...cat, name } : { name, hidden: false, order: Math.max(-1, ...categories(data).map(item => Number(item.order) || 0)) + 1 };
        } else if (action.type === 'category-delete') {
            if (!cat) return fail('此分類已不存在');
            delete data.categories[action.id];
            for (const item of Object.values(data.restaurants)) if (item.categories) delete item.categories[action.id];
        } else if (action.type === 'category-visibility') {
            if (!cat) return fail('此分類已不存在');
            cat.hidden = Boolean(action.hidden);
        } else if (action.type === 'category-move') {
            const ordered = categories(data);
            const index = ordered.findIndex(item => item.id === action.id);
            const target = index + action.direction;
            if (index < 0 || target < 0 || target >= ordered.length) return fail('分類順序已變更');
            [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
            ordered.forEach((item, order) => { data.categories[item.id].order = order; });
        } else if (action.type === 'restaurant-save') {
            const name = cleanName(action.name);
            if (!name || name.length > 40) return fail('餐廳名稱需為 1 至 40 個字');
            if (restaurants(data).some(item => item.id !== action.id && nameKey(item.name) === nameKey(name))) return fail('已有相同名稱的餐廳');
            if (action.edit && !restaurant) return fail('此餐廳已被刪除');
            const ids = [...new Set(action.categories || [])];
            if (!ids.length && !action.edit) return fail('請至少選擇一個分類');
            if (ids.some(id => !data.categories[id])) return fail('有分類已被刪除，請重新選擇');
            data.restaurants[action.id] = { name, categories: Object.fromEntries(ids.map(id => [id, true])), enabled: restaurant ? restaurant.enabled !== false : true, createdAt: restaurant?.createdAt || action.now, updatedAt: action.now };
        } else if (action.type === 'restaurant-enabled') {
            if (!restaurant) return fail('此餐廳已不存在');
            restaurant.enabled = Boolean(action.enabled); restaurant.updatedAt = action.now;
        } else if (action.type === 'restaurant-delete') {
            if (!restaurant) return fail('此餐廳已不存在');
            delete data.restaurants[action.id];
        } else return fail('未知操作');
        return { data };
    }
    function pool(data, categoryId, excluded = []) {
        const members = restaurants(data).filter(item => item.categories?.[categoryId]);
        const active = members.filter(item => item.enabled !== false);
        return { members, active, eligible: active.filter(item => !excluded.includes(item.id)) };
    }
    function draw(items, random = Math.random) {
        const copy = items.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, 3).map(item => item.id);
    }
    root.FoodCore = { initialData, categories, restaurants, cleanName, mutate, pool, draw };
})(globalThis);
