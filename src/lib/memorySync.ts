/**
 * memorySync.ts — puts Ember's log into memory so the chat can answer
 * "how am I doing?" (doc 139 §3, Tony 2026-10-07: NORMAL protection, not
 * MAXIMUM, or a cloud chat could never see it).
 *
 * Where: the cartridge's OWN sandbox vault (`vault.sandbox.ensure`, doc 58).
 * The chat leaves a sandbox out of its default scope until the person unlocks
 * its permanence in the vault panel. That click is the human gate, and the
 * screen says so (`unlocked: false`) instead of pretending the chat can read.
 *
 * What: one digest per FINISHED day, written once (memoryText.dayDigest), and
 * one rolling status, replaced when it changes: the new one is written FIRST,
 * then the old one is forgotten, so a failed write never leaves nothing.
 * An old status the vault refuses to forget is kept in `staleStatusIds`,
 * tried again at every sync and taken back by "forget all".
 *
 * Rules:
 *  - nothing is written while `memory.on` is false, and never before the
 *    store has read the saved state (the store refuses the change anyway);
 *  - every chronicle id is kept, so "Forget what was written" can take all of
 *    it back (`vault.sandbox.forget`, own sandbox only);
 *  - a write without an id back stops the run: writing again would duplicate;
 *  - `vault.sandbox.forget` answers its envelope `{ success, forgotten?, error? }`
 *    and does NOT reject on a refusal, so the envelope is read (forgetOutcome):
 *    a refused "forget all" keeps every id, so it can be tried again;
 *  - every host call has a 15 s deadline (CLAUDE rule 9).
 */
import { useSyncExternalStore } from 'react';
import { sdk } from './host';
import { log } from './log';
import { dayDigest, dayKey, EMBER_SPINE, statusBody, statusText } from './memoryText';
import { addDays, startOfDay, trackingStart } from './stats';
import { getSnapshot, setMemory } from './store';
import { emptyMemory, type MemoryMeta } from './types';

const CALL_MS = 15_000;
/** Changes are gathered for this long before one write. */
export const SYNC_DELAY_MS = 20_000;
/** Day digests written per run at most, so a first sync of a long history
 *  does not hammer the vault in one burst. The next run continues. */
const DAYS_PER_RUN = 30;

export type SyncPhase = 'idle' | 'writing' | 'done' | 'error';

/**
 * The last "Forget what was written", apart from the write phase: it is shown
 * even after "Stop writing", and its retry is the forget button, not a sync.
 * 🎭 `forgotten: null` = the host did not say how many, never 0.
 */
export type ForgetState =
  | { kind: 'idle' }
  | { kind: 'refused'; error: string }
  | { kind: 'done'; forgotten: number | null };

export interface SyncState {
  phase: SyncPhase;
  /** The sandbox vault's name, once the host has answered. */
  vault: string | null;
  /** null = not asked yet. false = the chat does not read it until unlocked. */
  unlocked: boolean | null;
  error: string | null;
  forget: ForgetState;
}

const IDLE: SyncState = { phase: 'idle', vault: null, unlocked: null, error: null, forget: { kind: 'idle' } };
let sync: SyncState = IDLE;
const listeners = new Set<() => void>();

function publish(next: Partial<SyncState>): void {
  sync = { ...sync, ...next };
  listeners.forEach((fn) => fn());
}

export function useSyncState(): SyncState {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => sync);
}

type Invoke = <T>(action: string, payload?: unknown) => Promise<T>;
let invoke: Invoke = (action, payload) => sdk.invoke(action, payload);

/** Tests only. */
export function __setInvokeForTests(fn: Invoke): void {
  invoke = fn;
  sync = IDLE;
}

/** Tests only: the hook cannot be read outside React. */
export function __getSyncStateForTests(): SyncState {
  return sync;
}

/**
 * Reads the envelope of `vault.sandbox.forget`. Awaiting it proves nothing:
 * the host action returns the envelope as is and does not reject on a
 * refusal (Muse reads that envelope, so the host stays as it is).
 * 🎭 `forgotten` absent is unknown, never 0.
 */
