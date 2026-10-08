import { describe, expect, it } from 'vitest';
import { patterns } from './patterns';
import { addDays } from './stats';
import type { EmberEvent, Method } from './types';

const H = 3_600_000;
// A Wednesday, so weekdays and weekends both fall inside a 28-day window.
const D0 = new Date(2026, 9, 7, 0, 0, 0, 0).getTime();
const at = (day: number, hour: number): number => addDays(D0, day) + hour * H;
const use = (t: number): EmberEvent => ({ at: t, kind: 'use', substance: 'cigarette' });
const passed = (t: number, method?: Method): EmberEvent =>
  (method ? { at: t, kind: 'resisted', substance: 'cigarette', method } : { at: t, kind: 'resisted', substance: 'cigarette' });

describe('patterns', () => {
  it('nothing below 10 uses: too few to propose a link', () => {
    const events = Array.from({ length: 9 }, (_, i) => use(at(-i, 10)));
    expect(patterns(events, at(0, 23))).toBeNull();
  });

  it('finds the two-hour peak and shows its count against the total', () => {
    const events = [
      ...Array.from({ length: 8 }, (_, i) => use(at(-i, 21) + 10 * 60_000)),
      ...Array.from({ length: 4 }, (_, i) => use(at(-i, 9))),
    ].sort((a, b) => a.at - b.at);
    const p = patterns(events, at(0, 23))!;
    expect(p.peak).toEqual({ from: 20, count: 8, total: 12 });
  });

  it('a flat day has no peak', () => {
    const events = Array.from({ length: 24 }, (_, h) => use(at(-1, h))).concat(Array.from({ length: 24 }, (_, h) => use(at(-2, h))));
    events.sort((a, b) => a.at - b.at);
    expect(patterns(events, at(0, 12))!.peak).toBeNull();
  });

  it('a hold is the time to the next use; a craving still holding is left out', () => {
    const events = [
      ...Array.from({ length: 10 }, (_, i) => use(at(-10 + i, 8))),
      passed(at(-3, 10), 'pushups'), use(at(-3, 12)),
      passed(at(-2, 10), 'pushups'), use(at(-2, 11)),
      passed(at(-1, 10), 'pushups'), use(at(-1, 13)),
      passed(at(0, 10), 'pushups'),
    ].sort((a, b) => a.at - b.at);
    const p = patterns(events, at(0, 20))!;
    expect(p.holds).toEqual([{ choice: 'pushups', medianMs: 2 * H, samples: 3 }]);
  });

  it('a method with fewer than 3 samples shows no hold', () => {
    const events = [
      ...Array.from({ length: 10 }, (_, i) => use(at(-10 + i, 8))),
      passed(at(-2, 10)), use(at(-2, 11)),
    ].sort((a, b) => a.at - b.at);
    expect(patterns(events, at(0, 20))!.holds).toEqual([]);
  });
});
