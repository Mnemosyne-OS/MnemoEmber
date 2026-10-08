/**
 * RideItOut — the ways to let a craving pass (Tony, 2026-10-07: "à la place je
 * peux faire quelques pompes, étirements, exercice de respiration").
 *
 * A sheet of tiles: the virtual one (VirtualSmoke, opened by the parent),
 * box breathing, push-ups, squats, stretching, a walk, a glass of water. Each
 * activity ends on the same "Craving passed" screen and logs ONE `resisted`
 * event carrying its method.
 *
 * Same exits as the virtual one: "I'm good now" logs (once something was
 * actually done), "Close" logs nothing.
 *
 * Timers are setInterval at 4 Hz, cleared on unmount and on every stage
 * change. Animations are CSS, started by the gesture that opens an activity;
 * `prefers-reduced-motion` freezes them and the text still carries the guide.
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { formatClock } from '../lib/format';
import { CRAVING_CHOICES, SUBSTANCES, type CravingChoice, type Method, type Substance } from '../lib/types';
import { SubstanceIcon } from './SubstanceIcon';

type Choice = CravingChoice;

const BOX_SECONDS = 4;
const BOX_CYCLES = 6;
const REP_TARGETS = [5, 10, 15, 20] as const;
const STRETCH_SECONDS = 30;
const STRETCHES = ['neck', 'shoulders', 'reach', 'fold', 'chest'] as const;
const WALK_SECONDS = 5 * 60;

/** Seconds elapsed since `start`, ticking at 4 Hz while `running`. */
function useElapsed(running: boolean): number {
  const startRef = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    startRef.current = performance.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((performance.now() - startRef.current) / 1000), 250);
    return () => window.clearInterval(id);
  }, [running]);
  return elapsed;
}

