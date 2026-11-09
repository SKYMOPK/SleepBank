import { core, fail } from './protocol.js';
import { adjustBudget, dateKey } from './budget.js';
export async function commitEvent(db, event, now = Date.now()) {
    const id = event.recordId;
    if (event.type === 'expense') {
        const draft = event.intent;
        const record = { ...draft, timestamp: event.createdAt, updatedAt: event.createdAt, editVersion: 1, settled: false, budgetApplied: { date: dateKey(event.createdAt), p1: draft.p1_bought, p2: draft.p2_bought } };
        const sync = { opId: `push-${id}`, before: null, after: core.budgetSnapshot(record), createdAt: event.createdAt };
        const pending = { ...record, budgetSync: sync };
        const saved = await db.update(`split/records/${id}`, current => {
            if (!current) return pending;
            // A crash after PUT is safe to resume; a different record must never be adopted.
            if (current.timestamp !== record.timestamp || current.payer !== record.payer || current.p1_bought !== record.p1_bought || current.p2_bought !== record.p2_bought || current.note !== record.note) fail(409, '帳目已被變更，未建立通知');
            return undefined;
        });
        if (saved.deletedAt) return saved;
        if (saved.budgetSync?.opId === sync.opId) {
            for (const adjustment of core.budgetAdjustments(null, saved)) {
                const opId = `${sync.opId}:${adjustment.playerId}:${adjustment.date}`;
                await db.update(`budget/${adjustment.playerId}`, raw => adjustBudget(raw, adjustment.delta, adjustment.date, opId, now));
            }
            await db.update(`split/records/${id}`, current => {
                if (current?.budgetSync?.opId !== sync.opId) return undefined;
                const cleaned = { ...current }; delete cleaned.budgetSync; return cleaned;
            });
        }
        return await db.read(`split/records/${id}`);
    }
    if (event.type === 'settlement') {
        const split = await db.update('split', current => {
            if (!current) fail(409, '帳本尚未載入');
            const existing = current.settlements?.[id];
            if (existing) {
                if (existing.timestamp !== event.createdAt || existing.mode !== event.intent.mode || JSON.stringify(Object.keys(existing.recordIds || {}).sort()) !== JSON.stringify(event.intent.ids)) fail(409, '結清紀錄識別碼衝突');
                return undefined;
            }
            const entries = event.intent.ids.map(key => [key, current.records?.[key]]);
            if (entries.some(([, record]) => !record || record.deletedAt || record.settled || record.budgetSync)) fail(409, '部分帳目已變更，請重新選取');
            const summary = core.settlementSummary(entries);
            const next = structuredClone(current);
            next.settlements ||= {};
            next.settlements[id] = { timestamp: event.createdAt, mode: event.intent.mode, amount: summary.amount, from: summary.from, to: summary.to, count: entries.length, recordIds: Object.fromEntries(entries.map(([key]) => [key, true])) };
            entries.forEach(([key]) => Object.assign(next.records[key], { settled: true, settledAt: event.createdAt, settlementId: id }));
            return next;
        });
        return split.settlements[id];
    }
    return null;
}
