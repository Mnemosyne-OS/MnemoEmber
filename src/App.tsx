/**
 * App — Ember's one screen: the day dial, today's numbers, two actions, the
 * week, today's log. The virtual smoke opens over it.
 *
 * Every number comes from lib/stats (doc 139 §4). The screen prints nothing
 * it did not measure: no comparison with a day that was never tracked, no
 * trend without two full weeks, no "0 min since" before a first use.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useI18n } from './i18n/useI18n';
import { formatClock, formatDuration } from './lib/format';
import { lastWeek, longestGap, sinceLastUse, startOfDay, summariseDay, totalOf, totals, weekTrend, yesterdayByNow, favouriteChoice } from './lib/stats';
import { addEvent, getSnapshot, load, removeEvent, setSubstances, setWatch, subscribe } from './lib/store';
import type { EmberEvent, Method, Substance } from './lib/types';
import { DayDial } from './components/DayDial';
import { FarView } from './components/FarView';
import { useFar } from './lib/distance';
import { SubstanceIcon } from './components/SubstanceIcon';
import { SubstancePicker } from './components/SubstancePicker';
import { RideItOut } from './components/RideItOut';
import { TodayLog } from './components/TodayLog';
import { TotalsCard } from './components/TotalsCard';
import { MemoryCard } from './components/MemoryCard';
import { PatternsCard } from './components/PatternsCard';
import { patterns } from './lib/patterns';
import { scheduleSync, syncNow } from './lib/memorySync';
import { CameraAlert, CameraCard, CameraPill } from './components/CameraCard';
import { answerNo, answerYes, dismissAlert, noteManualLog, startWatch, stopWatch, useCameraWatch } from './lib/cameraWatch';
import { clampThreshold } from './lib/puffJudge';
import { VirtualSmoke } from './components/VirtualSmoke';
import { WeekBars } from './components/WeekBars';

const UNDO_MS = 6000;
/** The dial and "since" counter move by the minute; 15 s keeps them honest. */
const CLOCK_MS = 15_000;

interface Undo { event: EmberEvent; label: string }

