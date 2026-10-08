/**
 * VirtualSmoke — a cigarette, vape or joint drawn on a canvas, smoked by
 * holding a button (or the space bar). Doc 139 §7.
 *
 * Holding = drawing in: the ember brightens, the paper burns back, the ring
 * fills over 4 s. Releasing = breathing out: a plume rises at the pace of a
 * slow breath and the ring empties. A puff counts past 1.2 s of hold. After
 * the last puff the ember dies down and the craving is logged as passed.
 *
 * Exits: "I'm good now" (after one puff) logs the craving as passed. "Close"
 * logs nothing: someone who leaves to smoke a real one must not be credited.
 *
 * Motion only answers a gesture. With nothing held, nothing exhaling and no
 * smoke left, the frame loop STOPS (one rAF, cancelled on unmount). Under
 * `prefers-reduced-motion` no smoke is drawn; the ember and the ring still
 * carry the breathing guide, because they are information, not decoration.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { formatClock } from '../lib/format';
import { SUBSTANCES, type Substance } from '../lib/types';
import { SubstanceIcon } from './SubstanceIcon';

const INHALE_TARGET_MS = 4000;
const MIN_PUFF_MS = 1200;
const PUFFS: Record<Substance, number> = { cigarette: 10, vape: 10, joint: 8 };
const RING_R = 88;
/** The object's drawing length before it is scaled to the window. */
const REF_L = 460;
const RING_LEN = 2 * Math.PI * RING_R;

type Phase = 'choose' | 'idle' | 'inhaling' | 'exhaling' | 'finished';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  r: number; grow: number; life: number; max: number; a: number; seed: number;
}

interface Sim {
  substance: Substance;
  glow: number;
  burn: number;
  puffs: number;
  holdStart: number | null;
  exhaleStart: number | null;
  exhaleMs: number;
  finishing: boolean;
  particles: Particle[];
  raf: number | null;
  last: number;
  w: number; h: number; dpr: number;
  /** Drawn larger to fill the window when the board is zoomed out. */
  far: boolean;
  /** Current scale from REF_L to the screen; smoke is sized with it. */
  u: number;
  tip: { x: number; y: number };
  mouth: { x: number; y: number };
}

const SMOKE_TINT: Record<Substance, string> = { cigarette: '210,214,222', vape: '236,236,248', joint: '226,220,206' };

function exhaleDuration(holdMs: number): number {
  return Math.min(7000, Math.max(3000, holdMs * 1.5));
}

/** A soft round puff, pre-rendered once per tint: one drawImage per particle
 *  instead of one gradient per particle per frame. */
