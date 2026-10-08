/**
 * codec.ts — the on-disk shape, pure (no host, no React).
 *
 * The host's durable state is capped at 256 KB (doc 73), so an event is one
 * short string: epoch SECONDS in base 36 followed by one letter.
 *   c v j = use of cigarette / vape / joint
 *   C V J = a craving of that kind that passed (with the virtual one)
 *   C V J followed by one lowercase letter = passed another way (Method):
 *     b breathing, p push-ups, q squats, s stretching, w walk, h water
 * Base 36 digits are never uppercase, so the reading is unambiguous: ends in
 * uppercase = virtual; uppercase then lowercase = method; else a use.
 * "t2k1a9c" is ~8 bytes with its quotes and comma: ~30 000 events fit, which
 * is years of a heavy smoker. A save past the budget is REFUSED, never cut.
 *
 * 🎭 `hydrate` has three answers. Nothing stored = fresh. A blob it cannot
 * read = unreadable, and the store must refuse to write over it — treating it
 * as fresh would replace a real history with an empty one on the next tap.
 */
import { emptyMemory, emptyState, emptyWatch, isSubstance, SUBSTANCES, type EmberEvent, type EmberState, type MemoryMeta, type Method, type Substance, type WatchMeta } from './types';

export const FORMAT_VERSION = 1;

const USE_CODE: Record<Substance, string> = { cigarette: 'c', vape: 'v', joint: 'j' };
const CODE_USE: Record<string, Substance> = { c: 'cigarette', v: 'vape', j: 'joint' };

const METHOD_CODE: Record<Method, string> = { breathing: 'b', pushups: 'p', squats: 'q', stretching: 's', walk: 'w', water: 'h' };
const CODE_METHOD: Record<string, Method> = { b: 'breathing', p: 'pushups', q: 'squats', s: 'stretching', w: 'walk', h: 'water' };

export function packEvent(e: EmberEvent): string {
  const code = USE_CODE[e.substance];
  const head = Math.floor(e.at / 1000).toString(36);
  if (e.kind === 'use') return head + code;
  return head + code.toUpperCase() + (e.method ? METHOD_CODE[e.method] : '');
}

function isUpper(c: string): boolean {
  return c >= 'A' && c <= 'Z';
}

/** null for anything that is not an event this codec wrote. */
export function unpackEvent(s: unknown): EmberEvent | null {
  if (typeof s !== 'string' || s.length < 2) return null;
  let body = s;
  let method: Method | undefined;
  const last = s.slice(-1);
  const prev = s.slice(-2, -1);
  if (!isUpper(last) && isUpper(prev)) {
    method = CODE_METHOD[last];
    if (!method) return null;
    body = s.slice(0, -1);
  }
  const letter = body.slice(-1);
  const substance = CODE_USE[letter.toLowerCase()];
  if (!substance) return null;
  const head = body.slice(0, -1);
  if (!/^[0-9a-z]+$/.test(head)) return null;
  const seconds = parseInt(head, 36);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const kind = isUpper(letter) ? 'resisted' : 'use';
  const e: EmberEvent = { at: seconds * 1000, kind, substance };
  if (method) e.method = method;
  return e;
}

export function serialise(state: EmberState): Record<string, unknown> {
  return {
    version: FORMAT_VERSION,
    substances: state.substances.map((s) => USE_CODE[s]),
    events: state.events.map(packEvent),
    memory: state.memory,
    watch: state.watch,
  };
}

/** Optional since the camera lot: a save without it reads as "never on". */
function readWatch(raw: unknown): WatchMeta {
  const w = emptyWatch();
  if (!isObj(raw)) return w;
  w.on = raw.on === true;
  if (typeof raw.threshold === 'number' && Number.isInteger(raw.threshold) && raw.threshold >= 2 && raw.threshold <= 6) w.threshold = raw.threshold;
  if (typeof raw.yes === 'number' && Number.isInteger(raw.yes) && raw.yes >= 0) w.yes = raw.yes;
  if (typeof raw.no === 'number' && Number.isInteger(raw.no) && raw.no >= 0) w.no = raw.no;
  return w;
}

function isId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** Optional since the memory lot: a save without it reads as "never on". */
function readMemory(raw: unknown): MemoryMeta {
  const m = emptyMemory();
  if (!isObj(raw)) return m;
  m.on = raw.on === true;
  if (isObj(raw.days)) {
    for (const [k, v] of Object.entries(raw.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isId(v)) m.days[k] = v;
  }
  m.statusId = isId(raw.statusId) ? raw.statusId : null;
  // Optional since 2026-10-07: a save without it has no stale status.
  if (Array.isArray(raw.staleStatusIds)) {
    m.staleStatusIds = [...new Set(raw.staleStatusIds.filter(isId))].filter((id) => id !== m.statusId);
  }
  m.statusBody = typeof raw.statusBody === 'string' ? raw.statusBody : '';
  m.lastWrittenAt = typeof raw.lastWrittenAt === 'number' && Number.isFinite(raw.lastWrittenAt) ? raw.lastWrittenAt : null;
  return m;
}

export type HydrateOutcome = 'fresh' | 'read' | 'unreadable';

export interface Hydrated {
  state: EmberState;
  outcome: HydrateOutcome;
  /** Entries in a readable blob that were not events (said in the log). */
  dropped: number;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function hydrate(raw: unknown): Hydrated {
  if (raw === null || raw === undefined) return { state: emptyState(), outcome: 'fresh', dropped: 0 };
  if (!isObj(raw) || raw.version !== FORMAT_VERSION || !Array.isArray(raw.events) || !Array.isArray(raw.substances)) {
    return { state: emptyState(), outcome: 'unreadable', dropped: 0 };
  }
  const substances: Substance[] = [];
  for (const code of raw.substances) {
    const s = typeof code === 'string' ? CODE_USE[code] : undefined;
    if (s && isSubstance(s) && !substances.includes(s)) substances.push(s);
  }
  substances.sort((a, b) => SUBSTANCES.indexOf(a) - SUBSTANCES.indexOf(b));
  const events: EmberEvent[] = [];
  let dropped = 0;
  for (const item of raw.events) {
    const e = unpackEvent(item);
    if (e) events.push(e); else dropped += 1;
  }
  events.sort((a, b) => a.at - b.at);
  return { state: { substances, events, memory: readMemory(raw.memory), watch: readWatch(raw.watch) }, outcome: 'read', dropped };
}

/** What the host counts against its budget: UTF-8 bytes of the JSON. */
export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
