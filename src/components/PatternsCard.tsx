/**
 * PatternsCard — the links Ember draws from the person's own log
 * (lib/patterns.ts). Each line carries the count it rests on (doc 82: the
 * machine proposes, it never concludes). Hidden entirely below 10 uses.
 */
import { useI18n } from '../i18n/useI18n';
import { formatDuration } from '../lib/format';
import type { Patterns } from '../lib/patterns';
import { WINDOW_DAYS } from '../lib/patterns';

const hh = (h: number): string => `${String(h % 24).padStart(2, '0')}:00`;

export function PatternsCard({ p }: { p: Patterns }) {
  const { t } = useI18n();
  const max = Math.max(1, ...p.byHour);
  const inPeak = (h: number) => p.peak !== null && (h === p.peak.from || h === (p.peak.from + 1) % 24);
  return (
    <section className="em-card">
      <header className="em-card-head">
        <h2 className="em-h2">{t('patterns.title')}</h2>
        <span className="em-trend">{t('patterns.window', { days: WINDOW_DAYS, n: p.uses })}</span>
      </header>

      <div className="em-hours" aria-hidden="true">
        {p.byHour.map((n, h) => (
          <div key={h} className="em-hour">
            <div className={`em-hour-bar${inPeak(h) ? ' em-hour-peak' : ''}`} style={{ height: `${(n / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="em-hours-axis" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>

      <ul className="em-facts em-patterns">
        {p.peak && (
          <li>{t('patterns.peak', { from: hh(p.peak.from), to: hh(p.peak.from + 2), n: p.peak.count, total: p.peak.total })}</li>
        )}
        {p.week && (
          <li>{t('patterns.week', {
            wd: p.week.weekdayPerDay.toFixed(1), we: p.week.weekendPerDay.toFixed(1),
            wdDays: p.week.weekdayDays, weDays: p.week.weekendDays,
          })}</li>
        )}
        {p.holds.length > 0 && (
          <li className="em-patterns-holds">
            <span>{t('patterns.holdsTitle')}</span>
            {p.holds.map((h) => (
              <span key={h.choice} className="em-chip em-c-calm">
                {t(`method.${h.choice}`)} · {formatDuration(h.medianMs)} <small>({t('patterns.times', { n: h.samples })})</small>
              </span>
            ))}
          </li>
        )}
      </ul>
      <p className="em-life-source">{t('patterns.note')}</p>
    </section>
  );
}
