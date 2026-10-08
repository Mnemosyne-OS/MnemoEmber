/**
 * log.ts — one tagged logger (same shape as MnemoLingua's).
 *
 * Log MEASURED facts, never intentions. ⛔ Never log an event list: the
 * console is a place people paste from, and this is health data.
 */

const TAG = '[mnemo-ember]';
const started = Date.now();

function stamp(): string {
  return `+${((Date.now() - started) / 1000).toFixed(1)}s`;
}

export const log = {
  info(scope: string, message: string, facts?: Record<string, unknown>): void {
    console.log(`${TAG} ${stamp()} ${scope}: ${message}`, facts ?? '');
  },
  warn(scope: string, message: string, facts?: Record<string, unknown>): void {
    console.warn(`${TAG} ${stamp()} ${scope}: ${message}`, facts ?? '');
  },
  error(scope: string, message: string, facts?: Record<string, unknown>): void {
    console.error(`${TAG} ${stamp()} ${scope}: ${message}`, facts ?? '');
  },
};
