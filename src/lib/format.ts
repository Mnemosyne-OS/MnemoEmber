/**
 * format.ts — durations and clock times as the screen prints them.
 */
import { translate as t } from '../i18n/useI18n';
import { splitDuration } from './stats';

export function formatDuration(ms: number): string {
  if (ms < 60_000) return t('dur.underMinute');
  const { days, hours, minutes } = splitDuration(ms);
  if (days > 0) return t('dur.dh', { d: days, h: hours });
  if (hours > 0) return t('dur.hm', { h: hours, m: minutes });
  return t('dur.minutes', { m: minutes });
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatWeekday(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short' });
}
