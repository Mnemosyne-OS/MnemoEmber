/**
 * stats.ts — every number Ember shows, computed here and nowhere else.
 *
 * Doc 139 §4: the cartridge counts, a model never does. When the chat step
 * arrives it receives these figures already computed.
 *
 * 🎭 ABSENT ≠ ZERO. Tracking starts at the first event. A day before that was
 * never measured, so it is `null` and the screen draws it as absent. A day
 * after it with no event is a measured 0, which is a real and good number.
 *
 * All day boundaries are LOCAL midnights, built with Date so a daylight-saving
 * day keeps its 23 or 25 hours instead of drifting by an hour.
 */
import { SUBSTANCES, type CravingChoice, type EmberEvent, type Substance } from './types';

export const DAY_MS = 86_400_000;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `n` days after the day containing `ms` (n may be negative). */
export function addDays(ms: number, n: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export type Counts = Record<Substance, number>;

function zeroCounts(): Counts {
  return { cigarette: 0, vape: 0, joint: 0 };
}

export function totalOf(c: Counts): number {
  return SUBSTANCES.reduce((n, s) => n + c[s], 0);
}

/** First event ever, or null when nothing was ever logged. */
export function trackingStart(events: readonly EmberEvent[]): number | null {
  return events.length > 0 ? events[0]!.at : null;
}

export interface DaySummary {
  start: number;
  /** null = the day lies before tracking started: never measured. */
  uses: Counts | null;
  resisted: number | null;
}

/** One day's counts. Events must be sorted (the store keeps them sorted). */
export function summariseDay(events: readonly EmberEvent[], dayStart: number): DaySummary {
  const begun = trackingStart(events);
  if (begun === null || addDays(dayStart, 1) <= startOfDay(begun)) {
    return { start: dayStart, uses: null, resisted: null };
  }
  const end = addDays(dayStart, 1);
  const uses = zeroCounts();
  let resisted = 0;
  for (const e of events) {
    if (e.at < dayStart || e.at >= end) continue;
    if (e.kind === 'use') uses[e.substance] += 1; else resisted += 1;
  }
  return { start: dayStart, uses, resisted };
}

/**
 * Uses yesterday up to the same clock time as now. null unless tracking had
 * already started before today: "3 by this time yesterday" on the first day
 * would compare against a day nobody measured.
 */
export function yesterdayByNow(events: readonly EmberEvent[], now: number): number | null {
  const begun = trackingStart(events);
  const today = startOfDay(now);
  if (begun === null || begun >= today) return null;
  const yStart = addDays(now, -1);
  const sameTime = yStart + (now - today);
  let n = 0;
  for (const e of events) if (e.kind === 'use' && e.at >= yStart && e.at < sameTime) n += 1;
  return n;
}

/** Milliseconds since the last use, or null when there has never been one. */
export function sinceLastUse(events: readonly EmberEvent[], now: number): number | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i]!;
    if (e.kind === 'use' && e.at <= now) return now - e.at;
  }
  return null;
}

export interface Gap {
  ms: number;
  /** True when the longest gap is the one running right now. */
  ongoing: boolean;
}

/**
 * Longest stretch between two uses over the last `days` days, counting the
 * stretch still running. null with fewer than one use in reach: a gap needs a
 * use at its start, otherwise it measures the time before tracking began.
 */
export function longestGap(events: readonly EmberEvent[], now: number, days = 7): Gap | null {
  const from = addDays(now, -(days - 1));
  const uses = events.filter((e) => e.kind === 'use' && e.at <= now);
  // The use just before the window starts the first gap that reaches into it.
  let prev: number | null = null;
  for (const e of uses) if (e.at < from) prev = e.at;
  let best: Gap | null = null;
  for (const e of uses) {
    if (e.at < from) continue;
    if (prev !== null) {
      const ms = e.at - Math.max(prev, from);
      if (!best || ms > best.ms) best = { ms, ongoing: false };
    }
    prev = e.at;
  }
  if (prev !== null) {
    const ms = now - Math.max(prev, from);
    if (!best || ms >= best.ms) best = { ms, ongoing: true };
  }
  return best;
}

/** The last 7 days, oldest first, today last. */
export function lastWeek(events: readonly EmberEvent[], now: number): DaySummary[] {
  const out: DaySummary[] = [];
  for (let i = 6; i >= 0; i -= 1) out.push(summariseDay(events, addDays(now, -i)));
  return out;
}

