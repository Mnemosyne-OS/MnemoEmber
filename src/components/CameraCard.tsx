/**
 * CameraCard — the switch for the camera watch, and what it is doing now
 * (lib/cameraWatch.ts, doc 139 §5). It says the one thing people need to
 * trust it: what the cartridge receives (moments, never an image).
 */
import { useI18n } from '../i18n/useI18n';
import { useCameraWatch } from '../lib/cameraWatch';
import { formatClock } from '../lib/format';
import { MAX_THRESHOLD, MIN_THRESHOLD } from '../lib/puffJudge';
import type { WatchMeta } from '../lib/types';

export function CameraCard({ watch, onToggle, onThreshold }: {
  watch: WatchMeta;
  onToggle: (on: boolean) => void;
  onThreshold: (n: number) => void;
}) {
  const { t } = useI18n();
  const live = useCameraWatch();
  const answered = watch.yes + watch.no;

  let line: string;
  let tone = '';
  if (!watch.on) line = t('camera.offText');
  else if (live.phase === 'asking') line = t('camera.asking');
  else if (live.phase === 'refused') { line = t('camera.refused', { reason: live.error ?? '' }); tone = 'em-memory-bad'; }
  else if (live.camera !== true) { line = t('camera.cameraOff'); tone = 'em-memory-warn'; }
  else if (live.lastContactAt !== null) { line = t('camera.watchingLast', { time: formatClock(live.lastContactAt), n: live.recent }); tone = 'em-memory-good'; }
  else { line = t('camera.watching'); tone = 'em-memory-good'; }

  return (
    <section className="em-card em-memory" id="em-camera-card">
      <header className="em-card-head">
        <h2 className="em-h2">{t('camera.title')}</h2>
        {answered >= 10 && <span className="em-trend">{t('camera.accuracy', { yes: watch.yes, n: answered })}</span>}
      </header>
      <p className={`em-memory-line ${tone}`}>{line}</p>
      {watch.on && (
        <div className="em-threshold" role="group" aria-label={t('camera.threshold')}>
          <span className="em-muted">{t('camera.threshold')}</span>
          {Array.from({ length: MAX_THRESHOLD - MIN_THRESHOLD + 1 }, (_, i) => MIN_THRESHOLD + i).map((n) => (
            <button key={n} type="button" aria-pressed={n === watch.threshold}
              className={`em-ride-chip em-threshold-chip${n === watch.threshold ? ' em-on em-c-calm' : ''}`} onClick={() => onThreshold(n)}>{n}</button>
          ))}
        </div>
      )}
      <div className="em-memory-actions">
        {watch.on ? (
          <button type="button" className="em-ghost" onClick={() => onToggle(false)}>{t('camera.turnOff')}</button>
        ) : (
          <button type="button" className="em-btn em-btn-calm" onClick={() => onToggle(true)}>{t('camera.turnOn')}</button>
        )}
      </div>
      <p className="em-life-source">{t('camera.privacy')}</p>
    </section>
  );
}

/**
 * CameraPill — the camera watch's state where the eye already is: the header,
 * and the corner of the far view. Field report 2026-10-07: in the far view
 * the card does not exist and near it sits at the bottom of the page, so the
 * person could not find the switch at all. Off, one tap turns it on; on, a
 * tap takes the near view to the card.
 */
export function CameraPill({ watch, onTurnOn, onOpen, big = false }: {
  watch: WatchMeta;
  onTurnOn: () => void;
  onOpen?: () => void;
  big?: boolean;
}) {
  const { t } = useI18n();
  const live = useCameraWatch();
  let label: string;
  let tone: string;
  if (!watch.on) { label = t('camera.pillOff'); tone = 'em-pill-off'; }
  else if (live.phase === 'asking') { label = t('camera.pillAsking'); tone = 'em-pill-wait'; }
  else if (live.phase === 'refused') { label = t('camera.pillRefused'); tone = 'em-pill-bad'; }
  else if (live.camera !== true) { label = t('camera.pillCameraOff'); tone = 'em-pill-wait'; }
  else { label = live.recent > 0 ? t('camera.pillWatchingN', { n: live.recent }) : t('camera.pillWatching'); tone = 'em-pill-on'; }
  const click = !watch.on ? onTurnOn : onOpen;
  return (
    <button type="button" className={`em-pill ${tone}${big ? ' em-pill-big' : ''}`} onClick={click} disabled={!click}
      title={watch.on ? t('camera.title') : t('camera.turnOn')}>
      <span className="em-pill-dot" aria-hidden="true" />
      {label}
    </button>
  );
}

/** The question, shown on top of the day and of the far view. */
export function CameraAlert({ substances, onYes, onNo, onVirtual, big = false }: {
  substances: readonly string[];
  onYes: (substance: string) => void;
  onNo: () => void;
  /** Take a virtual one instead: neither a yes nor a no. */
  onVirtual: () => void;
  big?: boolean;
}) {
  const { t } = useI18n();
  const live = useCameraWatch();
  if (!live.alert) return null;
  return (
    <div className={`em-alert${big ? ' em-alert-big' : ''}`} role="alertdialog" aria-label={t('camera.question')}>
      <div className="em-alert-q">
        <strong className="em-serif">{t('camera.question')}</strong>
        <span>{t('camera.since', { time: formatClock(live.alert.since), n: live.alert.puffs })}</span>
      </div>
      <div className="em-alert-actions">
        {substances.map((s) => (
          <button key={s} type="button" className={`em-pick-btn em-c-${s}`} onClick={() => onYes(s)}>{t(`substance.${s}`)}</button>
        ))}
        <button type="button" className="em-ghost" onClick={onNo}>{t('camera.no')}</button>
      </div>
      <button type="button" className="em-alert-virtual" onClick={onVirtual}>{t('camera.virtual')}</button>
    </div>
  );
}
