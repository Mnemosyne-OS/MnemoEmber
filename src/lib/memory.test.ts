import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayDigest, statusBody, statusText } from './memoryText';
import { log } from './log';
import { __getSyncStateForTests, __setInvokeForTests, forgetAll, forgetOutcome, syncNow } from './memorySync';
import { addDays } from './stats';
import { __setForTests, getSnapshot } from './store';
import { emptyMemory, emptyWatch, type EmberEvent } from './types';

const H = 3_600_000;
const D0 = new Date(2026, 9, 7, 0, 0, 0, 0).getTime();
const at = (day: number, hour: number): number => addDays(D0, day) + hour * H;
const use = (t: number): EmberEvent => ({ at: t, kind: 'use', substance: 'cigarette' });
// On without going through turnOn(), whose immediate run uses the real clock.
const on = () => ({ ...emptyMemory(), on: true });

describe('memory texts', () => {
  it('an untracked day writes nothing, never "zero cigarettes"', () => {
    expect(dayDigest([use(at(0, 9))], addDays(D0, -1))).toBeNull();
  });

  it('a digest carries the computed counts and absolute times', () => {
    const text = dayDigest([use(at(0, 9)), use(at(0, 14)), { at: at(0, 15), kind: 'resisted', substance: 'cigarette', method: 'pushups' }], D0)!;
    expect(text).toContain('2 cigarettes, 0 vapes, 0 joints (2 in total)');
    expect(text).toContain('push-ups 1');
    expect(text).toContain('09:00 cigarette, 14:00 cigarette');
  });

  it('the status body ignores its date line, so the same log is not rewritten', () => {
    const events = [use(at(0, 9))];
    const a = statusText(events, at(0, 12))!;
    const b = statusText(events, at(0, 12) + 60_000)!;
    expect(a).not.toBe(b);
    // Same events, same day, a minute later: only the date line moved.
    expect(statusBody(a)).toBe(statusBody(b));
  });
});