export interface WeekTrend {
  thisWeek: number;
  previousWeek: number;
}

/**
 * Uses in the last 7 days against the 7 before. null unless BOTH windows were
 * fully measured: a partial previous week would show a fake improvement.
 */
export function weekTrend(events: readonly EmberEvent[], now: number): WeekTrend | null {
  const begun = trackingStart(events);
  const thisStart = addDays(now, -6);
  const prevStart = addDays(now, -13);
  if (begun === null || startOfDay(begun) > prevStart) return null;
  let thisWeek = 0;
  let previousWeek = 0;
  for (const e of events) {
    if (e.kind !== 'use' || e.at > now) continue;
    if (e.at >= thisStart) thisWeek += 1;
    else if (e.at >= prevStart) previousWeek += 1;
  }
  return { thisWeek, previousWeek };
}

/** Clock position of an instant within its day, 0..1 from midnight. */
export function dayFraction(ms: number): number {
  return (ms - startOfDay(ms)) / (addDays(ms, 1) - startOfDay(ms));
}

/** "1 h 42 min", "12 min", "under a minute" handled by the caller's copy. */
export function splitDuration(ms: number): { days: number; hours: number; minutes: number } {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  return { days: Math.floor(totalMin / 1440), hours: Math.floor((totalMin % 1440) / 60), minutes: totalMin % 60 };
}

/**
 * Minutes of life one cigarette costs on average: 20 (17 for men, 22 for
 * women), from Jackson et al., UCL, Addiction, December 2024.
 *
 * ⚠️ A population AVERAGE, shown as an estimate with its source, never as a
 * fact about this person. No published figure exists per vape or per joint,
 * so neither is converted into time: inventing one would be the exact
 * fabrication §4 forbids.
 */
export const LIFE_MIN_PER_CIGARETTE = 20;

export interface Totals {
  /** Local midnight of the first tracked day. */
  since: number;
  /** Calendar days tracked, today included. */
  days: number;
  uses: Counts;
  /** Cravings passed, all methods. */
  passed: number;
  /** Uses per tracked day, all substances. */
  perDay: number;
  /** Estimated life lost to the cigarettes logged, in ms. */
  lifeLostMs: number;
  /** Estimated life kept by the cigarette cravings that passed, in ms. */
  lifeSavedMs: number;
}

/** Everything since tracking began. null when nothing was ever logged. */
export function totals(events: readonly EmberEvent[], now: number): Totals | null {
  const begun = trackingStart(events);
  if (begun === null) return null;
  const since = startOfDay(begun);
  let days = 1;
  while (addDays(since, days) <= now) days += 1;
  const uses = zeroCounts();
  let passed = 0;
  let passedCigarettes = 0;
  for (const e of events) {
    if (e.at > now) continue;
    if (e.kind === 'use') uses[e.substance] += 1;
    else {
      passed += 1;
      if (e.substance === 'cigarette') passedCigarettes += 1;
    }
  }
  const minute = 60_000;
  return {
    since,
    days,
    uses,
    passed,
    perDay: totalOf(uses) / days,
    lifeLostMs: uses.cigarette * LIFE_MIN_PER_CIGARETTE * minute,
    lifeSavedMs: passedCigarettes * LIFE_MIN_PER_CIGARETTE * minute,
  };
}

/**
 * The way this person rides cravings out most often over the last 30 days,
 * which the sheet puts in the centre (Tony, 2026-10-07). Ties go to the one
 * used most recently. null when no craving passed in that window: the sheet
 * then keeps the virtual one in the centre.
 */
export function favouriteChoice(events: readonly EmberEvent[], now: number): CravingChoice | null {
  const from = addDays(now, -29);
  const count = new Map<CravingChoice, { n: number; last: number }>();
  for (const e of events) {
    if (e.kind !== 'resisted' || e.at < from || e.at > now) continue;
    const c: CravingChoice = e.method ?? 'virtual';
    const cur = count.get(c) ?? { n: 0, last: 0 };
    count.set(c, { n: cur.n + 1, last: Math.max(cur.last, e.at) });
  }
  let best: CravingChoice | null = null;
  let bestN = 0;
  let bestLast = 0;
  for (const [c, { n, last }] of count) {
    if (n > bestN || (n === bestN && last > bestLast)) { best = c; bestN = n; bestLast = last; }
  }
  return best;
}
