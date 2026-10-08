/**
 * store.ts — the person's events, held in the host's durable state (doc 73).
 *
 * Three rules copied from MnemoLingua, where each was paid for:
 *  1. **Nothing is written before something is read.** A tap that lands while
 *     the first `state.get` is in flight would persist an empty history over
 *     a real one, so every mutation is refused until `load` has answered.
 *  2. **The host answers an ENVELOPE** `{ state, updatedAt }`. Handing the
 *     envelope to `hydrate` would read as "nothing saved".
 *  3. **Unreadable is not fresh.** A blob `hydrate` cannot read puts the store
 *     in `unreadable` and it refuses to write over it.
 *
 * A change that would not fit the 256 KB budget is REFUSED and said, never
 * truncated. A write the host rejects leaves the change on screen and says
 * "not saved" with the host's reason.
 *
 * Opened standalone in a browser (dev, no host), the same blob goes to this
 * browser's localStorage, and `mode` says so for the screen.
 */
import { byteLength, hydrate, serialise } from './codec';
import { hasHost, readState, writeState } from './host';
import { log } from './log';
import { emptyState, eventKey, type EmberEvent, type EmberState, type MemoryMeta, type Substance, type WatchMeta } from './types';

export const STATE_BUDGET = 256 * 1024;
/** The host weighs `{ id, state, updatedAt }`, not the state alone. */
const ENVELOPE_MARGIN = 512;

const BROWSER_KEY = 'mnemo-ember:state';

export type StoreStatus = 'loading' | 'ready' | 'unreadable' | 'failed';
export type StoreMode = 'host' | 'browser';

export interface StoreSnapshot {
  status: StoreStatus;
  mode: StoreMode;
  state: EmberState;
  /** The last write that did not land, with its reason. Cleared by the next good write. */
  saveError: string | null;
  /** Why loading failed or why the blob is unreadable. */
  loadError: string | null;
}

let snapshot: StoreSnapshot = {
  status: 'loading',
  mode: hasHost() ? 'host' : 'browser',
  state: emptyState(),
  saveError: null,
  loadError: null,
};

const listeners = new Set<() => void>();

function publish(next: Partial<StoreSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((fn) => fn());
}

export function getSnapshot(): StoreSnapshot {
  return snapshot;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The stored blob inside the host's envelope, or null when there is none. */
export function stateOf(answer: unknown): unknown {
  if (!isObj(answer)) return null;
  return 'state' in answer && 'updatedAt' in answer ? answer.state : null;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readRaw(): Promise<unknown> {
  if (snapshot.mode === 'host') return stateOf(await readState());
  const text = window.localStorage.getItem(BROWSER_KEY);
  return text === null ? null : JSON.parse(text);
}

export async function load(): Promise<void> {
  let raw: unknown;
  try {
    raw = await readRaw();
  } catch (err) {
    log.error('store', 'could not read saved events', { mode: snapshot.mode, detail: errText(err) });
    publish({ status: 'failed', loadError: errText(err) });
    return;
  }
  const { state, outcome, dropped } = hydrate(raw);
  if (outcome === 'unreadable') {
    log.error('store', 'saved blob is not a format this version reads; refusing to write over it', { mode: snapshot.mode });
    publish({ status: 'unreadable', loadError: 'format' });
    return;
  }
  if (dropped > 0) log.warn('store', 'entries that are not events were skipped', { dropped });
  log.info('store', `loaded ${outcome}`, { events: state.events.length, substances: state.substances.length, mode: snapshot.mode });
  publish({ status: 'ready', state });
}

let writeChain: Promise<void> = Promise.resolve();

/**
 * Apply a change and persist it. Returns false (and changes nothing) when the
 * store is not writable or the result would not fit the budget.
 */
function commit(next: EmberState): boolean {
  if (snapshot.status !== 'ready') {
    log.warn('store', 'change refused before the saved events were read', { status: snapshot.status });
    return false;
  }
  const blob = serialise(next);
  const bytes = byteLength(blob);
  if (bytes > STATE_BUDGET - ENVELOPE_MARGIN) {
    log.error('store', 'change refused: the history would not fit the host budget', { bytes });
    publish({ saveError: 'full' });
    return false;
  }
  publish({ state: next });
  writeChain = writeChain.then(async () => {
    try {
      if (snapshot.mode === 'host') await writeState(blob);
      else window.localStorage.setItem(BROWSER_KEY, JSON.stringify(blob));
      if (snapshot.saveError !== null) publish({ saveError: null });
    } catch (err) {
      log.error('store', 'write did not land', { mode: snapshot.mode, bytes, detail: errText(err) });
      publish({ saveError: errText(err) });
    }
  });
  return true;
}

/** Record one event at `at` (defaults to now), kept in time order. */
export function addEvent(event: EmberEvent): boolean {
  const at = Math.floor(event.at / 1000) * 1000;
  const events = [...snapshot.state.events, { ...event, at }].sort((a, b) => a.at - b.at);
  return commit({ ...snapshot.state, events });
}

/** Remove the event that matches exactly (same second, kind, substance, method). */
export function removeEvent(event: EmberEvent): boolean {
  const key = eventKey(event);
  const i = snapshot.state.events.findIndex((e) => eventKey(e) === key);
  if (i < 0) return false;
  const events = snapshot.state.events.filter((_, j) => j !== i);
  return commit({ ...snapshot.state, events });
}

export function setSubstances(substances: Substance[]): boolean {
  return commit({ ...snapshot.state, substances: [...substances] });
}

/** What has been written into memory (lib/memorySync.ts owns its meaning). */
export function setMemory(memory: MemoryMeta): boolean {
  return commit({ ...snapshot.state, memory });
}

/** The camera watch settings and answers (lib/cameraWatch.ts). */
export function setWatch(watch: WatchMeta): boolean {
  return commit({ ...snapshot.state, watch });
}

/** Tests only: put the store in a known state without touching a host. */
export function __setForTests(next: Partial<StoreSnapshot>): void {
  writeChain = Promise.resolve();
  publish({ status: 'ready', mode: 'browser', state: emptyState(), saveError: null, loadError: null, ...next });
}