function mmss(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MethodIcon({ method, size = 32 }: { method: Choice; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (method) {
    case 'virtual': return <svg {...p}><rect x="2.5" y="13" width="17" height="4" rx="1" /><path d="M21.5 13v4" /><path d="M19 9c0-1.5 1.5-1.5 1.5-3S19 4.5 19 3" /></svg>;
    case 'breathing': return <svg {...p}><path d="M3 9h11a3 3 0 1 0-3-3" /><path d="M3 15h15a3 3 0 1 1-3 3" /><path d="M3 12h8" /></svg>;
    case 'pushups': return <svg {...p}><circle cx="5" cy="9" r="2" /><path d="M7 10l9 3h5" /><path d="M9 11l-1 6" /><path d="M2 19h20" /></svg>;
    case 'squats': return <svg {...p}><circle cx="12" cy="4" r="2" /><path d="M12 6v6l-4 3v5" /><path d="M12 12l4 3v5" /><path d="M8 9h8" /></svg>;
    case 'stretching': return <svg {...p}><circle cx="12" cy="4" r="2" /><path d="M5 3l7 5 7-5" /><path d="M12 8v6l-3 7" /><path d="M12 14l3 7" /></svg>;
    case 'walk': return <svg {...p}><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6-2-3 1-4 3 3h3" /><path d="M8 11l2-3" /><path d="M12 15l3 6" /></svg>;
    case 'water': return <svg {...p}><path d="M6 3h12l-1.5 17a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z" /><path d="M6.8 10h10.4" /></svg>;
  }
}

/** Where satellite `i` of `n` sits around the centre, in % of the orbit box. */
function orbitSpot(i: number, n: number): { left: string; top: string } {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  const r = 36;
  return { left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` };
}

export function RideItOut({ substances, favourite, far = false, onPassed, onVirtual, onClose }: {
  substances: Substance[];
  /** The board is zoomed out: the sheet and every activity scale to the window. */
  far?: boolean;
  /** The way used most often lately (stats.favouriteChoice): drawn in the
   *  centre. null = nothing yet, the virtual one takes the centre. */
  favourite: CravingChoice | null;
  /** One craving passed, by this method. Called at most once. */
  onPassed: (substance: Substance, at: number, method: Method) => void;
  /** The virtual one is its own scene; the parent opens it. */
  onVirtual: (substance: Substance) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const offered = substances.length > 0 ? substances : [...SUBSTANCES];
  const [substance, setSubstance] = useState<Substance>(offered[0]!);
  const [choice, setChoice] = useState<Method | null>(null);
  const [passedAt, setPassedAt] = useState<number | null>(null);
  const passedRef = useRef(false);

  const centre: Choice = favourite ?? 'virtual';
  const pick = (c: Choice) => { if (c === 'virtual') onVirtual(substance); else setChoice(c); };

  const pass = (method: Method) => {
    if (passedRef.current) return;
    passedRef.current = true;
    const at = Date.now();
    setPassedAt(at);
    onPassed(substance, at, method);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={far ? 'em-scene em-ride em-ride-far' : 'em-scene em-ride'} role="dialog" aria-modal="true" aria-label={t('ride.title')}>
      <button type="button" className="em-scene-close" onClick={onClose}>{t('virtual.close')}</button>

      {passedAt !== null ? (
        <div className="em-ride-finished" aria-live="polite">
          <div className="em-ride-done-icon em-c-calm"><MethodIcon method={choice ?? 'breathing'} size={64} /></div>
          <div className="em-serif em-finished-title">{t('virtual.finished')}</div>
          <div className="em-finished-sub">{t('virtual.finishedSub', { time: formatClock(passedAt) })}</div>
          <button type="button" className="em-btn em-btn-calm" onClick={onClose}>{t('virtual.back')}</button>
        </div>
      ) : choice === null ? (
        <div className="em-ride-menu">
          <h2 className="em-serif em-ride-title">{t('ride.title')}</h2>
          {offered.length > 1 && (
            <div className="em-ride-for" role="group" aria-label={t('ride.for')}>
              <span className="em-muted">{t('ride.for')}</span>
              {offered.map((s) => (
                <button key={s} type="button" aria-pressed={s === substance}
                  className={`em-ride-chip em-c-${s}${s === substance ? ' em-on' : ''}`} onClick={() => setSubstance(s)}>
                  <SubstanceIcon substance={s} size={18} /> {t(`substance.${s}`)}
                </button>
              ))}
            </div>
          )}
          {/* The usual way in the centre, the others around it. The ring keeps
              one fixed order, so each way stays where the hand expects it. */}
          <div className="em-orbit">
            {CRAVING_CHOICES.filter((c) => c !== centre).map((c, i, ring) => (
              <button key={c} type="button" className={`em-orbit-sat${c === 'virtual' ? ' em-orbit-virtual' : ''}`}
                style={orbitSpot(i, ring.length)} onClick={() => pick(c)}>
                <MethodIcon method={c} size={40} />
                <strong>{t(`method.${c}`)}</strong>
              </button>
            ))}
            <button type="button" className={`em-orbit-centre${centre === 'virtual' ? ' em-orbit-virtual' : ''}`} onClick={() => pick(centre)}>
              {favourite !== null && <span className="em-orbit-tag">{t('ride.usual')}</span>}
              <MethodIcon method={centre} size={72} />
              <strong>{t(`method.${centre}`)}</strong>
              <span>{t(centre === 'virtual' ? 'ride.virtualSub' : `method.${centre}Sub`)}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="em-ride-activity">
          <button type="button" className="em-ghost em-ride-back" onClick={() => setChoice(null)}>← {t('ride.other')}</button>
          {choice === 'breathing' && <Breathing onDone={() => pass('breathing')} />}
          {(choice === 'pushups' || choice === 'squats') && <Reps method={choice} onDone={() => pass(choice)} />}
          {choice === 'stretching' && <Stretching onDone={() => pass('stretching')} />}
          {choice === 'walk' && <Walk onDone={() => pass('walk')} />}
          {choice === 'water' && <Water onDone={() => pass('water')} />}
        </div>
      )}
    </div>
  );
}

// ── Activities ─────────────────────────────────────────────────────────────

/** Box breathing: in 4, hold 4, out 4, hold 4, six times (about 1.6 min). */
function Breathing({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const elapsed = useElapsed(true);
  const cycle = BOX_SECONDS * 4;
  const cyclesDone = Math.floor(elapsed / cycle);
  const phaseIndex = Math.floor((elapsed % cycle) / BOX_SECONDS);
  const phases = ['in', 'holdIn', 'out', 'holdOut'] as const;
  const phase = phases[phaseIndex]!;
  const count = BOX_SECONDS - Math.floor(elapsed % BOX_SECONDS);
  const done = cyclesDone >= BOX_CYCLES;
  useEffect(() => { if (done) onDone(); }, [done, onDone]);
  return (
    <div className="em-act">
      <div className="em-breath" aria-hidden="true">
        <div className="em-breath-square" />
        <div className="em-breath-dot" style={{ animationDuration: `${cycle}s` }} />
        <div className="em-breath-core" style={{ animationDuration: `${cycle}s` }} />
        <div className="em-breath-count">{count}</div>
      </div>
      <div className="em-act-hint" aria-live="polite">{t(`breath.${phase}`)}</div>
      <div className="em-act-meta">{t('breath.cycle', { n: Math.min(cyclesDone + 1, BOX_CYCLES), total: BOX_CYCLES })}</div>
      <button type="button" className="em-btn em-btn-calm em-act-done" onClick={onDone}
        style={cyclesDone >= 1 ? undefined : { visibility: 'hidden' }} tabIndex={cyclesDone >= 1 ? 0 : -1}>{t('virtual.done')}</button>
    </div>
  );
}

/** Push-ups or squats: pick a target, tap (or press space) once per rep. */
function Reps({ method, onDone }: { method: 'pushups' | 'squats'; onDone: () => void }) {
  const { t } = useI18n();
  const [target, setTarget] = useState<number>(10);
  const [reps, setReps] = useState(0);
  const add = () => setReps((r) => r + 1);
  useEffect(() => { if (reps >= target) onDone(); }, [reps, target, onDone]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); setReps((r) => r + 1); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const r = 88;
  const len = 2 * Math.PI * r;
  return (
    <div className="em-act">
      <div className="em-act-title em-serif">{t(`method.${method}`)}</div>
      {reps === 0 && (
        <div className="em-targets" role="group" aria-label={t('reps.target')}>
          {REP_TARGETS.map((n) => (
            <button key={n} type="button" aria-pressed={n === target} className={`em-ride-chip${n === target ? ' em-on em-c-calm' : ''}`} onClick={() => setTarget(n)}>{n}</button>
          ))}
        </div>
      )}
      <button type="button" className="em-rep" onClick={add} aria-label={t('reps.tap')}>
        <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r={r} className="em-hold-track" />
          <circle cx="100" cy="100" r={r} className="em-hold-ring em-ring-calm" strokeDasharray={len}
            strokeDashoffset={len * (1 - Math.min(1, reps / target))} transform="rotate(-90 100 100)" />
        </svg>
        <span className="em-rep-num">{reps}<small>/{target}</small></span>
      </button>
      <div className="em-act-meta">{t('reps.tap')}</div>
      <button type="button" className="em-btn em-btn-calm em-act-done" onClick={onDone}
        style={reps > 0 ? undefined : { visibility: 'hidden' }} tabIndex={reps > 0 ? 0 : -1}>{t('virtual.done')}</button>
    </div>
  );
}

/** Five stretches, 30 s each, with a skip. */
function Stretching({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  // Index and start time change in ONE update, so a render never pairs the
  // next stretch with the previous one's elapsed time (which would skip it).
  const [step, setStep] = useState({ index: 0, startedAt: performance.now() });
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = (performance.now() - step.startedAt) / 1000;
  const left = STRETCH_SECONDS - elapsed;
  const last = step.index + 1 >= STRETCHES.length;
  const next = () => {
    if (last) onDone();
    else setStep({ index: step.index + 1, startedAt: performance.now() });
  };
  const timeUp = left <= 0;
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => { if (timeUp) nextRef.current(); }, [timeUp, step.index]);
  const name = STRETCHES[step.index]!;
  return (
    <div className="em-act">
      <div className="em-act-meta">{t('stretch.step', { n: step.index + 1, total: STRETCHES.length })}</div>
      <div className="em-act-title em-serif">{t(`stretch.${name}`)}</div>
      <p className="em-act-text">{t(`stretch.${name}Sub`)}</p>
      <div className="em-bar"><div className="em-bar-fill" style={{ width: `${Math.min(100, (elapsed / STRETCH_SECONDS) * 100)}%` }} /></div>
      <div className="em-act-clock">{mmss(left)}</div>
      <div className="em-act-row">
        <button type="button" className="em-ghost" onClick={next}>{t('stretch.next')}</button>
        <button type="button" className="em-btn em-btn-calm" onClick={onDone}
          style={step.index > 0 ? undefined : { visibility: 'hidden' }} tabIndex={step.index > 0 ? 0 : -1}>{t('virtual.done')}</button>
      </div>
    </div>
  );
}

/** A five-minute walk: the clock runs, "I'm back" after the first minute. */
function Walk({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const elapsed = useElapsed(true);
  const left = WALK_SECONDS - elapsed;
  useEffect(() => { if (left <= 0) onDone(); }, [left, onDone]);
  const r = 88;
  const len = 2 * Math.PI * r;
  return (
    <div className="em-act">
      <div className="em-act-title em-serif">{t('method.walk')}</div>
      <p className="em-act-text">{t('walk.text')}</p>
      <div className="em-walk">
        <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r={r} className="em-hold-track" />
          <circle cx="100" cy="100" r={r} className="em-hold-ring em-ring-calm" strokeDasharray={len}
            strokeDashoffset={len * Math.min(1, elapsed / WALK_SECONDS)} transform="rotate(-90 100 100)" />
        </svg>
        <span className="em-act-clock em-walk-clock">{mmss(left)}</span>
      </div>
      <button type="button" className="em-btn em-btn-calm em-act-done" onClick={onDone}
        style={elapsed >= 60 ? undefined : { visibility: 'hidden' }} tabIndex={elapsed >= 60 ? 0 : -1}>{t('walk.back')}</button>
    </div>
  );
}

/** A glass of water, drunk slowly: the glass fills while you do. */
function Water({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  return (
    <div className="em-act">
      <div className="em-act-title em-serif">{t('method.water')}</div>
      <p className="em-act-text">{t('water.text')}</p>
      <div className="em-glass" aria-hidden="true"><div className="em-glass-water" /></div>
      <button type="button" className="em-btn em-btn-calm em-act-done" onClick={onDone}>{t('water.done')}</button>
    </div>
  );
}
