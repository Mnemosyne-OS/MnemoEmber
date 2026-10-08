/**
 * DayDial — the day on a 24-hour clock face, midnight at the top.
 *
 * Each use is a coloured dot on the ring at its clock time. Each craving that
 * passed is a hollow ring just inside. A glowing arc runs from the last use to
 * "now": the current stretch, which grows while the window is open.
 *
 * The centre carries the one number the person comes for: the time since the
 * last one. With no use ever logged, the centre says so instead of printing a
 * zero duration.
 */
import { useI18n } from '../i18n/useI18n';
import { formatDuration } from '../lib/format';
import { dayFraction, startOfDay } from '../lib/stats';
import { eventKey, type EmberEvent } from '../lib/types';

const SIZE = 300;
const C = SIZE / 2;
const R = 116;

function point(fraction: number, radius: number): { x: number; y: number } {
  const a = fraction * Math.PI * 2 - Math.PI / 2;
  return { x: C + Math.cos(a) * radius, y: C + Math.sin(a) * radius };
}

/** SVG arc path along the ring between two day fractions (clockwise). */
function arcPath(from: number, to: number, radius: number): string {
  const a = point(from, radius);
  const b = point(to, radius);
  const large = to - from > 0.5 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function DayDial({ events, now, sinceLast, fluid = false }: {
  events: EmberEvent[];
  now: number;
  sinceLast: number | null;
  /** Fill the parent instead of a fixed 300 px: the far view (§ distance.ts). */
  fluid?: boolean;
}) {
  const { t } = useI18n();
  const today = startOfDay(now);
  const todays = events.filter((e) => e.at >= today && e.at <= now);
  const nowF = dayFraction(now);

  // The current stretch, clipped to today: a stretch that began yesterday
  // starts at midnight on today's face.
  const stretchFrom = sinceLast === null ? null : Math.max(0, dayFraction(Math.max(now - sinceLast, today)));
  const hand = point(nowF, R + 14);
  const handIn = point(nowF, R - 22);

  return (
    <div className={fluid ? 'em-dial em-dial-fluid' : 'em-dial'}>
      <svg width={fluid ? '100%' : SIZE} height={fluid ? '100%' : SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={sinceLast === null ? t('today.never') : `${formatDuration(sinceLast)} ${t('today.since')}`}>
        <defs>
          <radialGradient id="em-dial-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--em-ember)" stopOpacity="0.16" />
            <stop offset="70%" stopColor="var(--em-ember)" stopOpacity="0.02" />
            <stop offset="100%" stopColor="var(--em-ember)" stopOpacity="0" />
          </radialGradient>
          <filter id="em-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <circle cx={C} cy={C} r={R - 6} fill="url(#em-dial-core)" />
        {/* Night, midnight to 7: a quieter band so the day reads at a glance. */}
        <path d={arcPath(0, 7 / 24, R)} className="em-dial-night" />
        <circle cx={C} cy={C} r={R} className="em-dial-ring" />

        {Array.from({ length: 24 }, (_, h) => {
          const major = h % 6 === 0;
          const a = point(h / 24, R + (major ? 9 : 5));
          const b = point(h / 24, R + 1);
          return <line key={h} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={major ? 'em-dial-tick em-dial-tick-major' : 'em-dial-tick'} />;
        })}
        {[0, 6, 12, 18].map((h) => {
          const p = point(h / 24, R + 24);
          return <text key={h} x={p.x} y={p.y} className="em-dial-hour" textAnchor="middle" dominantBaseline="central">{String(h).padStart(2, '0')}</text>;
        })}

        {stretchFrom !== null && nowF - stretchFrom > 0.002 && (
          <path d={arcPath(stretchFrom, nowF, R)} className="em-dial-stretch" filter="url(#em-glow)" />
        )}

        {todays.map((e) => {
          const f = dayFraction(e.at);
          if (e.kind === 'resisted') {
            const p = point(f, R - 16);
            return <circle key={eventKey(e)} cx={p.x} cy={p.y} r={5} className="em-dial-passed" />;
          }
          const p = point(f, R);
          return <circle key={eventKey(e)} cx={p.x} cy={p.y} r={6.5} className={`em-dial-use em-c-${e.substance}`} filter="url(#em-glow)" />;
        })}

        <line x1={handIn.x} y1={handIn.y} x2={hand.x} y2={hand.y} className="em-dial-hand" />
        <circle cx={hand.x} cy={hand.y} r={3} className="em-dial-hand-dot" />
      </svg>

      <div className="em-dial-centre">
        {sinceLast === null ? (
          <>
            <div className="em-dial-big em-dial-big-quiet">—</div>
            <div className="em-dial-label">{t('today.never')}</div>
          </>
        ) : (
          <>
            <div className="em-dial-big">{formatDuration(sinceLast)}</div>
            <div className="em-dial-label">{t('today.since')}</div>
          </>
        )}
      </div>
    </div>
  );
}
