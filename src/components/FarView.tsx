/**
 * FarView — what Ember draws when the board is zoomed out (lib/distance.ts).
 *
 * At 40 % zoom a 16 px label is 6 px on screen. So this view keeps ONE thing
 * to read and ONE thing to do, both sized to the window, never to the text
 * scale:
 *  - the dial, filling the window, with the time since the last one;
 *  - today's count;
 *  - a big "+1" to log a use from across the board. With several substances
 *    it opens big substance buttons in place, then closes.
 *
 * Sizes are in `cqmin` (container query units) so they follow the WINDOW the
 * person resized, not the viewport.
 */
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import type { EmberEvent, Substance } from '../lib/types';
import { DayDial } from './DayDial';
import { SubstanceIcon } from './SubstanceIcon';

export function FarView({ events, now, sinceLast, today, substances, onLog, onVirtual }: {
  events: EmberEvent[];
  now: number;
  sinceLast: number | null;
  /** null = nothing ever tracked: shown as a dash, never a 0. */
  today: number | null;
  substances: Substance[];
  onLog: (s: Substance) => void;
  /** Open the virtual one (the offer made before every log). */
  onVirtual: () => void;
}) {
  const { t } = useI18n();
  // +1 first offers a virtual one (Tony, 2026-10-07), then logs.
  const [stage, setStage] = useState<'idle' | 'offer' | 'pick'>('idle');

  const log = (s: Substance) => { setStage('idle'); onLog(s); };

  return (
    <div className="em-far">
      <div className="em-far-dial">
        <DayDial events={events} now={now} sinceLast={sinceLast} fluid />
      </div>
      <div className="em-far-side">
        <div className="em-far-today">
          <span className="em-far-num">{today ?? '—'}</span>
          <span className="em-far-label">{t('today.label')}</span>
        </div>
        {stage === 'offer' ? (
          <div className="em-far-offer" role="group" aria-label={t('offer.question')}>
            <div className="em-far-offer-q">{t('offer.question')}</div>
            <div className="em-far-offer-row">
              <button type="button" className="em-far-offer-yes" onClick={() => { setStage('idle'); onVirtual(); }}>{t('offer.yes')}</button>
              <button type="button" className="em-far-offer-no"
                onClick={() => (substances.length === 1 ? log(substances[0]!) : setStage('pick'))}>{t('offer.no')}</button>
            </div>
          </div>
        ) : stage === 'pick' ? (
          <div className="em-far-pick" role="group" aria-label={t('log.which')}>
            {substances.map((s) => (
              <button key={s} type="button" className={`em-far-pick-btn em-c-${s}`} onClick={() => log(s)} aria-label={t(`substance.${s}`)}>
                <SubstanceIcon substance={s} size={48} />
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="em-far-plus" aria-label={t('action.log')}
            onClick={() => setStage('offer')}>
            +1
          </button>
        )}
      </div>
    </div>
  );
}
