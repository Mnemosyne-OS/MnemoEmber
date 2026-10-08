/**
 * TodayLog — today's events, newest first, each removable. A mistaken tap must
 * cost one click to fix, otherwise people stop trusting their own numbers.
 */
import { useI18n } from '../i18n/useI18n';
import { formatClock } from '../lib/format';
import { eventKey, type EmberEvent } from '../lib/types';
import { MethodIcon } from './RideItOut';
import { SubstanceIcon } from './SubstanceIcon';

export function TodayLog({ events, onRemove }: { events: EmberEvent[]; onRemove: (e: EmberEvent) => void }) {
  const { t } = useI18n();
  const newestFirst = [...events].reverse();
  return (
    <section className="em-card">
      <header className="em-card-head"><h2 className="em-h2">{t('history.title')}</h2></header>
      {newestFirst.length === 0 ? (
        <p className="em-muted">{t('history.empty')}</p>
      ) : (
        <ul className="em-log">
          {newestFirst.map((e) => (
            <li key={eventKey(e)} className={e.kind === 'resisted' ? 'em-log-passed' : ''}>
              <span className="em-log-time">{formatClock(e.at)}</span>
              <span className={`em-log-icon ${e.kind === 'resisted' ? 'em-c-calm' : `em-c-${e.substance}`}`}>
                {e.kind === 'use' ? <SubstanceIcon substance={e.substance} size={18} /> : <MethodIcon method={e.method ?? 'virtual'} size={18} />}
              </span>
              <span className="em-log-what">{e.kind === 'use' ? t(`substance.${e.substance}`) : t('history.passedBy', { how: t(`method.${e.method ?? 'virtual'}`) })}</span>
              <button type="button" className="em-log-remove" onClick={() => onRemove(e)} aria-label={t('history.remove')} title={t('history.remove')}>×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