export default function App() {
  const { t } = useI18n();
  const store = useSyncExternalStore(subscribe, getSnapshot);
  const far = useFar();
  const asking = useCameraWatch().alert !== null;
  const [now, setNow] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  /** Tony, 2026-10-07: before a use is logged, offer to ride it out first. */
  const [offering, setOffering] = useState(false);
  const [settings, setSettings] = useState(false);
  /** The "Ride it out" sheet (exercises, breathing, water…). */
  const [riding, setRiding] = useState(false);
  /** The virtual one, with the substance chosen on the sheet when there was one. */
  const [smoking, setSmoking] = useState<{ preset: Substance | null } | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);

  useEffect(() => { void load(); }, []);

  // The clock only ticks once there is something to count from.
  const ready = store.status === 'ready';
  useEffect(() => {
    if (!ready) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!undo) return undefined;
    const id = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(id);
  }, [undo]);

  // Memory (lib/memorySync.ts): one run once the log is read, then a gathered
  // write after each change, and a run every 30 min so a finished day gets
  // its digest even if nothing is tapped after midnight.
  const events = store.state.events;
  const memoryOn = store.state.memory.on;
  useEffect(() => {
    if (ready && memoryOn) void syncNow();
  }, [ready, memoryOn]);
  useEffect(() => {
    if (ready && memoryOn) scheduleSync();
  }, [ready, memoryOn, events]);
  useEffect(() => {
    if (!ready || !memoryOn) return undefined;
    const id = window.setInterval(() => scheduleSync(0), 30 * 60_000);
    return () => window.clearInterval(id);
  }, [ready, memoryOn]);

  // Camera watch (lib/cameraWatch.ts): subscribed while the person keeps it on.
  const watchOn = store.state.watch.on;
  useEffect(() => {
    if (!ready || !watchOn || store.mode !== 'host') return undefined;
    startWatch();
    return () => stopWatch();
  }, [ready, watchOn, store.mode]);

  const logUse = useCallback((substance: Substance, when?: number) => {
    const at = when ?? Date.now();
    noteManualLog(at);
    const event: EmberEvent = { at: Math.floor(at / 1000) * 1000, kind: 'use', substance };
    setPicking(false);
    if (addEvent(event)) {
      setNow(at);
      setUndo({ event, label: t('undo.logged', { what: t(`substance.${substance}`), time: formatClock(at) }) });
    }
  }, [t]);

  const logPassed = useCallback((substance: Substance, at: number, method?: Method) => {
    const event: EmberEvent = { at: Math.floor(at / 1000) * 1000, kind: 'resisted', substance };
    if (method) event.method = method;
    if (addEvent(event)) setNow(at);
  }, []);

  const { state } = store;

  const alertYes = (s: string) => {
    const a = answerYes();
    if (a && (s === 'cigarette' || s === 'vape' || s === 'joint')) logUse(s, a.since);
  };
  const alertVirtual = () => { dismissAlert(); setSmoking({ preset: null }); };
  const alert = <CameraAlert substances={state.substances} onYes={alertYes} onNo={answerNo} onVirtual={alertVirtual} big={far} />;

  if (store.status === 'loading') {
    return <div className="em-root"><div className="em-center em-muted">{t('load.loading')}</div></div>;
  }
  if (store.status === 'failed' || store.status === 'unreadable') {
    return (
      <div className="em-root">
        <div className="em-center">
          <p className="em-banner em-banner-bad">{t(store.status === 'failed' ? 'load.failed' : 'load.unreadable')}</p>
          {store.status === 'failed' && <button type="button" className="em-btn" onClick={() => void load()}>{t('load.retry')}</button>}
        </div>
      </div>
    );
  }

  if (state.substances.length === 0 || settings) {
    return (
      <div className="em-root">
        <div className="em-column">
          <SubstancePicker initial={state.substances} firstRun={state.substances.length === 0}
            onSave={(s) => { if (setSubstances(s)) setSettings(false); }} />
        </div>
      </div>
    );
  }

  const today = summariseDay(state.events, startOfDay(now));
  const uses = today.uses;
  const totalToday = uses ? totalOf(uses) : null;
  const since = sinceLastUse(state.events, now);
  const yesterday = yesterdayByNow(state.events, now);
  const gap = longestGap(state.events, now);
  const todaysEvents = state.events.filter((e) => e.at >= today.start);
  const allTime = totals(state.events, now);
  const found = patterns(state.events, now);

  // Zoomed out on the board: the far view replaces the page. The virtual
  // smoke is a close-up gesture and stays out of it.
  if (far && !smoking && !riding) {
    return (
      <div className="em-root em-root-far">
        {alert}
        {store.mode === 'host' && !asking && (
          <div className="em-far-pill">
            <CameraPill watch={state.watch} big onTurnOn={() => setWatch({ ...state.watch, on: true })} />
          </div>
        )}
        <FarView events={state.events} now={now} sinceLast={since} today={totalToday}
          substances={state.substances} onLog={logUse} onVirtual={() => setRiding(true)} />
        {undo && <div className="em-toast em-toast-far" role="status"><span>{undo.label}</span></div>}
      </div>
    );
  }

  return (
    <div className="em-root">
      <div className="em-column">
        <header className="em-top">
          <div className="em-brand"><span className="em-brand-ember" aria-hidden="true" /> <span className="em-serif">{t('app.title')}</span></div>
          <div className="em-top-actions">
            {store.mode === 'host' && (
              <CameraPill watch={state.watch} onTurnOn={() => setWatch({ ...state.watch, on: true })}
                onOpen={() => document.getElementById('em-camera-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
            )}
            <button type="button" className="em-ghost" onClick={() => setSettings(true)}>{t('app.settings')}</button>
          </div>
        </header>

        {store.mode === 'browser' && <p className="em-banner">{t('app.preview')}</p>}
        {alert}
        {store.saveError && (
          <p className="em-banner em-banner-bad" role="alert">
            {store.saveError === 'full' ? t('save.full') : t('save.failed', { reason: store.saveError })}
          </p>
        )}

        <section className="em-hero">
          <DayDial events={state.events} now={now} sinceLast={since} />
          <div className="em-hero-side">
            <div className="em-today">
              <span className="em-today-num">{totalToday ?? '—'}</span>
              <span className="em-today-label">{t('today.label')}</span>
            </div>
            {uses && state.substances.length > 1 && (
              <div className="em-chips">
                {state.substances.map((s) => (
                  <span key={s} className={`em-chip em-c-${s}`}><SubstanceIcon substance={s} size={16} /> {uses[s]}</span>
                ))}
              </div>
            )}
            {since === null && <p className="em-muted">{t('today.neverHint')}</p>}
            <ul className="em-facts">
              {yesterday !== null && <li>{t('today.vsYesterday', { n: yesterday })}</li>}
              {today.resisted !== null && today.resisted > 0 && (
                <li className="em-good"><span className="em-dot-calm" /> {today.resisted === 1 ? t('today.passedOne') : t('today.passedMany', { n: today.resisted })}</li>
              )}
              {gap !== null && (
                <li>
                  <span className="em-fact-label">{t('today.stretch')}</span>
                  <span className="em-fact-value">{gap.ongoing ? t('today.stretchOngoing', { d: formatDuration(gap.ms) }) : formatDuration(gap.ms)}</span>
                </li>
              )}
            </ul>
          </div>
        </section>

        <section className="em-actions">
          {offering ? (
            <div className="em-pick em-offer" role="group" aria-label={t('offer.question')}>
              <span className="em-pick-q">{t('offer.question')}</span>
              <button type="button" className="em-pick-btn em-c-calm" onClick={() => { setOffering(false); setRiding(true); }}>
                {t('offer.yes')}
              </button>
              <button type="button" className="em-ghost" onClick={() => {
                setOffering(false);
                if (state.substances.length === 1) logUse(state.substances[0]!); else setPicking(true);
              }}>{t('offer.no')}</button>
            </div>
          ) : picking ? (
            <div className="em-pick" role="group" aria-label={t('log.which')}>
              <span className="em-pick-q">{t('log.which')}</span>
              {state.substances.map((s) => (
                <button key={s} type="button" className={`em-pick-btn em-c-${s}`} onClick={() => logUse(s)}>
                  <SubstanceIcon substance={s} size={22} /> {t(`substance.${s}`)}
                </button>
              ))}
              <button type="button" className="em-ghost" onClick={() => setPicking(false)}>{t('log.cancel')}</button>
            </div>
          ) : (
            <>
              <button type="button" className="em-btn em-btn-log"
                onClick={() => setOffering(true)}>
                {t('action.log')}
              </button>
              <button type="button" className="em-btn em-btn-craving" onClick={() => setRiding(true)}>
                <span className="em-craving-glow" aria-hidden="true" />
                <span className="em-craving-text">
                  <strong>{t('action.craving')}</strong>
                  <span>{t('action.cravingSub')}</span>
                </span>
              </button>
            </>
          )}
        </section>

        <WeekBars days={lastWeek(state.events, now)} trend={weekTrend(state.events, now)} />
        {allTime && <TotalsCard totals={allTime} substances={state.substances} />}
        {found && <PatternsCard p={found} />}
        {store.mode === 'host' && <MemoryCard memory={state.memory} />}
        {store.mode === 'host' && (
          <CameraCard watch={state.watch}
            onToggle={(on) => setWatch({ ...state.watch, on })}
            onThreshold={(n) => setWatch({ ...state.watch, threshold: clampThreshold(n) })} />
        )}
        <TodayLog events={todaysEvents} onRemove={(e) => { removeEvent(e); setNow(Date.now()); }} />
      </div>

      {undo && (
        <div className="em-toast" role="status">
          <span>{undo.label}</span>
          <button type="button" onClick={() => { removeEvent(undo.event); setUndo(null); setNow(Date.now()); }}>{t('undo.action')}</button>
        </div>
      )}

      {riding && (
        <RideItOut substances={state.substances} favourite={favouriteChoice(state.events, Date.now())} far={far} onPassed={logPassed}
          onVirtual={(s) => { setRiding(false); setSmoking({ preset: s }); }}
          onClose={() => { setRiding(false); setNow(Date.now()); }} />
      )}
      {smoking && (
        <VirtualSmoke substances={state.substances} preset={smoking.preset} far={far} onPassed={logPassed}
          onClose={() => { setSmoking(null); setNow(Date.now()); }} />
      )}
    </div>
  );
}
