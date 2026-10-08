/**
 * TotalsCard — everything since tracking began, and the life-time estimate.
 *
 * Life lost and life kept are an AVERAGE from a published study (stats.ts
 * LIFE_MIN_PER_CIGARETTE), so the card says so in its own footnote. Each
 * number shows only when it has something to count: no cigarette ever logged
 * = no "life lost" line, not a "0 min".
 */
import { useI18n } from '../i18n/useI18n';
import { formatDuration } from '../lib/format';
import type { Totals } from '../lib/stats';
import { SUBSTANCES, type Substance } from '../lib/types';
import { SubstanceIcon } from './SubstanceIcon';

export function TotalsCard({ totals, substances }: { totals: Totals; substances: Substance[] }) {
  const { t } = useI18n();
  const date = new Date(totals.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  // A substance the person no longer declares still counts if it was logged.
  const shown = SUBSTANCES.filter((s) => substances.includes(s) || totals.uses[s] > 0);
  return (
    <section className="em-card">
      <header className="em-card-head">
        <h2 className="em-h2">{t('totals.title', { date })}</h2>
        <span className="em-trend">{t('totals.days', { n: totals.days })} · {t('totals.perDay', { n: totals.perDay.toFixed(1) })}</span>
      </header>

      <div className="em-totals">
        {shown.map((s) => (
          <div key={s} className={`em-total em-c-${s}`}>
            <SubstanceIcon substance={s} size={22} />
            <span className="em-total-num">{totals.uses[s]}</span>
            <span className="em-total-label">{t(`substance.${s}`)}</span>
          </div>
        ))}
        <div className="em-total em-c-calm">
          <span className="em-dot-calm em-total-dot" />
          <span className="em-total-num">{totals.passed}</span>
          <span className="em-total-label">{t('totals.passed')}</span>
        </div>
      </div>

      {(totals.lifeLostMs > 0 || totals.lifeSavedMs > 0) && (
        <div className="em-life">
          {totals.lifeLostMs > 0 && (
            <div className="em-life-row em-life-lost">
              <span className="em-life-num">{formatDuration(totals.lifeLostMs)}</span>
              <span className="em-life-label">{t('totals.lost')}</span>
            </div>
          )}
          {totals.lifeSavedMs > 0 && (
            <div className="em-life-row em-life-saved">
              <span className="em-life-num">+{formatDuration(totals.lifeSavedMs)}</span>
              <span className="em-life-label">{t('totals.saved')}</span>
            </div>
          )}
          <p className="em-life-source">{t('totals.source')}</p>
        </div>
      )}
    </section>
  );
}
