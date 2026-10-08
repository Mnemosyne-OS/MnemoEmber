import { describe, expect, it } from 'vitest';
import { hydrate, packEvent, serialise, unpackEvent } from './codec';
import { emptyMemory, emptyState, type EmberEvent } from './types';

describe('codec', () => {
  it('keeps the statuses the vault refused to forget, and reads an older save as none', () => {
    const memory = { ...emptyMemory(), on: true, statusId: 9, staleStatusIds: [4, 5] };
    expect(hydrate(serialise({ ...emptyState(), memory })).state.memory.staleStatusIds).toEqual([4, 5]);
    const older = serialise({ ...emptyState(), memory: { ...emptyMemory(), statusId: 9 } });
    delete (older.memory as Record<string, unknown>).staleStatusIds;
    expect(hydrate(older).state.memory.staleStatusIds).toEqual([]);
    // Unreadable entries, duplicates and the live status itself are not stale ids.
    const odd = serialise({ ...emptyState(), memory: { ...memory, staleStatusIds: [4, 4, -1, 9, 'x' as unknown as number] } });
    expect(hydrate(odd).state.memory.staleStatusIds).toEqual([4]);
  });

  it('round-trips every kind and substance, to the second', () => {
    const events: EmberEvent[] = [
      { at: 1_790_000_000_000, kind: 'use', substance: 'cigarette' },
      { at: 1_790_000_060_000, kind: 'resisted', substance: 'vape' },
      { at: 1_790_000_120_000, kind: 'use', substance: 'joint' },
    ];
    for (const e of events) expect(unpackEvent(packEvent(e))).toEqual(e);
  });

  it('nothing stored is fresh, a foreign blob is unreadable (never fresh)', () => {
    expect(hydrate(null).outcome).toBe('fresh');
    expect(hydrate({ something: 'else' }).outcome).toBe('unreadable');
    expect(hydrate({ version: 99, substances: [], events: [] }).outcome).toBe('unreadable');
  });

  it('keeps the readable events of a readable blob and counts the rest', () => {
    const blob = serialise({ substances: ['vape', 'cigarette'], events: [{ at: 1_790_000_000_000, kind: 'use', substance: 'vape' }] });
    (blob.events as unknown[]).push('nonsense!', 42);
    const h = hydrate(blob);
    expect(h.outcome).toBe('read');
    expect(h.dropped).toBe(2);
    expect(h.state.events).toHaveLength(1);
    // Substances come back in display order whatever order they were saved in.
    expect(h.state.substances).toEqual(['cigarette', 'vape']);
  });
});

describe('codec: how a craving passed', () => {
  it('round-trips every method, and an event without one stays the virtual one', () => {
    for (const method of ['breathing', 'pushups', 'squats', 'stretching', 'walk', 'water'] as const) {
      const e: EmberEvent = { at: 1_790_000_000_000, kind: 'resisted', substance: 'joint', method };
      expect(unpackEvent(packEvent(e))).toEqual(e);
    }
    expect(unpackEvent('tq3k1aC')).toEqual({ at: parseInt('tq3k1a', 36) * 1000, kind: 'resisted', substance: 'cigarette' });
  });

  it('a use whose base-36 time ends in a method letter is still a use', () => {
    // "…b" + "c": lowercase then lowercase, never read as a method.
    expect(unpackEvent('tq3k1bc')?.kind).toBe('use');
    expect(unpackEvent('tq3k1bc')?.method).toBeUndefined();
  });
});
