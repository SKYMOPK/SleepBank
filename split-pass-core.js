(function (root) {
    const DAY = 86400000;
    const MAX_XP = 1560;
    function dayKey(time) {
        return new Date(Number(time) + 4 * 3600000).toISOString().slice(0, 10);
    }
    function baseXp(total) {
        if (!Number.isFinite(total) || total <= 0) return 0;
        const thresholds = [50, 100, 200, 300, 500, 700];
        return 20 + thresholds.filter(value => total >= value).length * 5;
    }
    function seasonEnd(season) { return Number(season.startAt) + 45 * DAY; }
    function seasonAt(seasons, time) {
        return seasons.find(s => s.enabled && Number.isFinite(s.startAt) && time >= s.startAt && time < seasonEnd(s)) || null;
    }
    function level(xp) { return Math.min(40, 1 + Math.floor(Math.max(0, xp || 0) / 40)); }
    function validate(seasons, catalog) {
        const errors = [];
        const ids = new Set();
        const enabled = [];
        for (const s of seasons) {
            if (!/^[a-zA-Z0-9_-]+$/.test(s.id) || ids.has(s.id)) errors.push('賽季 ID 無效或重複');
            ids.add(s.id);
            if (s.startAt !== null && (!Number.isFinite(s.startAt) || (s.startAt + 8 * 3600000) % DAY !== 4 * 3600000)) errors.push('開始時間必須為台灣時間 04:00');
            if (s.enabled && s.startAt === null) errors.push('啟用賽季缺少開始時間');
            const rewards = new Set();
            for (const [lv, id] of Object.entries(s.rewards || {})) {
                if (!/^\d+$/.test(lv) || Number(lv) < 1 || Number(lv) > 40 || !catalog[id]) errors.push('獎勵等級或外觀 ID 無效');
                if (rewards.has(id)) errors.push('同季外觀獎勵重複');
                rewards.add(id);
            }
            if (s.enabled && !rewards.size) errors.push('啟用賽季必須先確認獎勵');
            if (s.enabled) enabled.push(s);
        }
        enabled.sort((a, b) => a.startAt - b.startAt);
        for (let i = 1; i < enabled.length; i++) if (enabled[i].startAt < seasonEnd(enabled[i - 1])) errors.push('啟用賽季不可重疊');
        return errors;
    }
    function normalize(data) {
        const state = data ? JSON.parse(JSON.stringify(data)) : {};
        state.seasons ||= {};
        state.collection ||= {};
        return state;
    }
    function seasonState(state, id) {
        state.seasons[id] ||= { xp: 0, peakLevel: 1, days: {}, entries: {}, claimed: {} };
        const s = state.seasons[id];
        s.days ||= {}; s.entries ||= {}; s.claimed ||= {};
        s.xp ||= 0; s.peakLevel ||= level(s.xp);
        return s;
    }
    function register(data, season, key, total, savedAt) {
        const state = normalize(data);
        if (!season) return state;
        const s = seasonState(state, season.id);
        if (!s.entries[key]) s.entries[key] = { total, savedAt, day: dayKey(savedAt), dueAt: savedAt + 6000, amount: 0, status: 'pending' };
        return state;
    }
    function finalizeRegistration(data, seasons, key, total, savedAt) {
        const state = normalize(data);
        for (const s of Object.values(state.seasons)) {
            const entry = s.entries?.[key];
            if (entry?.status === 'pending' && Number(entry.amount || 0) === 0) delete s.entries[key];
        }
        const season = seasonAt(seasons, savedAt);
        if (!season) return state;
        const s = seasonState(state, season.id);
        const current = s.entries[key];
        if (!current) {
            s.entries[key] = { total, savedAt, day: dayKey(savedAt), dueAt: savedAt + 6000, amount: 0, status: 'pending', confirmed: true };
        } else if (current.status === 'pending') {
            current.total = total;
            current.savedAt = savedAt;
            current.day = dayKey(savedAt);
            current.dueAt = savedAt + 6000;
            current.confirmed = true;
        }
        return state;
    }
    function discardPending(data, key) {
        const state = normalize(data);
        for (const s of Object.values(state.seasons)) {
            const entry = s.entries?.[key];
            if (entry?.status === 'pending' && Number(entry.amount || 0) === 0) delete s.entries[key];
        }
        return state;
    }
    function award(data, seasonId, key, now) {
        const state = normalize(data);
        const s = seasonState(state, seasonId);
        const e = s.entries[key];
        if (!e || e.status !== 'pending' || e.confirmed === false || now < e.dueAt) return state;
        e.amount = Math.max(0, Math.min(baseXp(e.total), 200 - (s.days[e.day] || 0), MAX_XP - s.xp));
        s.days[e.day] = (s.days[e.day] || 0) + e.amount;
        s.xp += e.amount;
        s.peakLevel = Math.max(s.peakLevel, level(s.xp));
        e.status = 'awarded';
        return state;
    }
    function revoke(data, seasonId, key) {
        const state = normalize(data);
        const s = seasonState(state, seasonId);
        const e = s.entries[key];
        if (!e || e.status === 'revoked') return state;
        if (e.status === 'awarded') {
            s.xp = Math.max(0, s.xp - e.amount);
            s.days[e.day] = Math.max(0, (s.days[e.day] || 0) - e.amount);
        }
        e.previousStatus = e.status; e.status = 'revoked';
        return state;
    }
    function restore(data, seasonId, key) {
        const state = normalize(data);
        const s = seasonState(state, seasonId);
        const e = s.entries[key];
        if (!e || e.status !== 'revoked') return state;
        if (e.previousStatus === 'awarded') {
            // Other records may have consumed the returned allowance meanwhile.
            e.amount = Math.max(0, Math.min(e.amount, 200 - (s.days[e.day] || 0), MAX_XP - s.xp));
            s.xp += e.amount; s.days[e.day] = (s.days[e.day] || 0) + e.amount;
            s.peakLevel = Math.max(s.peakLevel, level(s.xp));
            e.status = 'awarded';
        } else e.status = 'pending';
        delete e.previousStatus;
        return state;
    }
    function claim(data, season, lv, claimedAt = Date.now()) {
        const state = normalize(data);
        const s = seasonState(state, season.id);
        const id = season.rewards?.[lv];
        if (!id || Number(lv) > s.peakLevel || s.claimed[lv]) return state;
        s.claimed[lv] = id;
        s.claimedAt ||= {};
        s.claimedAt[lv] = claimedAt;
        state.collection[id] = true;
        return state;
    }
    root.SplitPassCore = { dayKey, baseXp, seasonEnd, seasonAt, level, validate, normalize, register, finalizeRegistration, discardPending, award, revoke, restore, claim };
})(globalThis);
