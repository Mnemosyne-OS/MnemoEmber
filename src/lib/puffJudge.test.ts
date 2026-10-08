import { describe, expect, it } from 'vitest';
import { afterNo, initialJudge, judgeContact, MAX_THRESHOLD, quietAfterLog, QUIET_MS, type JudgeState } from './puffJudge';

const S = 1000;
const feed = (times: number[], threshold = 3, start: JudgeState = initialJudge()) => {
  let s = start;
  const alerts: { since: number; puffs: number }[] = [];
  for (const at of times) {
    const v = judgeContact(s, { at, ms: 1500 }, threshold);
    s = v.state;
    if (v.alert) alerts.push(v.alert);
  }
  return { s, alerts };
};

describe('puff judge', () => {
  it('three puffs 30 s apart ask once, dated from the first puff', () => {
    expect(feed([0, 30 * S, 60 * S]).alerts).toEqual([{ since: 0, puffs: 3 }]);
  });

  it('contacts closer than 8 s are one puff seen twice', () => {
    expect(feed([0, 3 * S, 6 * S]).alerts).toEqual([]);
  });

  it('puffs spread over more than 5 minutes are not a rhythm', () => {
    expect(feed([0, 3 * 60 * S, 6 * 60 * S]).alerts).toEqual([]);
  });

  it('after an alert, the same cigarette does not ask again', () => {
    const times = [0, 30, 60, 90, 120, 150, 180].map((x) => x * S);
    expect(feed(times).alerts).toHaveLength(1);
  });

  it('after a use logged by hand, the judge stays quiet', () => {
    const quiet = quietAfterLog(initialJudge(), 0);
    expect(feed([10 * S, 40 * S, 70 * S], 3, quiet).alerts).toEqual([]);
    expect(feed([QUIET_MS + 10 * S, QUIET_MS + 40 * S, QUIET_MS + 70 * S], 3, quiet).alerts).toHaveLength(1);
  });

  it('a "No" raises the threshold, never past the ceiling', () => {
    expect(afterNo(3)).toBe(4);
    expect(afterNo(MAX_THRESHOLD)).toBe(MAX_THRESHOLD);
  });
});
