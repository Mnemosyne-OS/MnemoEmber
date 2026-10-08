/**
 * WeekBars — the last 7 days as stacked bars, one colour per substance, with
 * the cravings that passed as small calm dots above each bar.
 *
 * A day before tracking started is drawn as an empty dashed slot with no
 * number: it was never measured. A tracked day with nothing is a real 0.
 */
import { useI18n } from '../i18n/useI18n';
import { formatWeekday } from '../lib/format';
import { totalOf, type DaySummary, type WeekTrend } from '../lib/stats';
import { SUBSTANCES } from '../lib/types';

const BAR_H = 120;

export function WeekBars({ days, trend }: { days: DaySummary[]; trend: WeekTrend | null }) {
  const { t } = useI18n();
  const max = Math.max(1, ...days.map((d) => (d.uses ? totalOf(d.uses) : 0)));
  const passed = days.reduce((n, d) => n + (d.resisted ?? 0), 0);

  let trendLine: string | null = null;
  let trendClass = '';
  if (trend) {
    const diff = trend.thisWeek - trend.previousWeek;
    if (diff < 0) { trendLine = t('week.down', { n: -diff }); trendClass = 'em-good'; }
    else if (diff > 0) { trendLine = t('week.up', { n: diff }); trendClass = 'em-warn'; }
    else trendLine = t('week.same');
  }

  return (
    <section className="em-card">
      <header className="em-card-head">
        <h2 className="em-h2">{t('week.title')}</h2>
        {trendLine && <span className={`em-trend ${trendClass}`}>{trendLine}</span>}
      </header>
      <div className="em-week" role="list">
        {days.map((d, i) => {
          const isToday = i === days.length - 1;
          const total = d.uses ? totalOf(d.uses) : null;
          return (
            <div key={d.start} className={`em-week-day${isToday ? ' em-week-today' : ''}`} role="listitem"
              aria-label={total === null ? `${formatWeekday(d.start)}: ${t('week.absent')}` : `${formatWeekday(d.start)}: ${total}`}>
              <div className="em-week-passed" aria-hidden="true">
                {d.resisted !== null && Array.from({ length: Math.min(d.resisted, 6) }, (_, k) => <span key={k} />)}
              </div>
              <div className="em-week-col" style={{ height: BAR_H }}>
                {d.uses === null ? (
                  <div className="em-week-absent" title={t('week.absent')} />
                ) : (
                  <div className="em-week-stack">
                    {SUBSTANCES.map((s) => d.uses![s] > 0 && (
                      <div key={s} className={`em-week-seg em-bg-${s}`} style={{ height: `${(d.uses![s] / max) * BAR_H}px` }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="em-week-num">{total === null ? '—' : total}</div>
              <div className="em-week-label">{formatWeekday(d.start)}</div>
            </div>
          );
        })}
      </div>
      {passed > 0 && <div className="em-week-foot"><span className="em-dot-calm" /> {passed} {t('week.passed')}</div>}
    </section>
  );
}
