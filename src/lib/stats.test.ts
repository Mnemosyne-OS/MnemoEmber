import { describe, expect, it } from 'vitest';
import { lastWeek, longestGap, sinceLastUse, summariseDay, totals, favouriteChoice, weekTrend, yesterdayByNow, addDays, startOfDay } from './stats';
import type { EmberEvent } from './types';

const H = 3_600_000;
// A fixed local day so the tests never depend on when vitest runs.
const D0 = new Date(2026, 9, 7, 0, 0, 0, 0).getTime();
const at = (dayOffset: number, hour: number): number => addDays(D0, dayOffset) + hour * H;
const use = (t: number, substance: EmberEvent['substance'] = 'cigarette'): EmberEvent => ({ at: t, kind: 'use', substance });
const passed = (t: number): EmberEvent => ({ at: t, kind: 'resisted', substance: 'cigarette' });

describe('absent is not zero', () => {
  it('a day before the first event is unmeasured, a tracked empty day is a real 0', () => {
    const events = [use(at(0, 9))];
    expect(summariseDay(events, addDays(D0, -1)).uses).toBeNull();
    const tomorrow = summariseDay(events, addDays(D0, 1));
    expect(tomorrow.uses).toEqual({ cigarette: 0, vape: 0, joint: 0 });
    expect(tomorrow.resisted).toBe(0);
  });

  it('nothing ever logged: no day is measured and there is no "since last"', () => {
    expect(summariseDay([], D0).uses).toBeNull();
    expect(sinceLastUse([], at(0, 12))).toBeNull();
  });

  it('yesterday is only compared once tracking existed before today', () => {
    expect(yesterdayByNow([use(at(0, 9))], at(0, 15))).toBeNull();
    const events = [use(at(-1, 8)), use(at(-1, 14)), use(at(-1, 20)), use(at(0, 9))];
    // By 15:00 yesterday there were two, not three.
    expect(yesterdayByNow(events, at(0, 15))).toBe(2);
  });

  it('a measured zero yesterday stays a zero, not an absence', () => {
    const events = [use(at(-2, 9)), use(at(0, 9))];
    expect(yesterdayByNow(events, at(0, 15))).toBe(0);
  });
});

describe('counts', () => {
  it('splits uses by substance and counts passed cravings apart', () => {
    const events = [use(at(0, 8)), use(at(0, 10), 'vape'), passed(at(0, 11)), use(at(0, 13), 'joint'), use(at(1, 1))];
    const day = summariseDay(events, D0);
    expect(day.uses).toEqual({ cigarette: 1, vape: 1, joint: 1 });
    expect(day.resisted).toBe(1);
  });

  it('time since the last USE ignores a craving that passed after it', () => {
    const events = [use(at(0, 9)), passed(at(0, 11))];
    expect(sinceLastUse(events, at(0, 12))).toBe(3 * H);
  });
});

describe('longest stretch', () => {
  it('finds the longest gap and says when it is the one still running', () => {
    const events = [use(at(0, 8)), use(at(0, 9)), use(at(0, 12))];
    expect(longestGap(events, at(0, 13))).toEqual({ ms: 3 * H, ongoing: false });
    expect(longestGap(events, at(0, 18))).toEqual({ ms: 6 * H, ongoing: true });
  });

  it('a gap reaching into the window is cut at the window edge, never at the first event', () => {
    const now = at(0, 12);
    const events = [use(at(-20, 9)), use(at(0, 11))];
    const g = longestGap(events, now, 7)!;
    expect(g.ms).toBe(at(0, 11) - addDays(now, -6));
  });

  it('no use at all: no stretch', () => {
    expect(longestGap([passed(at(0, 9))], at(0, 12))).toBeNull();
  });
});

describe('the week', () => {
  it('seven days, today last, days before tracking unmeasured', () => {
    const week = lastWeek([use(at(-2, 9))], at(0, 12));
    expect(week).toHaveLength(7);
    expect(week[6]!.start).toBe(startOfDay(at(0, 12)));
    expect(week[3]!.uses).toBeNull();
    expect(week[4]!.uses?.cigarette).toBe(1);
  });

  it('no trend until both weeks were fully tracked', () => {
    expect(weekTrend([use(at(-10, 9)), use(at(0, 9))], at(0, 12))).toBeNull();
    const events = [use(at(-13, 9)), use(at(-12, 9)), use(at(-3, 9))];
    expect(weekTrend(events, at(0, 12))).toEqual({ thisWeek: 1, previousWeek: 2 });
  });
});

describe('totals and life time', () => {
  it('counts since the first day, today included, and converts cigarettes only', () => {
    const events: EmberEvent[] = [
      use(at(-2, 9)), use(at(-2, 12)), use(at(-1, 9), 'vape'), use(at(0, 9), 'joint'),
      passed(at(0, 10)), { at: at(0, 11), kind: 'resisted', substance: 'vape', method: 'pushups' },
    ];
    const t = totals(events, at(0, 12))!;
    expect(t.days).toBe(3);
    expect(t.uses).toEqual({ cigarette: 2, vape: 1, joint: 1 });
    expect(t.passed).toBe(2);
    expect(t.perDay).toBeCloseTo(4 / 3);
    // 2 cigarettes lost, 1 cigarette craving passed; the vape one converts to nothing.
    expect(t.lifeLostMs).toBe(2 * 20 * 60_000);
    expect(t.lifeSavedMs).toBe(1 * 20 * 60_000);
  });

  it('nothing logged: no totals at all, not a row of zeros', () => {
    expect(totals([], at(0, 12))).toBeNull();
  });
});

describe('the usual way, for the centre of the sheet', () => {
  const how = (t: number, method?: 'pushups' | 'breathing'): EmberEvent =>
    (method ? { at: t, kind: 'resisted', substance: 'cigarette', method } : { at: t, kind: 'resisted', substance: 'cigarette' });

  it('the most used in the last 30 days, the virtual one counting as its own way', () => {
    const events = [how(at(-3, 9), 'pushups'), how(at(-2, 9), 'pushups'), how(at(-1, 9)), use(at(0, 8))];
    expect(favouriteChoice(events, at(0, 12))).toBe('pushups');
  });

  it('a tie goes to the most recent, and older than 30 days does not count', () => {
    const events = [how(at(-40, 9), 'breathing'), how(at(-40, 10), 'breathing'), how(at(-5, 9), 'breathing'), how(at(-1, 9), 'pushups')];
    expect(favouriteChoice(events, at(0, 12))).toBe('pushups');
  });

  it('no craving passed lately: no favourite', () => {
    expect(favouriteChoice([use(at(0, 9))], at(0, 12))).toBeNull();
  });
});
