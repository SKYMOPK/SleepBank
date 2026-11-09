import { core } from './protocol.js';
export const dateKey = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const monthKey = date => date.slice(0, 7);
const addDay = date => new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
const daysInMonth = month => { const [year, number] = month.split('-').map(Number); return new Date(Date.UTC(year, number, 0)).getUTCDate(); };

// Mirrors the ledger's existing rollover and splitOps transaction, preserving cent precision.
export function adjustBudget(raw, delta, appliedDate, opId, now) {
    if (!raw?.monthKey || !delta) return raw;
    const today = dateKey(now), currentMonth = monthKey(today);
    let b = structuredClone(raw), vault = Number(b.vault) || 0;
    if (b.monthKey !== currentMonth) {
        if (b.lastSettledDate && b.monthBudget > 0) {
            const limit = Number(b.monthBudget || 0) / daysInMonth(b.monthKey);
            let date = b.lastSettledDate;
            while (monthKey(date) === b.monthKey) {
                vault += limit - (date === b.lastSettledDate ? Number(b.spentToday || 0) : 0); date = addDay(date);
            }
        }
        b = { monthKey: currentMonth, monthBudget: 0, locked: false, vault, spentToday: 0, lastSettledDate: today, updatedAt: now, splitOps: b.splitOps || {} };
    } else {
        if (!b.lastSettledDate) b.lastSettledDate = today;
        if (b.lastSettledDate < today && b.monthBudget > 0) {
            const limit = Number(b.monthBudget || 0) / daysInMonth(b.monthKey);
            let date = b.lastSettledDate;
            while (date < today && monthKey(date) === b.monthKey) {
                vault += limit - (date === b.lastSettledDate ? Number(b.spentToday || 0) : 0); date = addDay(date);
            }
            b.spentToday = 0; b.lastSettledDate = today;
        }
        b.vault = Math.round(vault * 100) / 100; b.updatedAt = now;
    }
    if (b.splitOps?.[opId]) return b;
    if (appliedDate === today && b.monthKey === monthKey(appliedDate)) b.spentToday = Math.max(0, core.roundMoney(Number(b.spentToday || 0) + delta));
    else b.vault = core.roundMoney(Number(b.vault || 0) - delta);
    b.splitOps = Object.fromEntries(Object.entries({ ...b.splitOps, [opId]: now }).sort((a, z) => Number(z[1]) - Number(a[1])).slice(0, 120));
    b.updatedAt = now; return b;
}
