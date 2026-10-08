/**
 * cameraWatch.ts — Ember's side of the camera (doc 139 §5).
 *
 * The host sends hand-to-mouth contacts (`sdk.onMouthWatch`, permission
 * `camera:observe`); puffJudge decides when a rhythm deserves a question; the
 * person answers. Only a "yes" writes anything, and it writes a use exactly
 * like a tap would. "No" writes nothing and raises the personal threshold.
 * No answer writes nothing: an ignored question is never a use.
 *
 * States the screen names: off, asking (the host's permission dialog may be
 * open), refused (with the host's reason), watching with the camera off
 * (Settings › Gestures is the person's own switch, Ember never opens it),
 * and watching.
 */
import { useSyncExternalStore } from 'react';
import { sdk } from './host';
import { log } from './log';
import { afterNo, initialJudge, judgeContact, quietAfterLog, WINDOW_MS, type Contact, type JudgeState } from './puffJudge';
import { getSnapshot, setWatch } from './store';
import type { MnemoMouthSubscription } from '../sdk/mnemo-sdk';

/** A question nobody answered goes away after this long. */
export const ALERT_TTL_MS = 10 * 60_000;

export type WatchPhase = 'off' | 'asking' | 'refused' | 'watching';

export interface CameraWatchState {
  phase: WatchPhase;
  /** Whether the gesture camera is on; null before the host said. */
  camera: boolean | null;
  error: string | null;
  lastContactAt: number | null;
  /** Puffs counted in the current 5-minute window. */
  recent: number;
  /** The open question, or null. */
  alert: { since: number; puffs: number } | null;
}

const initial: CameraWatchState = { phase: 'off', camera: null, error: null, lastContactAt: null, recent: 0, alert: null };
let watch: CameraWatchState = initial;
let judge: JudgeState = initialJudge();
let sub: MnemoMouthSubscription | null = null;
let alertTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish(next: Partial<CameraWatchState>): void {
  watch = { ...watch, ...next };
  listeners.forEach((fn) => fn());
}

export function useCameraWatch(): CameraWatchState {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => watch);
}

function clearAlertTimer(): void {
  if (alertTimer !== null) clearTimeout(alertTimer);
  alertTimer = null;
}

/** Exported for tests: what one contact does. */
export function onContact(c: Contact): void {
  const threshold = getSnapshot().state.watch.threshold;
  const v = judgeContact(judge, c, threshold);
  judge = v.state;
  const recent = judge.puffs.filter((t) => c.at - t <= WINDOW_MS).length;
  publish({ lastContactAt: c.at, recent });
  if (v.alert && watch.alert === null) {
    log.info('camera', 'rhythm seen, asking', { puffs: v.alert.puffs, threshold });
    publish({ alert: v.alert, recent: 0 });
    clearAlertTimer();
    alertTimer = setTimeout(() => { alertTimer = null; publish({ alert: null }); }, ALERT_TTL_MS);
  }
}

/** Subscribe to the host. Safe to call again: the previous one is dropped. */
export function startWatch(): void {
  stopWatch();
  publish({ phase: 'asking', error: null });
  const s = sdk.onMouthWatch({
    contact: onContact,
    onCamera: (on) => publish({ camera: on }),
  });
  sub = s;
  s.ready.then(
    ({ camera }) => { if (sub === s) publish({ phase: 'watching', camera }); },
    (err: unknown) => {
      if (sub !== s) return;
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('camera', 'host refused the observation', { detail: msg });
      sub = null;
      publish({ phase: 'refused', error: msg });
    },
  );
}

export function stopWatch(): void {
  sub?.off();
  sub = null;
  clearAlertTimer();
  judge = initialJudge();
  watch = initial;
  listeners.forEach((fn) => fn());
}

/** The person said yes: the caller logs the use; here, only the bookkeeping. */
export function answerYes(): { since: number } | null {
  const a = watch.alert;
  if (!a) return null;
  clearAlertTimer();
  const w = getSnapshot().state.watch;
  setWatch({ ...w, yes: w.yes + 1 });
  publish({ alert: null });
  return { since: a.since };
}

/** The person said no: nothing is logged, the threshold goes up. */
export function answerNo(): void {
  if (!watch.alert) return;
  clearAlertTimer();
  const w = getSnapshot().state.watch;
  setWatch({ ...w, no: w.no + 1, threshold: afterNo(w.threshold) });
  publish({ alert: null });
}

/**
 * The person chose the virtual one instead of answering (Tony, 2026-10-07).
 * Neither a yes nor a no: nothing is logged, the threshold does not move,
 * and the virtual one logs its own "craving passed" if it is finished.
 */
export function dismissAlert(): void {
  if (!watch.alert) return;
  clearAlertTimer();
  publish({ alert: null });
}

/** A use logged by hand: the judge stays quiet for a while. */
export function noteManualLog(at: number): void {
  judge = quietAfterLog(judge, at);
}

/** Tests only. */
export function __resetWatchForTests(): void {
  clearAlertTimer();
  judge = initialJudge();
  watch = { ...initial, phase: 'watching', camera: true };
}
