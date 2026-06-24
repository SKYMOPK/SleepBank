(function initSplitLedgerCore(root) {
    const PLAYER_IDS = Object.freeze(['p1', 'p2']);

    function roundMoney(value) {
        return Math.round((Number(value) || 0) * 100) / 100;
    }

    function amount(value) {
        return Math.max(0, roundMoney(value));
    }

    function dateKeyFromTimestamp(timestamp = Date.now()) {
        const date = new Date(Number(timestamp) || Date.now());
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function monthKeyFromTimestamp(timestamp = Date.now()) {
        return dateKeyFromTimestamp(timestamp).slice(0, 7);
    }

    function recordDelta(record = {}) {
        if (record.payer === 'p1') return amount(record.p2_bought);
        if (record.payer === 'p2') return -amount(record.p1_bought);
        return 0;
    }

    function isVisibleRecord(record = {}) {
        return !record.deletedAt;
    }

    function recordEntries(records = {}) {
        return Object.entries(records).filter(([, record]) => record && isVisibleRecord(record));
    }

    function balanceFromRecords(records = {}) {
        return roundMoney(recordEntries(records)
            .filter(([, record]) => !record.settled)
            .reduce((total, [, record]) => total + recordDelta(record), 0));
    }

    function budgetSnapshot(record) {
        if (!record) return null;
        const applied = record.budgetApplied || {};
        return {
            date: applied.date || dateKeyFromTimestamp(record.timestamp),
            p1: amount(applied.p1 ?? record.p1_bought),
            p2: amount(applied.p2 ?? record.p2_bought),
        };
    }

    function budgetAdjustments(beforeRecord, afterRecord) {
        const before = budgetSnapshot(beforeRecord);
        const after = budgetSnapshot(afterRecord);
        const combined = new Map();
        const add = (playerId, date, delta) => {
            if (!date || !delta) return;
            const key = `${playerId}:${date}`;
            combined.set(key, roundMoney((combined.get(key) || 0) + delta));
        };

        for (const playerId of PLAYER_IDS) {
            if (before) add(playerId, before.date, -before[playerId]);
            if (after) add(playerId, after.date, after[playerId]);
        }

        return [...combined.entries()]
            .map(([key, delta]) => {
                const separator = key.indexOf(':');
                return { playerId: key.slice(0, separator), date: key.slice(separator + 1), delta };
            })
            .filter((entry) => entry.delta !== 0);
    }

    function validateRecordDraft(draft = {}) {
        const p1 = amount(draft.p1_bought);
        const p2 = amount(draft.p2_bought);
        if (!PLAYER_IDS.includes(draft.payer)) return { valid: false, reason: '請選擇付款人' };
        if (p1 === 0 && p2 === 0) return { valid: false, reason: '請輸入金額' };
        return {
            valid: true,
            record: {
                ...draft,
                p1_bought: p1,
                p2_bought: p2,
                note: String(draft.note || '').trim() || '（未填備註）',
            },
        };
    }

    function normalizeSearch(value) {
        return String(value || '').trim().toLocaleLowerCase('zh-TW');
    }

    function filterRecords(records = {}, filters = {}) {
        const search = normalizeSearch(filters.search);
        const settled = filters.settled;
        return recordEntries(records)
            .filter(([, record]) => settled == null || Boolean(record.settled) === Boolean(settled))
            .filter(([, record]) => !filters.month || filters.month === 'all' || monthKeyFromTimestamp(record.timestamp) === filters.month)
            .filter(([, record]) => !filters.payer || filters.payer === 'all' || record.payer === filters.payer)
            .filter(([, record]) => !search || normalizeSearch(record.note).includes(search))
            .sort((a, b) => (Number(b[1].timestamp) || 0) - (Number(a[1].timestamp) || 0));
    }

    function monthLabel(monthKey) {
        const [year, month] = String(monthKey).split('-');
        return `${year} 年 ${Number(month)} 月`;
    }

    function groupRecordsByMonth(entries = []) {
        const groups = new Map();
        for (const entry of entries) {
            const key = monthKeyFromTimestamp(entry[1].timestamp);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        }
        return [...groups.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([key, records]) => ({
                key,
                label: monthLabel(key),
                records,
                count: records.length,
                balance: roundMoney(records.reduce((total, [, record]) => total + recordDelta(record), 0)),
            }));
    }

    function settlementSummary(entries = []) {
        const balance = roundMoney(entries.reduce((total, entry) => {
            const record = Array.isArray(entry) ? entry[1] : entry;
            return total + recordDelta(record);
        }, 0));
        if (balance > 0) return { balance, amount: balance, from: 'p2', to: 'p1' };
        if (balance < 0) return { balance, amount: Math.abs(balance), from: 'p1', to: 'p2' };
        return { balance: 0, amount: 0, from: null, to: null };
    }

    root.SplitLedgerCore = Object.freeze({
        PLAYER_IDS,
        balanceFromRecords,
        budgetAdjustments,
        budgetSnapshot,
        dateKeyFromTimestamp,
        filterRecords,
        groupRecordsByMonth,
        monthKeyFromTimestamp,
        monthLabel,
        recordDelta,
        roundMoney,
        settlementSummary,
        validateRecordDraft,
    });
}(typeof globalThis !== 'undefined' ? globalThis : window));