export function forgetOutcome(answer: unknown): { ok: boolean; forgotten: number | null; error: string | null } {
  const a = (answer ?? {}) as { success?: unknown; forgotten?: unknown; error?: unknown };
  return {
    ok: a.success === true,
    forgotten: typeof a.forgotten === 'number' && a.forgotten >= 0 ? a.forgotten : null,
    error: typeof a.error === 'string' ? a.error : null,
  };
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT: ${label}`)), CALL_MS);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function idOf(answer: unknown): number | null {
  const raw = (answer as { chronicleId?: unknown } | null)?.chronicleId;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Write one text into the sandbox and return its id. */
async function write(vault: string, content: string, sourceRef: string): Promise<number> {
  const answer = await withTimeout(invoke<unknown>('social.ingest', { vault, content, spineType: EMBER_SPINE, sourceRef }), 'social.ingest');
  const id = idOf(answer);
  if (id === null) throw new Error('NO_CHRONICLE_ID');
  return id;
}

/** The memory meta as it is NOW (a run spans several awaits). */
function currentMemory(): MemoryMeta {
  return getSnapshot().state.memory;
}

/**
 * Forgets the status just replaced (if any) together with every stale one.
 * The new status is written already: a refused old one stays readable, so its
 * id is kept for the next run and for "forget all". Said, not swallowed. The
 * list empties only when the vault says it forgot.
 */
async function forgetStale(replaced: number | null): Promise<void> {
  const live = currentMemory().statusId;
  const stale = [...new Set([...(replaced !== null ? [replaced] : []), ...currentMemory().staleStatusIds])].filter((s) => s !== live);
  if (stale.length === 0) return;
  let refused: string | null;
  try {
    const out = forgetOutcome(await withTimeout(invoke<unknown>('vault.sandbox.forget', { ids: stale }), 'vault.sandbox.forget'));
    refused = out.ok ? null : out.error ?? 'refused';
  } catch (err) {
    refused = errText(err);
  }
  if (refused !== null) log.warn('memory', 'previous status could not be forgotten', { ids: stale, detail: refused });
  setMemory({ ...currentMemory(), staleStatusIds: refused === null ? [] : stale });
}

let running: Promise<void> | null = null;

/** One sync run. Concurrent calls share the run in flight. */
export function syncNow(now: number = Date.now()): Promise<void> {
  if (running) return running;
  running = run(now).finally(() => { running = null; });
  return running;
}

async function run(now: number): Promise<void> {
  const snap = getSnapshot();
  if (snap.status !== 'ready' || !snap.state.memory.on) return;
  publish({ phase: 'writing', error: null, forget: { kind: 'idle' } });
  try {
    const refreshed = await withTimeout(invoke<{ granted?: Record<string, boolean> }>('permissions.refresh', { permissions: ['vault:write'] }), 'permissions.refresh');
    if (refreshed?.granted?.['vault:write'] === false) throw new Error('PERMISSION_DENIED');
    const { vault, unlocked } = await withTimeout(invoke<{ vault: string; unlocked: boolean }>('vault.sandbox.ensure', {}), 'vault.sandbox.ensure');
    publish({ vault, unlocked });

    const events = getSnapshot().state.events;
    const begun = trackingStart(events);
    let replaced: number | null = null;
    if (begun !== null) {
      // Finished days only: from the first tracked day to yesterday.
      let written = 0;
      for (let day = startOfDay(begun); day < startOfDay(now) && written < DAYS_PER_RUN; day = addDays(day, 1)) {
        const key = dayKey(day);
        if (currentMemory().days[key]) continue;
        const text = dayDigest(events, day);
        if (text === null) continue;
        const id = await write(vault, text, `ember:day:${key}`);
        const m = currentMemory();
        setMemory({ ...m, days: { ...m.days, [key]: id }, lastWrittenAt: Date.now() });
        written += 1;
      }
      if (written > 0) log.info('memory', 'day digests written', { written });

      const status = statusText(events, now);
      if (status !== null && statusBody(status) !== currentMemory().statusBody) {
        const id = await write(vault, status, 'ember:status');
        const old = currentMemory().statusId;
        setMemory({ ...currentMemory(), statusId: id, statusBody: statusBody(status), lastWrittenAt: Date.now() });
        if (old !== null && old !== id) replaced = old;
        log.info('memory', 'status written');
      }
    }
    // Every run, not only when the status changes: a stale id left by a
    // refusal is tried again as soon as the vault may accept.
    await forgetStale(replaced);
    publish({ phase: 'done' });
  } catch (err) {
    log.error('memory', 'sync did not complete', { detail: errText(err) });
    publish({ phase: 'error', error: errText(err) });
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Gather changes, then write once. */
export function scheduleSync(delay = SYNC_DELAY_MS): void {
  if (!currentMemory().on) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncNow(); }, delay);
}

export function cancelScheduledSync(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

export function turnOn(): boolean {
  const ok = setMemory({ ...currentMemory(), on: true });
  if (ok) void syncNow();
  return ok;
}

/** Stop writing. What was written stays (see forgetAll). */
export function turnOff(): boolean {
  cancelScheduledSync();
  return setMemory({ ...currentMemory(), on: false });
}

/**
 * Take back every chronicle Ember wrote, then forget the ids. Only after the
 * host SAYS it forgot: a refused forget keeps the ids, so the chronicles stay
 * reachable and the button can be pressed again.
 */
export async function forgetAll(): Promise<boolean> {
  cancelScheduledSync();
  const m = currentMemory();
  const ids = [...Object.values(m.days), ...(m.statusId !== null ? [m.statusId] : []), ...m.staleStatusIds];
  try {
    let forgotten: number | null = 0;
    if (ids.length > 0) {
      const out = forgetOutcome(await withTimeout(invoke<unknown>('vault.sandbox.forget', { ids }), 'vault.sandbox.forget'));
      if (!out.ok) throw new Error(out.error ?? 'FORGET_FAILED');
      forgotten = out.forgotten;
    }
    publish({ phase: 'idle', error: null, forget: { kind: 'done', forgotten } });
    return setMemory(emptyMemory());
  } catch (err) {
    log.error('memory', 'forget did not complete', { ids: ids.length, detail: errText(err) });
    publish({ forget: { kind: 'refused', error: errText(err) } });
    return false;
  }
}
