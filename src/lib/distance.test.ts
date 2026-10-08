import { describe, expect, it } from 'vitest';
import { nextFar } from './distance';

describe('far view thresholds (same as the host)', () => {
  it('enters below 0.7 and leaves only at 0.78, so the edge does not flicker', () => {
    expect(nextFar(0.72, false)).toBe(false);
    expect(nextFar(0.69, false)).toBe(true);
    expect(nextFar(0.75, true)).toBe(true);
    expect(nextFar(0.78, true)).toBe(false);
  });

  it('an unknown zoom is the normal view, never the far one on a guess', () => {
    expect(nextFar(null, true)).toBe(false);
    expect(nextFar(Number.NaN, false)).toBe(false);
  });
});