function makeSprite(tint: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${tint},0.55)`);
    grad.addColorStop(0.45, `rgba(${tint},0.22)`);
    grad.addColorStop(1, `rgba(${tint},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ── Drawing ─────────────────────────────────────────────────────────────────

function drawEmber(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, glow: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * (2.2 + glow * 4));
  halo.addColorStop(0, `rgba(255,140,60,${0.25 + glow * 0.5})`);
  halo.addColorStop(0.4, `rgba(255,90,30,${0.08 + glow * 0.22})`);
  halo.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, radius * (2.2 + glow * 4), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const core = ctx.createRadialGradient(x, y, 0, x, y, radius);
  core.addColorStop(0, `rgba(255,${200 + glow * 55},${120 + glow * 100},1)`);
  core.addColorStop(0.5, `rgba(255,${100 + glow * 60},40,1)`);
  core.addColorStop(1, `rgba(${120 + glow * 80},30,20,1)`);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Each draw* works in a local frame: mouth end at -L/2, lit end at +L/2. */
function drawCigarette(ctx: CanvasRenderingContext2D, L: number, burn: number, glow: number, alive: boolean): number {
  const W = 26;
  const F = L * 0.24;
  const paper = (L - F) * (1 - burn * 0.86);
  const x0 = -L / 2;
  const tipX = x0 + F + paper;
  // Filter
  const fg = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
  fg.addColorStop(0, '#e2a868'); fg.addColorStop(0.5, '#c98a4b'); fg.addColorStop(1, '#9c6532');
  ctx.fillStyle = fg;
  roundRect(ctx, x0, -W / 2, F + 2, W, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,70,30,0.35)';
  for (let i = 0; i < 26; i += 1) ctx.fillRect(x0 + 6 + ((i * 37) % (F - 10)), -W / 2 + 4 + ((i * 53) % (W - 8)), 1.6, 1.6);
  // Paper
  const pg = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
  pg.addColorStop(0, '#fbf8f1'); pg.addColorStop(0.55, '#ebe4d6'); pg.addColorStop(1, '#bdb4a3');
  ctx.fillStyle = pg;
  ctx.fillRect(x0 + F, -W / 2, paper, W);
  ctx.fillStyle = 'rgba(200,170,120,0.55)';
  ctx.fillRect(x0 + F, -W / 2, 2, W);
  // Ash and char
  const ash = Math.min(14, paper);
  const ag = ctx.createLinearGradient(tipX - ash, 0, tipX, 0);
  ag.addColorStop(0, 'rgba(70,58,50,0.9)'); ag.addColorStop(1, 'rgba(150,145,140,0.95)');
  ctx.fillStyle = ag;
  ctx.fillRect(tipX - ash, -W / 2, ash, W);
  if (alive) drawEmber(ctx, tipX, 0, W / 2, glow);
  return tipX;
}

function drawJoint(ctx: CanvasRenderingContext2D, L: number, burn: number, glow: number, alive: boolean, puffs: number): number {
  const x0 = -L / 2;
  const crutch = L * 0.12;
  const length = (L - crutch) * (1 - burn * 0.85);
  const tipX = x0 + crutch + length;
  const halfAt = (x: number) => 9 + ((x - x0) / L) * 11;
  // Crutch
  ctx.fillStyle = '#d6b98a';
  roundRect(ctx, x0, -halfAt(x0), crutch + 2, halfAt(x0) * 2, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,50,0.6)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) { ctx.beginPath(); ctx.moveTo(x0 + i * (crutch / 4), -6); ctx.lineTo(x0 + i * (crutch / 4), 6); ctx.stroke(); }
  // Paper cone
  const a = x0 + crutch;
  const g = ctx.createLinearGradient(0, -16, 0, 16);
  g.addColorStop(0, '#fdfbf6'); g.addColorStop(0.6, '#ece6da'); g.addColorStop(1, '#c4bba9');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(a, -halfAt(a));
  ctx.lineTo(tipX, -halfAt(tipX));
  ctx.lineTo(tipX, halfAt(tipX));
  ctx.lineTo(a, halfAt(a));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,150,130,0.45)';
  ctx.beginPath();
  ctx.moveTo(a + 4, -halfAt(a) + 3);
  ctx.lineTo(tipX - 4, halfAt(tipX) - 5);
  ctx.stroke();
  // The twist only survives until it is lit.
  if (puffs === 0 && burn < 0.01) {
    ctx.fillStyle = '#f2ede2';
    ctx.beginPath();
    ctx.moveTo(tipX, -halfAt(tipX));
    ctx.quadraticCurveTo(tipX + 14, -4, tipX + 22, -6);
    ctx.quadraticCurveTo(tipX + 12, 2, tipX, halfAt(tipX));
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(60,50,44,0.9)';
    ctx.fillRect(tipX - 8, -halfAt(tipX), 8, halfAt(tipX) * 2);
    if (alive) drawEmber(ctx, tipX, 0, halfAt(tipX), glow);
  }
  return tipX;
}

