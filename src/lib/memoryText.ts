/**
 * memoryText.ts — the texts Ember writes into memory, pure (doc 139 §3-§4).
 *
 * The chat answers "how am I doing?" from these. So every number in them is
 * computed here by lib/stats, and the model only puts them into sentences
 * (§4: the cartridge counts, the model never does).
 *
 * Two kinds of text:
 *  - a DAY DIGEST, one per finished day, written once and never rewritten;
 *  - one STATUS, rewritten when something changes (today so far, the last
 *    seven days, the totals since tracking began).
 *
 * Plain English, absolute dates and clock times: a chronicle is read days
 * later, so "an hour ago" would be false by then. A day before tracking is
 * never described as a day with zero uses.
 */
import { formatDuration } from './format';
import { addDays, lastWeek, longestGap, startOfDay, summariseDay, totalOf, totals, weekTrend, type Counts } from './stats';
import type { EmberEvent, Method } from './types';

/** The spine every Ember chronicle is filed under. */
export const EMBER_SPINE = 'HABIT_LOG';

const METHOD_WORDS: Record<Method | 'virtual', string> = {
  virtual: 'virtual cigarette',
  breathing: 'box breathing',
  pushups: 'push-ups',
  squats: 'squats',
  stretching: 'stretching',
  walk: 'a short walk',
  water: 'a glass of water',
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function countsLine(c: Counts): string {
  return `${plural(c.cigarette, 'cigarette', 'cigarettes')}, ${plural(c.vape, 'vape', 'vapes')}, ${plural(c.joint, 'joint', 'joints')} (${totalOf(c)} in total)`;
}

function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Local calendar day as YYYY-MM-DD: the key a digest is written under. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function passedLine(dayEvents: readonly EmberEvent[]): string {
  const passed = dayEvents.filter((e) => e.kind === 'resisted');
  if (passed.length === 0) return 'Cravings that passed without using: none.';
  const by = new Map<string, number>();
  for (const e of passed) {
    const w = METHOD_WORDS[e.method ?? 'virtual'];
    by.set(w, (by.get(w) ?? 0) + 1);
  }
  const detail = [...by].map(([w, n]) => `${w} ${n}`).join(', ');
  return `Cravings that passed without using: ${passed.length} (${detail}).`;
}

/**
 * One finished day. null when the day was never tracked: an untracked day is
 * not "zero cigarettes", and writing it as such would teach the chat a lie.
 */
export function dayDigest(events: readonly EmberEvent[], dayStart: number): string | null {
  const day = summariseDay(events, dayStart);
  if (day.uses === null) return null;
  const end = addDays(dayStart, 1);
  const inDay = events.filter((e) => e.at >= dayStart && e.at < end);
  const lines = [
    `Ember log for ${longDate(dayStart)}. A daily record of tobacco and cannabis use, logged by the person in the Ember cartridge.`,
    `Uses that day: ${countsLine(day.uses)}.`,
    passedLine(inDay),
  ];
  const uses = inDay.filter((e) => e.kind === 'use');
  if (uses.length > 0) lines.push(`Times of use: ${uses.map((e) => `${clock(e.at)} ${e.substance}`).join(', ')}.`);
  return lines.join('\n');
}

/**
 * The rolling status. `now` only appears as a date and a clock time, never as
 * "ago". null when nothing was ever logged.
 */
export function statusText(events: readonly EmberEvent[], now: number): string | null {
  const all = totals(events, now);
  if (!all) return null;
  const today = summariseDay(events, startOfDay(now));
  const inToday = events.filter((e) => e.at >= startOfDay(now) && e.at <= now);
  const lines = [
    `Ember status as of ${longDate(now)}, ${clock(now)}. Current summary of the person's tobacco and cannabis use, logged in the Ember cartridge.`,
  ];
  if (today.uses) lines.push(`Today so far: ${countsLine(today.uses)}. ${passedLine(inToday)}`);
  const lastUse = [...events].reverse().find((e) => e.kind === 'use' && e.at <= now);
  if (lastUse) lines.push(`Last use: ${lastUse.substance} at ${clock(lastUse.at)} on ${longDate(lastUse.at)}.`);
  // Only a FINISHED stretch: one still running grows every minute, so writing
  // it would rewrite the status on every pass. "Last use at HH:MM" already
  // lets the chat work out the running one.
  const gap = longestGap(events, now);
  if (gap && !gap.ongoing) lines.push(`Longest stretch without using in the last 7 days: ${formatDuration(gap.ms)}.`);
  const week = lastWeek(events, now)
    .filter((d) => d.uses !== null)
    .map((d) => `${new Date(d.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${totalOf(d.uses!)} uses, ${d.resisted} cravings passed`);
  if (week.length > 0) lines.push(`Last 7 days: ${week.join('; ')}.`);
  const trend = weekTrend(events, now);
  if (trend) lines.push(`Uses in the last 7 days: ${trend.thisWeek}, against ${trend.previousWeek} in the 7 days before.`);
  const since = new Date(all.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  lines.push(`Since tracking began on ${since} (${all.days} days): ${countsLine(all.uses)}, ${all.perDay.toFixed(1)} per day on average, ${plural(all.passed, 'craving', 'cravings')} passed without using.`);
  if (all.uses.cigarette > 0 || all.lifeSavedMs > 0) {
    lines.push(`Estimated life time, at about 20 minutes per cigarette (UCL study, 2024; an average, not a fact about this person, cigarettes only): ${formatDuration(all.lifeLostMs)} lost to the cigarettes logged, ${formatDuration(all.lifeSavedMs)} kept by cigarette cravings that passed.`);
  }
  return lines.join('\n');
}

/** The status without its first line, to tell whether anything changed. */
export function statusBody(text: string): string {
  const nl = text.indexOf('\n');
  return nl < 0 ? '' : text.slice(nl + 1);
}
