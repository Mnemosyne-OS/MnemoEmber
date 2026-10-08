import { beforeEach, describe, expect, it } from 'vitest';
import { __resetWatchForTests, answerNo, answerYes, dismissAlert, noteManualLog, onContact } from './cameraWatch';
import { __setForTests, getSnapshot } from './store';
import { emptyMemory, emptyWatch } from './types';

const S = 1000;

describe('camera watch', () => {
  beforeEach(() => {
    __setForTests({ state: { substances: ['cigarette'], events: [], memory: emptyMemory(), watch: { ...emptyWatch(), on: true } } });
    __resetWatchForTests();
  });

  const rhythm = (start: number) => [0, 30, 60].forEach((x) => onContact({ at: start + x * S, ms: 1500 }));

  it('a "yes" answers once and counts, and never writes a use by itself', () => {
    rhythm(0);
    const a = answerYes();
    expect(a).toEqual({ since: 0 });
    expect(answerYes()).toBeNull();
    expect(getSnapshot().state.watch.yes).toBe(1);
    expect(getSnapshot().state.events).toEqual([]);
  });

  it('a "no" writes nothing and raises the threshold', () => {
    rhythm(0);
    answerNo();
    const w = getSnapshot().state.watch;
    expect(w.no).toBe(1);
    expect(w.threshold).toBe(4);
    expect(getSnapshot().state.events).toEqual([]);
  });

  it('after a use logged by hand, the same rhythm does not ask', () => {
    noteManualLog(0);
    rhythm(10 * S);
    expect(answerYes()).toBeNull();
  });
});

describe('camera watch: the virtual one instead', () => {
  beforeEach(() => {
    __setForTests({ state: { substances: ['cigarette'], events: [], memory: emptyMemory(), watch: { ...emptyWatch(), on: true } } });
    __resetWatchForTests();
  });

  it('closes the question without a yes or a no, and logs nothing', () => {
    [0, 30, 60].forEach((x) => onContact({ at: x * 1000, ms: 1500 }));
    dismissAlert();
    const w = getSnapshot().state.watch;
    expect([w.yes, w.no, w.threshold]).toEqual([0, 0, 3]);
    expect(getSnapshot().state.events).toEqual([]);
    expect(answerYes()).toBeNull();
  });
});
