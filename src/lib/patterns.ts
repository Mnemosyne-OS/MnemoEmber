/**
 * patterns.ts — the context links Ember can draw from its own log (doc 139
 * §3 lot 3, first part). Pure.
 *
 * Doc 82's rule holds for every line: the machine PROPOSES a link, it never
 * concludes, and the count is always shown. Below a minimum count nothing is
 * shown at all: "2 of 3 after 21:00" is noise dressed as a finding.
 *
 * Three links, all from the person's own events:
 *  - peak hours: the two-hour window with the most uses;
 *  - weekdays: uses per tracked day, weekday against weekend;
 *  - how long each way of riding a craving out holds: the time from a passed
 *    craving to the next use, median per method.
 *
 * The agenda link (§3: "after a meeting") needs the host to let a cartridge
 * READ the agenda, which no action does today (only agenda.add exists).
 */
import { addDays, DAY_MS, startOfDay, trackingStart } from './stats';
import type { CravingChoice, EmberEvent } from './types';

/** Uses needed in the window before any pattern is shown. */
export const MIN_USES = 10;
/** Samples needed before a method's hold time is shown. */
export const MIN_HOLDS = 3;
export const WINDOW_DAYS = 28;

export interface PeakHours {
  /** Start hour of the two-hour window, 0..23 (the window may wrap midnight). */
  from: number;
  count: number;
  total: number;
}

export interface WeekSplit {
  weekdayPerDay: number;
  weekendPerDay: number;
  weekdayDays: number;
  weekendDays: number;
}

export interface Hold {
  choice: CravingChoice;
  medianMs: number;
  samples: number;
}

export interface Patterns {
  /** Uses in the window, all substances. */
  uses: number;
  /** Uses per hour of the day over the window, for the small chart. */
  byHour: number[];
  peak: PeakHours | null;
  week: WeekSplit | null;
  holds: Hold[];
}

function windowUses(events: readonly EmberEvent[], now: number): EmberEvent[] {
  const from = addDays(now, -(WINDOW_DAYS - 1));
  return events.filter((e) => e.kind === 'use' && e.at >= from && e.at <= now);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** null below MIN_USES uses in the window: too few to propose anything. */
export function patterns(events: readonly EmberEvent[], now: number): Patterns | null {
  const uses = windowUses(events, now);
  if (uses.length < MIN_USES) return null;

  const byHour = Array.from({ length: 24 }, () => 0);
  for (const e of uses) byHour[new Date(e.at).getHours()]! += 1;

  let peak: PeakHours | null = null;
  for (let h = 0; h < 24; h += 1) {
    const count = byHour[h]! + byHour[(h + 1) % 24]!;
    if (!peak || count > peak.count) peak = { from: h, count, total: uses.length };
  }
  // A "peak" holding no more than an even share is not a peak.
  if (peak && peak.count <= (uses.length * 2) / 24) peak = null;

  // Weekdays against weekends, counting only days tracking covered.
  const begun = trackingStart(events);
  let week: WeekSplit | null = null;
  if (begun !== null) {
    const first = Math.max(startOfDay(begun), addDays(now, -(WINDOW_DAYS - 1)));
    let wd = 0; let we = 0; let wdDays = 0; let weDays = 0;
    for (let day = first; day <= now; day = addDays(day, 1)) {
      const dow = new Date(day).getDay();
      const n = uses.filter((e) => e.at >= day && e.at < addDays(day, 1)).length;
      if (dow === 0 || dow === 6) { we += n; weDays += 1; } else { wd += n; wdDays += 1; }
    }
    // Both sides need at least two days, or one odd Saturday decides it.
    if (wdDays >= 2 && weDays >= 2) {
      week = { weekdayPerDay: wd / wdDays, weekendPerDay: we / weDays, weekdayDays: wdDays, weekendDays: weDays };
    }
  }

  // How long a passed craving held: to the next use, within a day. A craving
  // with no use after it yet is still holding and is left out (its hold is
  // unknown, not infinite), as is a "next use" more than a day later.
  const all = events.filter((e) => e.at <= now);
  const samples = new Map<CravingChoice, number[]>();
  for (let i = 0; i < all.length; i += 1) {
    const e = all[i]!;
    if (e.kind !== 'resisted' || e.at < addDays(now, -(WINDOW_DAYS - 1))) continue;
    const next = all.slice(i + 1).find((x) => x.kind === 'use');
    if (!next || next.at - e.at > DAY_MS) continue;
    const c: CravingChoice = e.method ?? 'virtual';
    samples.set(c, [...(samples.get(c) ?? []), next.at - e.at]);
  }
  const holds: Hold[] = [...samples]
    .filter(([, v]) => v.length >= MIN_HOLDS)
    .map(([choice, v]) => ({ choice, medianMs: median(v), samples: v.length }))
    .sort((a, b) => b.medianMs - a.medianMs);

  return { uses: uses.length, byHour, peak, week, holds };
}
