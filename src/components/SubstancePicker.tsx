/**
 * SubstancePicker — first run ("What do you use?") and the settings sheet.
 * Big cards, several can be on. Nothing is saved until the button is pressed.
 */
import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { SUBSTANCES, type Substance } from '../lib/types';
import { SubstanceIcon } from './SubstanceIcon';

export function SubstancePicker({ initial, firstRun, onSave }: { initial: Substance[]; firstRun: boolean; onSave: (s: Substance[]) => void }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<Substance[]>(initial);
  const toggle = (s: Substance) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : SUBSTANCES.filter((x) => x === s || p.includes(x))));
  return (
    <div className="em-setup">
      {firstRun && <div className="em-setup-mark" aria-hidden="true"><span /></div>}
      <h1 className="em-serif em-setup-title">{t('setup.title')}</h1>
      <p className="em-muted">{t('setup.hint')}</p>
      <div className="em-choose-row">
        {SUBSTANCES.map((s) => (
          <button key={s} type="button" aria-pressed={picked.includes(s)}
            className={`em-choose-card em-c-${s}${picked.includes(s) ? ' em-on' : ''}`} onClick={() => toggle(s)}>
            <SubstanceIcon substance={s} size={44} />
            <span>{t(`substance.${s}`)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="em-btn em-btn-ember" disabled={picked.length === 0} onClick={() => onSave(picked)}>
        {firstRun ? t('setup.start') : t('setup.done')}
      </button>
    </div>
  );
}