function drawVape(ctx: CanvasRenderingContext2D, L: number, burn: number, glow: number, total: number): number {
  const H = 48;
  const x0 = -L / 2;
  const mouth = 46;
  // Mouthpiece
  ctx.fillStyle = '#1d1c22';
  roundRect(ctx, x0, -H * 0.3, mouth + 10, H * 0.6, 10);
  ctx.fill();
  // Body
  const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
  g.addColorStop(0, '#5b5868'); g.addColorStop(0.35, '#3a3844'); g.addColorStop(1, '#1f1e25');
  ctx.fillStyle = g;
  roundRect(ctx, x0 + mouth, -H / 2, L - mouth, H, 16);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, x0 + mouth + 10, -H / 2 + 5, L - mouth - 24, 6, 3);
  ctx.fill();
  // LED window, glowing with the draw
  const lx = x0 + mouth + 30;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const haloR = 50 + glow * 50;
  const halo = ctx.createRadialGradient(lx + 40, 0, 0, lx + 40, 0, haloR);
  halo.addColorStop(0, `rgba(181,143,247,${0.1 + glow * 0.35})`);
  halo.addColorStop(1, 'rgba(181,143,247,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(lx + 40, 0, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = `rgba(${150 + glow * 80},${110 + glow * 90},255,${0.45 + glow * 0.55})`;
  roundRect(ctx, lx, -4, 80, 8, 4);
  ctx.fill();
  // Charge left: one dot per puff remaining.
  const left = Math.max(0, total * (1 - burn));
  for (let i = 0; i < total; i += 1) {
    const lit = i < Math.round(left);
    ctx.fillStyle = lit ? 'rgba(181,143,247,0.95)' : 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(x0 + L - 26 - i * 13, 12, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  return x0;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ── Component ───────────────────────────────────────────────────────────────

export function VirtualSmoke({ substances, preset = null, far = false, onPassed, onClose }: {
  substances: Substance[];
  /** The board is zoomed out: everything scales to the window (cqmin). */
  far?: boolean;
  /** Chosen already (on the Ride it out sheet): skip the ritual picker. */
  preset?: Substance | null;
  /** Called once when the craving passed (last puff, or "I'm good now"). */
  onPassed: (substance: Substance, at: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const offered = substances.length > 0 ? substances : [...SUBSTANCES];
  const first = preset ?? offered[0]!;
  const [phase, setPhase] = useState<Phase>(preset !== null || offered.length === 1 ? 'idle' : 'choose');
  const [substance, setSubstance] = useState<Substance>(first);
  const [puffs, setPuffs] = useState(0);
  const [tooShort, setTooShort] = useState(false);
  const [passedAt, setPassedAt] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const spritesRef = useRef<Partial<Record<Substance, HTMLCanvasElement>>>({});
  const reduced = useRef(prefersReducedMotion());
  const passedRef = useRef(false);
  const sim = useRef<Sim>({
    substance: first, glow: 0.18, burn: 0, puffs: 0, holdStart: null, exhaleStart: null, exhaleMs: 0,
    finishing: false, particles: [], raf: null, last: 0, w: 0, h: 0, dpr: 1, far, u: 1,
    tip: { x: 0, y: 0 }, mouth: { x: 0, y: 0 },
  });
  const onPassedRef = useRef(onPassed);
  useEffect(() => { onPassedRef.current = onPassed; }, [onPassed]);

  const total = PUFFS[substance];

  const markPassed = useCallback(() => {
    if (passedRef.current) return;
    passedRef.current = true;
    const at = Date.now();
    setPassedAt(at);
    onPassedRef.current(sim.current.substance, at);
  }, []);

  const draw = useCallback(() => {
    const s = sim.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);

    // The object is drawn at a reference length (REF_L) and scaled to the
    // window, so the far view gets the same drawing, larger.
    const L = s.far ? Math.min(s.w * 0.82, s.h * 1.4) : Math.min(REF_L, s.w * 0.7);
    const u = L / REF_L;
    s.u = u;
    const cx = s.w * 0.52;
    const cy = s.h * (s.far ? 0.5 : 0.62);
    const angle = -0.1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(u, u);
    // Soft shadow on the "table".
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.filter = 'blur(10px)';
    ctx.beginPath();
    ctx.ellipse(0, 34, REF_L * 0.48, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const alive = !s.finishing || s.glow > 0.04;
    let tipLocal: number;
    if (s.substance === 'cigarette') tipLocal = drawCigarette(ctx, REF_L, s.burn, s.glow, alive);
    else if (s.substance === 'joint') tipLocal = drawJoint(ctx, REF_L, s.burn, s.glow, alive, s.puffs);
    else tipLocal = drawVape(ctx, REF_L, s.burn, s.glow, PUFFS.vape);
    tipLocal *= u;
    ctx.restore();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    s.tip = { x: cx + tipLocal * cos, y: cy + tipLocal * sin };
    const mx = (-REF_L / 2 - 40) * u;
    s.mouth = { x: cx + mx * cos, y: cy + mx * sin - 10 };

    // Smoke
    const sprite = (spritesRef.current[s.substance] ??= makeSprite(SMOKE_TINT[s.substance]));
    {
      for (const p of s.particles) {
        const k = p.life / p.max;
        const alpha = p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
        if (alpha <= 0) continue;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      ctx.globalAlpha = 1;
    }
  }, []);

  // Zooming the board in or out mid-ritual redraws at the new scale.
  useEffect(() => { sim.current.far = far; draw(); }, [far, draw]);

  const emit = useCallback((from: { x: number; y: number }, n: number, big: boolean) => {
    if (reduced.current) return;
    const s = sim.current;
    for (let i = 0; i < n; i += 1) {
      const seed = Math.random() * 1000;
      s.particles.push({
        x: from.x + (Math.random() - 0.5) * (big ? 10 : 3),
        y: from.y + (Math.random() - 0.5) * (big ? 8 : 2),
        // A breath is blown forward across the object, then rises and spreads.
        vx: (big ? 0.05 + Math.random() * 0.06 : (Math.random() - 0.5) * 0.01) * s.u,
        vy: (big ? -(0.008 + Math.random() * 0.018) : -(0.025 + Math.random() * 0.02)) * s.u,
        r: (big ? 5 + Math.random() * 6 : 3 + Math.random() * 2) * s.u,
        grow: (big ? 0.007 + Math.random() * 0.007 : 0.01 + Math.random() * 0.006) * s.u,
        life: 0,
        max: big ? 2600 + Math.random() * 2400 : 2600 + Math.random() * 1600,
        a: big ? 0.12 + Math.random() * 0.14 : 0.32,
        seed,
      });
    }
    if (s.particles.length > 700) s.particles.splice(0, s.particles.length - 700);
  }, []);

  const tick = useCallback((ts: number) => {
    const s = sim.current;
    const dt = Math.min(48, s.last ? ts - s.last : 16);
    s.last = ts;
    const now = performance.now();

    // Targets
    let glowTarget = s.finishing ? 0 : 0.18;
    const ring = ringRef.current;
    if (s.holdStart !== null) {
      const held = now - s.holdStart;
      const k = Math.min(1, held / INHALE_TARGET_MS);
      glowTarget = 0.35 + 0.65 * k;
      s.burn = Math.min(1, (s.puffs + k) / PUFFS[s.substance]);
      if (ring) { ring.style.strokeDashoffset = String(RING_LEN * (1 - k)); ring.dataset.mode = 'in'; }
      if (s.substance !== 'vape' && Math.random() < dt / 90) emit(s.tip, 1, false);
    } else if (s.exhaleStart !== null) {
      const k = Math.min(1, (now - s.exhaleStart) / s.exhaleMs);
      glowTarget = s.finishing ? 0 : 0.18 + 0.3 * (1 - k);
      if (ring) { ring.style.strokeDashoffset = String(RING_LEN * k); ring.dataset.mode = 'out'; }
      // A breath is strongest at its start and thins out.
      const rate = (1 - k) * 2.2;
      const n = Math.floor(rate * (dt / 16) + Math.random());
      if (n > 0) emit(s.mouth, n, true);
      if (s.substance !== 'vape' && !s.finishing && Math.random() < dt / 160) emit(s.tip, 1, false);
      if (k >= 1) {
        s.exhaleStart = null;
        if (ring) ring.style.strokeDashoffset = String(RING_LEN);
        if (s.finishing) markPassed();
        else setPhase((p) => (p === 'exhaling' ? 'idle' : p));
      }
    } else if (!s.finishing && s.substance !== 'vape' && s.puffs > 0 && Math.random() < dt / 260) {
      // A lit end keeps a thread of smoke while it is held between puffs —
      // only while particles are already alive, so the loop can still stop.
      if (s.particles.length > 0) emit(s.tip, 1, false);
    }
    s.glow += (glowTarget - s.glow) * Math.min(1, dt / 140);

    // Particles: slow rise, drift, a little curl.
    for (const p of s.particles) {
      p.life += dt;
      p.x += p.vx * dt + Math.sin((p.life + p.seed) / 420) * 0.12;
      p.y += p.vy * dt;
      p.vy *= 0.9995;
      p.r += p.grow * dt;
    }
    s.particles = s.particles.filter((p) => p.life < p.max);

    draw();

    const settling = Math.abs(glowTarget - s.glow) > 0.004;
    if (s.holdStart !== null || s.exhaleStart !== null || s.particles.length > 0 || settling) {
      s.raf = requestAnimationFrame(tick);
    } else {
      s.raf = null;
      s.last = 0;
    }
  }, [draw, emit, markPassed]);

  const kick = useCallback(() => {
    const s = sim.current;
    if (s.raf === null) { s.last = 0; s.raf = requestAnimationFrame(tick); }
  }, [tick]);

  // Canvas sizing and the loop's cleanup. The canvas exists only once a
  // ritual is chosen, so the effect re-runs when it appears.
  const showCanvas = phase !== 'choose';
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!showCanvas || !canvas) return undefined;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const s = sim.current;
      s.dpr = Math.min(2, window.devicePixelRatio || 1);
      s.w = rect.width; s.h = rect.height;
      canvas.width = Math.round(rect.width * s.dpr);
      canvas.height = Math.round(rect.height * s.dpr);
      draw();
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(canvas);
    const s = sim.current;
    return () => {
      ro?.disconnect();
      if (s.raf !== null) cancelAnimationFrame(s.raf);
      s.raf = null;
    };
  }, [draw, showCanvas]);

  const startHold = useCallback(() => {
    const s = sim.current;
    if (s.finishing || s.holdStart !== null) return;
    s.exhaleStart = null;
    s.holdStart = performance.now();
    setTooShort(false);
    setPhase('inhaling');
    kick();
  }, [kick]);

  const endHold = useCallback(() => {
    const s = sim.current;
    if (s.holdStart === null) return;
    const held = performance.now() - s.holdStart;
    s.holdStart = null;
    if (held < MIN_PUFF_MS) {
      s.burn = s.puffs / PUFFS[s.substance];
      setTooShort(true);
      setPhase('idle');
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_LEN);
      kick();
      return;
    }
    s.puffs += 1;
    s.burn = s.puffs / PUFFS[s.substance];
    setPuffs(s.puffs);
    s.exhaleMs = exhaleDuration(held);
    s.exhaleStart = performance.now();
    if (s.puffs >= PUFFS[s.substance]) {
      s.finishing = true;
      // Logged NOW, not when the last breath ends: the screen already says
      // "Craving passed", and leaving during the exhale must not lose it.
      markPassed();
    }
    setPhase(s.finishing ? 'finished' : 'exhaling');
    kick();
  }, [kick, markPassed]);

  const finishNow = useCallback(() => {
    const s = sim.current;
    s.holdStart = null;
    s.finishing = true;
    setPhase('finished');
    markPassed();
    kick();
  }, [kick, markPassed]);

  // Space bar = hold. Key repeat is ignored; Escape closes.
  useEffect(() => {
    if (phase === 'choose') return undefined;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) startHold(); }
      else if (e.key === 'Escape') onClose();
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); endHold(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [phase, startHold, endHold, onClose]);

  // The tap that opened the scene can land a second time on a card that just
  // appeared under the pointer (a double click). Ignore picks in the first
  // 350 ms so a ritual is always chosen on purpose.
  const openedAt = useRef(performance.now());
  const choose = (sub: Substance) => {
    if (performance.now() - openedAt.current < 350) return;
    setSubstance(sub);
    sim.current.substance = sub;
    setPhase('idle');
  };

  let hint: string;
  if (phase === 'inhaling') hint = t('virtual.inhale');
  else if (phase === 'exhaling') hint = t('virtual.exhale');
  else if (tooShort) hint = t('virtual.short');
  else hint = t('virtual.hold');

  return (
    <div className={far ? 'em-scene em-scene-far' : 'em-scene'} role="dialog" aria-modal="true" aria-label={t('action.cravingSub')}>
      <button type="button" className="em-scene-close" onClick={onClose}>{t('virtual.close')}</button>

      {phase === 'choose' ? (
        <div className="em-scene-choose">
          <h2 className="em-serif">{t('virtual.choose')}</h2>
          <div className="em-choose-row">
            {offered.map((s) => (
              <button key={s} type="button" className={`em-choose-card em-c-${s}`} onClick={() => choose(s)}>
                <SubstanceIcon substance={s} size={40} />
                <span>{t(`substance.${s}`)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} className="em-scene-canvas" aria-hidden="true" />

          {phase === 'finished' ? (
            <div className="em-scene-finished" aria-live="polite">
              <div className="em-serif em-finished-title">{t('virtual.finished')}</div>
              {passedAt !== null && <div className="em-finished-sub">{t('virtual.finishedSub', { time: formatClock(passedAt) })}</div>}
              <button type="button" className="em-btn em-btn-calm" onClick={onClose}>{t('virtual.back')}</button>
            </div>
          ) : (
            <div className="em-scene-controls">
              <div className="em-scene-puffs">{t('virtual.puff', { n: Math.min(puffs + (phase === 'inhaling' ? 1 : 0), total), total })}</div>
              <div className={`em-scene-hint em-phase-${phase}`} aria-live="polite">{hint}</div>
              <button
                type="button"
                className={`em-hold em-c-${substance}${phase === 'inhaling' ? ' em-hold-on' : ''}`}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startHold(); }}
                onPointerUp={endHold}
                onPointerCancel={endHold}
                onLostPointerCapture={endHold}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) startHold(); }}
                onKeyUp={(e) => { if (e.key === 'Enter') endHold(); }}
                aria-label={t('virtual.hold')}
              >
                <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
                  <circle cx="100" cy="100" r={RING_R} className="em-hold-track" />
                  <circle ref={ringRef} cx="100" cy="100" r={RING_R} className="em-hold-ring" strokeDasharray={RING_LEN} strokeDashoffset={RING_LEN} transform="rotate(-90 100 100)" />
                </svg>
                <span className="em-hold-icon"><SubstanceIcon substance={substance} size={52} /></span>
              </button>
              <div className="em-scene-keyhint">{t('virtual.keyHint')}</div>
              {/* Always laid out, hidden before the first puff: appearing must not
                  shrink the canvas and make the object jump. */}
              <button type="button" className="em-btn em-btn-calm em-scene-done" onClick={finishNow}
                style={puffs > 0 ? undefined : { visibility: 'hidden' }} tabIndex={puffs > 0 ? 0 : -1} aria-hidden={puffs === 0}>
                {t('virtual.done')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
