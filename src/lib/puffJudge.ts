/**
 * puffJudge.ts — from hand-to-mouth contacts to "are you smoking?" (doc 139
 * §5.3-§5.6). Pure. The host is the sensor (mouthWatch.ts); this is the judge,
 * and the person has the last word.
 *
 * We look for a RHYTHM, not an object: several contacts, spaced like puffs,
 * within a few minutes. A coffee is two or three sips; a thoughtful chin is
 * one long contact the host already drops.
 *
 * The threshold is personal. It starts at 3 contacts in 5 minutes. Each "No"
 * raises it by one (up to 6): the person is telling us their gestures look
 * like puffs when they are not. A "Yes" never lowers it on its own; the
 * person can lower it on the card.
 *
 * After an alert, or after the person logged a use by hand, the judge stays
 * quiet for 15 minutes: one cigarette asks once.
 */

export const WINDOW_MS = 5 * 60_000;
/** Two contacts closer than this are one puff seen twice. */
export const MIN_GAP_MS = 8_000;
export const QUIET_MS = 15 * 60_000;
export const DEFAULT_THRESHOLD = 3;
export const MIN_THRESHOLD = 2;
export const MAX_THRESHOLD = 6;

export interface Contact { at: number; ms: number }

export interface JudgeState {
  /** Puffs counted in the current window, oldest first (start times). */
  puffs: number[];
  /** No alert before this instant. */
  quietUntil: number;
}

export function initialJudge(): JudgeState {
  return { puffs: [], quietUntil: 0 };
}

export interface Verdict {
  state: JudgeState;
  /** Set when this contact completed a rhythm: the first puff's time and the count. */
  alert: { since: number; puffs: number } | null;
}

export function judgeContact(s: JudgeState, c: Contact, threshold: number): Verdict {
  const puffs = s.puffs.filter((t) => c.at - t <= WINDOW_MS);
  const last = puffs[puffs.length - 1];
  if (last === undefined || c.at - last >= MIN_GAP_MS) puffs.push(c.at);
  if (c.at < s.quietUntil || puffs.length < threshold) return { state: { ...s, puffs }, alert: null };
  return {
    state: { puffs: [], quietUntil: c.at + QUIET_MS },
    alert: { since: puffs[0]!, puffs: puffs.length },
  };
}

/** The person logged a use by hand: no need to ask for a while. */
export function quietAfterLog(s: JudgeState, at: number): JudgeState {
  return { puffs: [], quietUntil: Math.max(s.quietUntil, at + QUIET_MS) };
}

export function clampThreshold(n: number): number {
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.round(n)));
}

/** A "No": the gestures looked like puffs and were not. */
export function afterNo(threshold: number): number {
  return clampThreshold(threshold + 1);
}