describe('memory sync', () => {
  let calls: { action: string; payload: unknown }[];
  let nextId: number;
  // What the host answers to vault.sandbox.forget: the envelope, never a rejection.
  let forgetAnswer: unknown;

  afterEach(() => { vi.restoreAllMocks(); });

  beforeEach(() => {
    calls = [];
    nextId = 100;
    forgetAnswer = { success: true, forgotten: 1 };
    __setInvokeForTests(<T,>(action: string, payload?: unknown): Promise<T> => {
      calls.push({ action, payload });
      if (action === 'permissions.refresh') return Promise.resolve({ granted: { 'vault:write': true } } as T);
      if (action === 'vault.sandbox.ensure') return Promise.resolve({ vault: 'APP-EMBER', unlocked: false } as T);
      if (action === 'social.ingest') return Promise.resolve({ chronicleId: String(nextId++) } as T);
      if (action === 'vault.sandbox.forget') return Promise.resolve(forgetAnswer as T);
      return Promise.resolve({} as T);
    });
  });

  it('writes nothing while off', async () => {
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: emptyMemory(), watch: emptyWatch() } });
    await syncNow(at(0, 12));
    expect(calls).toHaveLength(0);
  });

  it('writes each finished day once, then replaces the status (new first, old forgotten)', async () => {
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-2, 9)), use(at(-1, 9)), use(at(0, 9))], memory: on(), watch: emptyWatch() } });
    await syncNow(at(0, 12));
    const ingests = calls.filter((c) => c.action === 'social.ingest');
    // Two finished days + one status. Today is in the status, not a digest.
    expect(ingests).toHaveLength(3);
    const m = getSnapshot().state.memory;
    expect(Object.keys(m.days)).toHaveLength(2);
    expect(m.statusId).toBe(102);

    // A new use: no day is rewritten, the status is replaced.
    calls = [];
    __setForTests({ state: { ...getSnapshot().state, events: [...getSnapshot().state.events, use(at(0, 11))] } });
    await syncNow(at(0, 12));
    expect(calls.filter((c) => c.action === 'social.ingest')).toHaveLength(1);
    const forget = calls.find((c) => c.action === 'vault.sandbox.forget');
    expect(forget?.payload).toEqual({ ids: [102] });
    const order = calls.map((c) => c.action);
    expect(order.indexOf('social.ingest')).toBeLessThan(order.indexOf('vault.sandbox.forget'));
  });

  it('an unchanged status is not written again', async () => {
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: on(), watch: emptyWatch() } });
    await syncNow(at(0, 12));
    calls = [];
    await syncNow(at(0, 12));
    expect(calls.filter((c) => c.action === 'social.ingest')).toHaveLength(0);
  });

  it('a write with no id back stops the run instead of writing duplicates', async () => {
    __setInvokeForTests(<T,>(action: string): Promise<T> => {
      calls.push({ action, payload: null });
      if (action === 'vault.sandbox.ensure') return Promise.resolve({ vault: 'APP-EMBER', unlocked: true } as T);
      if (action === 'permissions.refresh') return Promise.resolve({ granted: { 'vault:write': true } } as T);
      return Promise.resolve({} as T);
    });
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-3, 9)), use(at(-2, 9))], memory: on(), watch: emptyWatch() } });
    await syncNow(at(0, 12));
    expect(calls.filter((c) => c.action === 'social.ingest')).toHaveLength(1);
    expect(getSnapshot().state.memory.days).toEqual({});
  });

  it('forgetting takes back every id written and clears the record', async () => {
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: { ...emptyMemory(), on: true, days: { '2026-10-06': 7 }, statusId: 9 }, watch: emptyWatch() } });
    await forgetAll();
    expect(calls.find((c) => c.action === 'vault.sandbox.forget')?.payload).toEqual({ ids: [7, 9] });
    expect(getSnapshot().state.memory).toEqual(emptyMemory());
  });

  const written = () => ({ ...emptyMemory(), on: true, days: { '2026-10-06': 7 }, statusId: 9 });

  it('a refused forget keeps every id and says why, so it can be tried again', async () => {
    forgetAnswer = { success: false, error: 'NO_VAULT_ROOT' };
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: written(), watch: emptyWatch() } });
    expect(await forgetAll()).toBe(false);
    expect(getSnapshot().state.memory).toEqual(written());
    expect(__getSyncStateForTests().forget).toEqual({ kind: 'refused', error: 'NO_VAULT_ROOT' });
  });

  it('a refusal without a reason is still a refusal', async () => {
    forgetAnswer = { success: false };
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: written(), watch: emptyWatch() } });
    expect(await forgetAll()).toBe(false);
    expect(getSnapshot().state.memory).toEqual(written());
    expect(__getSyncStateForTests().forget).toEqual({ kind: 'refused', error: 'FORGET_FAILED' });
  });

  it('a forget says how many the vault forgot, and nothing when it did not say', async () => {
    forgetAnswer = { success: true, forgotten: 2 };
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: written(), watch: emptyWatch() } });
    expect(await forgetAll()).toBe(true);
    expect(__getSyncStateForTests().forget).toEqual({ kind: 'done', forgotten: 2 });

    forgetAnswer = { success: true };
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: written(), watch: emptyWatch() } });
    await forgetAll();
    expect(__getSyncStateForTests().forget).toEqual({ kind: 'done', forgotten: null });
  });

  it('a refused forget of the old status is said, and the new status is kept', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    forgetAnswer = { success: false, error: 'NO_VAULT_ROOT' };
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: { ...on(), statusId: 50, statusBody: 'old' }, watch: emptyWatch() } });
    await syncNow(at(0, 12));
    expect(calls.find((c) => c.action === 'vault.sandbox.forget')?.payload).toEqual({ ids: [50] });
    expect(warn).toHaveBeenCalledWith('memory', 'previous status could not be forgotten', { ids: [50], detail: 'NO_VAULT_ROOT' });
    expect(getSnapshot().state.memory.statusId).not.toBe(50);
    expect(getSnapshot().state.memory.staleStatusIds).toEqual([50]);
    expect(__getSyncStateForTests().phase).toBe('done');
  });

  it('a status that could not be forgotten is tried again at the next replacement, then dropped once forgotten', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    forgetAnswer = { success: false, error: 'NO_VAULT_ROOT' };
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: { ...on(), statusId: 50, statusBody: 'old' }, watch: emptyWatch() } });
    await syncNow(at(0, 12));
    const first = getSnapshot().state.memory.statusId!;

    // A timeout is a refusal too: both stay kept.
    calls = [];
    __setInvokeForTests(<T,>(action: string, payload?: unknown): Promise<T> => {
      calls.push({ action, payload });
      if (action === 'permissions.refresh') return Promise.resolve({ granted: { 'vault:write': true } } as T);
      if (action === 'vault.sandbox.ensure') return Promise.resolve({ vault: 'APP-EMBER', unlocked: false } as T);
      if (action === 'social.ingest') return Promise.resolve({ chronicleId: String(nextId++) } as T);
      return Promise.reject(new Error('TIMEOUT: vault.sandbox.forget'));
    });
    __setForTests({ state: { ...getSnapshot().state, events: [...getSnapshot().state.events, use(at(0, 10))] } });
    await syncNow(at(0, 12));
    expect(calls.find((c) => c.action === 'vault.sandbox.forget')?.payload).toEqual({ ids: [first, 50] });
    expect([...getSnapshot().state.memory.staleStatusIds].sort()).toEqual([50, first].sort());
    const second = getSnapshot().state.memory.statusId!;

    // The vault accepts: every stale id goes with the replaced one, the list empties.
    calls = [];
    forgetAnswer = { success: true, forgotten: 3 };
    __setInvokeForTests(<T,>(action: string, payload?: unknown): Promise<T> => {
      calls.push({ action, payload });
      if (action === 'permissions.refresh') return Promise.resolve({ granted: { 'vault:write': true } } as T);
      if (action === 'vault.sandbox.ensure') return Promise.resolve({ vault: 'APP-EMBER', unlocked: false } as T);
      if (action === 'social.ingest') return Promise.resolve({ chronicleId: String(nextId++) } as T);
      return Promise.resolve(forgetAnswer as T);
    });
    __setForTests({ state: { ...getSnapshot().state, events: [...getSnapshot().state.events, use(at(0, 11))] } });
    await syncNow(at(0, 12));
    const ids = (calls.find((c) => c.action === 'vault.sandbox.forget')?.payload as { ids: number[] }).ids;
    expect([...ids].sort()).toEqual([50, first, second].sort());
    expect(getSnapshot().state.memory.staleStatusIds).toEqual([]);
  });

  it('a stale status is tried again at every sync, even when the status did not change', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: on(), watch: emptyWatch() } });
    await syncNow(at(0, 12));
    const live = getSnapshot().state.memory.statusId!;
    __setForTests({ state: { ...getSnapshot().state, memory: { ...getSnapshot().state.memory, staleStatusIds: [50, live] } } });

    // Refused: nothing written, the stale id stays (the live status is never sent).
    calls = [];
    forgetAnswer = { success: false, error: 'NO_VAULT_ROOT' };
    await syncNow(at(0, 12));
    expect(calls.filter((c) => c.action === 'social.ingest')).toHaveLength(0);
    expect(calls.find((c) => c.action === 'vault.sandbox.forget')?.payload).toEqual({ ids: [50] });
    expect(getSnapshot().state.memory.staleStatusIds).toEqual([50]);

    // Accepted at the next sync: the list empties.
    calls = [];
    forgetAnswer = { success: true, forgotten: 1 };
    await syncNow(at(0, 12));
    expect(calls.find((c) => c.action === 'vault.sandbox.forget')?.payload).toEqual({ ids: [50] });
    expect(getSnapshot().state.memory.staleStatusIds).toEqual([]);

    // Nothing stale: no forget is asked at all.
    calls = [];
    await syncNow(at(0, 12));
    expect(calls.some((c) => c.action === 'vault.sandbox.forget')).toBe(false);
  });

  it('forget all takes back the statuses the vault refused earlier', async () => {
    __setForTests({ state: { substances: ['cigarette'], events: [use(at(-1, 9))], memory: { ...written(), staleStatusIds: [3, 4] }, watch: emptyWatch() } });
    await forgetAll();
    expect(calls.find((c) => c.action === 'vault.sandbox.forget')?.payload).toEqual({ ids: [7, 9, 3, 4] });
    expect(getSnapshot().state.memory).toEqual(emptyMemory());
  });

  it('reads the envelope: only success === true is a success, an absent count is null', () => {
    expect(forgetOutcome({ success: 'true' }).ok).toBe(false);
    expect(forgetOutcome(undefined)).toEqual({ ok: false, forgotten: null, error: null });
    expect(forgetOutcome({ success: true, forgotten: 0 }).forgotten).toBe(0);
    expect(forgetOutcome({ success: true, forgotten: -1 }).forgotten).toBeNull();
  });
});
