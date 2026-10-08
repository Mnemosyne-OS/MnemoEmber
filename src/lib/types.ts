/**
 * types.ts — what Ember records.
 *
 * One event = one moment the person declared: they used something, or a
 * craving passed (a virtual one finished, or "I'm good now"). Nothing else is
 * stored. The camera half of doc 139 is not in this lot; when it arrives a
 * confirmed detection is still a declared event — the card only proposes it.
 */

export type Substance = 'cigarette' | 'vape' | 'joint';

/** Display order everywhere (pickers, legends, stacked bars). */
export const SUBSTANCES: readonly Substance[] = ['cigarette', 'vape', 'joint'];

/** `use` = the person consumed. `resisted` = a craving passed without it. */
export type EventKind = 'use' | 'resisted';

/**
 * How a craving was ridden out. Absent on a `resisted` event = the virtual
 * one (the first and original way, so older saves read unchanged).
 */
export type Method = 'breathing' | 'pushups' | 'squats' | 'stretching' | 'walk' | 'water';

export const METHODS: readonly Method[] = ['breathing', 'pushups', 'squats', 'stretching', 'walk', 'water'];

/** Every way offered on the "Ride it out" sheet, the virtual one first. */
export type CravingChoice = Method | 'virtual';
export const CRAVING_CHOICES: readonly CravingChoice[] = ['virtual', ...METHODS];

export interface EmberEvent {
  /** Epoch milliseconds, rounded to the second (the disk keeps seconds). */
  at: number;
  kind: EventKind;
  substance: Substance;
  /** Only on `resisted`, and only when it was not the virtual one. */
  method?: Method;
}

/** One identity per event, for React keys and for removal. */
export function eventKey(e: EmberEvent): string {
  return `${e.at}-${e.kind}-${e.substance}-${e.method ?? ''}`;
}

/**
 * What Ember has written into memory (lib/memorySync.ts). The ids are the
 * chronicles in the cartridge's own sandbox vault, kept so the person can
 * take back everything that was written, and so a status is replaced instead
 * of piling up.
 */
export interface MemoryMeta {
  /** The person turned it on. Nothing is ever written while this is false. */
  on: boolean;
  /** Day digests written, by local day (YYYY-MM-DD) → chronicle id. */
  days: Record<string, number>;
  statusId: number | null;
  /** Earlier statuses the vault refused to forget when they were replaced.
   *  Kept so the next replacement tries again and "Forget what was written"
   *  can still take them back: a dropped id is a chronicle nobody can reach. */
  staleStatusIds: number[];
  /** The last status written, minus its date line, to skip identical rewrites. */
  statusBody: string;
  /** When the last write landed, or null when nothing was ever written. */
  lastWrittenAt: number | null;
}

export function emptyMemory(): MemoryMeta {
  return { on: false, days: {}, statusId: null, staleStatusIds: [], statusBody: '', lastWrittenAt: null };
}

/** The camera watch (lib/cameraWatch.ts, doc 139 §5). */
export interface WatchMeta {
  /** The person turned it on. Nothing is asked of the host while false. */
  on: boolean;
  /** Puffs in 5 minutes before Ember asks (lib/puffJudge.ts). */
  threshold: number;
  /** Answers to "Smoking?", to show how often the alert was right. */
  yes: number;
  no: number;
}

export function emptyWatch(): WatchMeta {
  return { on: false, threshold: 3, yes: 0, no: 0 };
}

export interface EmberState {
  /** What this person uses, chosen at first run. Empty = setup not done. */
  substances: Substance[];
  /** Sorted by `at`, oldest first. */
  events: EmberEvent[];
  memory: MemoryMeta;
  watch: WatchMeta;
}

export function emptyState(): EmberState {
  return { substances: [], events: [], memory: emptyMemory(), watch: emptyWatch() };
}

export function isSubstance(v: unknown): v is Substance {
  return v === 'cigarette' || v === 'vape' || v === 'joint';
}
