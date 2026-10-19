/* Stringlish brand kit, shared by the hub, 4-Guess and Timed. Keep the three copies identical. */
import React, { useEffect, useRef, useState } from 'react';
import {
  NUNITO_BLACK,
  NUNITO_XBOLD,
  CAP,
  WORDMARK_PATHS,
  WORDMARK_X,
  WORDMARK_LINES,
  WORDMARK_LINE_Y,
  ICON_TILES,
  ICON_DASHES,
} from './glyphs';

/* ------------------------------------------------------------------ */
/* Palette, type and copy                                               */
/* ------------------------------------------------------------------ */

export const INK = '#58595B';
export const HOME_BG = '#FFF8EE';
export const WHITE = '#FFFFFF';
export const LINE = '#58595B40';
export const HAIR = '#58595B1F';
export const FAINT = '#58595B14';
export const BAR = '#58595B33';
export const SCRIM = '#2F30318C';
export const PLACEHOLDER = '#737477';
export const MISS_FILL = '#58595B29';
export const MISS_MARK = '#58595B99';
export const KEY_DOWN = '#D5D5D6';
export const LETTER_COLORS = ['#EE6C14', '#5876D8', '#EBB51F'];
export const KEY_TINTS = ['#FAD3B8', '#CDD6F3', '#F9E9BC'];
export const ERROR_TEXT = '#A84B0E';
export const DONE_BG = '#EDE3D3';
export const TINT = { '4-Guess': '#EAEEFA', Timed: '#FCE9DB' };
export const DEEP = { '4-Guess': '#42538A', Timed: '#9A501D' };
export const MODES = ['4-Guess', 'Timed'];
const ICON_LINE = '#494949';
const ICON_DASH = '#404041';

export const NUNITO = '"Nunito Variable", Nunito, ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif';

export const IN_PROGRESS = { '4-Guess': 'Keep Trying', Timed: 'You Got This' };
export const STATE_EMOJI = { inprogress: '💪', won: '🤩', lost: '🫠' };
export const STEP1_RULES = [
  ['🧠', 'Make words using 3 provided letters'],
  ['🔤', 'Keep them in order'],
  ['🤹', 'Add extra letters before, after, or between'],
];
export const COUNT_RULES = [
  ['🖐️', '5+ letters per word'],
  ['🤬', 'No proper nouns or cuss words'],
];
export const MODE_PITCH = {
  '4-Guess': 'Four guesses. A point for every letter. Go long!',
  Timed: 'Three rounds. Against the clock. Go fast!',
};
export const SCORE_TIERS = ['≥ 40', '30–39', '20–29', '10–19', '1–9'];
export const TIME_TIERS = ['< 30s', '30–60s', '1–2 min', '2–3 min', '> 3 min'];

export const r2 = (v) => Math.round(v * 100) / 100;
export const center = { display: 'flex', justifyContent: 'center', alignItems: 'center' };
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const titleCase = (w) => String(w || '').charAt(0).toUpperCase() + String(w || '').slice(1).toLowerCase();

export function nun(size, weight = 600, extra = {}) {
  return { fontFamily: NUNITO, fontSize: size, fontWeight: weight, lineHeight: 1.25, color: INK, ...extra };
}

/** Banner emoji and message for a 4-Guess score. */
export function scoreTier(s) {
  if (s <= 0) return { emoji: ['🍀', '🍀'], message: 'Better Luck Next Time!' };
  if (s <= 9) return { emoji: ['😏', '😏'], message: 'Getting There!' };
  if (s <= 19) return { emoji: ['😊', '😊'], message: 'Nicely Done!' };
  if (s <= 29) return { emoji: ['🤩', '🤩'], message: 'Great Job!' };
  if (s <= 39) return { emoji: ['😍', '😍'], message: 'Stupendous!' };
  return { emoji: ['🥳', '🎉'], message: 'Perfect!' };
}

const resetButton = {
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'none',
  border: 'none',
  margin: 0,
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setReduced(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', on);
    else mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else mq.removeListener(on);
    };
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/* Letters, compositions and motion                                     */
/* ------------------------------------------------------------------ */

function bounds(ext, pad) {
  return ext.map((e, k) => ({
    left: k === 0 ? e.l - pad : (ext[k - 1].r + e.l) / 2,
    right: k === ext.length - 1 ? e.r + pad : (e.r + ext[k + 1].l) / 2,
  }));
}

/** For each letter of `word`, the index of the provided letter it uses (in order), or -1. */
export function matchMarks(word, letters) {
  const out = [...word].map(() => -1);
  let j = 0;
  for (let i = 0; i < word.length && j < letters.length; i += 1) {
    if (word[i] === letters[j]) {
      out[i] = j;
      j += 1;
    }
  }
  return out;
}

const glyphFor = (ch, given) => (given ? NUNITO_BLACK[ch] : NUNITO_XBOLD[ch]) || NUNITO_BLACK[ch] || NUNITO_BLACK.O;

function placeLetters(word, marks, size, outline, gap) {
  const k = size / 1000;
  const breathe = size * 0.03;
  const out = [];
  let x = 0;
  [...word].forEach((ch, i) => {
    const mark = marks[i] ?? -1;
    const g = glyphFor(ch, mark >= 0);
    const o = mark >= 0 ? outline : 0;
    const prev = out[out.length - 1];
    if (gap !== undefined) x = prev ? prev.r + gap + o - g[1] * k : o - g[1] * k;
    else x += o + (mark >= 0 && prev ? breathe : 0);
    const p = { mark, g, x, l: x + g[1] * k - o, r: x + g[3] * k + o };
    out.push(p);
    if (gap === undefined) x += g[0] * k + o + (mark >= 0 ? breathe : 0);
  });
  return out;
}

function LetterArt({ p, size, outline }) {
  const k = size / 1000;
  const tf = `translate(${r2(p.x)} 0) scale(${k} ${-k})`;
  if (p.mark < 0) return <path transform={tf} d={p.g[5]} fill={INK} />;
  const color = LETTER_COLORS[p.mark];
  const cap = CAP * k;
  const t = cap * 0.11;
  const uy = cap * 0.4;
  const inkL = p.x + p.g[1] * k;
  const inkR = p.x + p.g[3] * k;
  const half = Math.max(inkR - inkL, cap * 0.55) / 2 - t / 2;
  const cx = (inkL + inkR) / 2;
  return (
    <g>
      {outline > 0 && <path transform={tf} d={p.g[5]} fill={INK} stroke={INK} strokeWidth={(2 * outline) / k} strokeLinejoin="round" />}
      <path transform={tf} d={p.g[5]} fill={color} />
      <line x1={r2(cx - half)} x2={r2(cx + half)} y1={r2(uy)} y2={r2(uy)} stroke={color} strokeWidth={r2(t)} strokeLinecap="round" />
    </g>
  );
}

/** Lays out `word` as glyph art; letters with a mark >= 0 are drawn as colored provided letters. */
export function lettersComp(word, marks, size, opts = {}) {
  const upper = String(word || '').toUpperCase();
  const outline = opts.outline ?? size * 0.035;
  const k = size / 1000;
  const cap = CAP * k;
  const placed = placeLetters(upper, marks, size, outline, opts.gap);
  if (!placed.length) return { pieces: [], box: [0, 0, 1, 1], label: '' };
  const bd = bounds(placed, 4);
  const pieces = placed.map((p, i) => ({ ...bd[i], given: p.mark >= 0, node: <LetterArt p={p} size={size} outline={outline} /> }));
  const top = -Math.max(...placed.map((p) => p.g[4])) * k - outline - 3;
  const bottom = Math.max(cap * 0.455, ...placed.map((p) => -p.g[2] * k)) + 3;
  return { pieces, box: [bd[0].left, top, bd[bd.length - 1].right - bd[0].left, bottom - top], label: upper };
}

/** The three provided letters, spaced apart. */
export const providedComp = (letters, size = 56) => lettersComp(String(letters || '').slice(0, 3), [0, 1, 2], size, { gap: size * 0.72 });

function wordmarkComp() {
  const bd = bounds(
    WORDMARK_X.map(([l, r]) => ({ l, r })),
    4,
  );
  const pieces = WORDMARK_PATHS.map((d, i) => {
    const u = WORDMARK_LINES.find((w) => w.at === i);
    const j = WORDMARK_LINES.findIndex((w) => w.at === i);
    return {
      ...bd[i],
      given: !!u,
      node: (
        <g>
          <path d={d} fill={INK} />
          {u && <line x1={u.x1} y1={WORDMARK_LINE_Y} x2={u.x2} y2={WORDMARK_LINE_Y} stroke={LETTER_COLORS[j]} strokeWidth={6} strokeLinecap="round" />}
        </g>
      ),
    };
  });
  return { pieces, box: [204, 567, 384, 92], label: 'stringlish' };
}

const WORDMARK = wordmarkComp();
export const LIN = lettersComp('LIN', [0, 1, 2], 64, { gap: 40 });
export const PLACING = lettersComp('PLACING', matchMarks('PLACING', 'LIN'), 64);
export const NAILS = lettersComp('NAILS', [2, -1, 1, 0, -1], 64);

const LOOP = '7s';
const MOVE_TIMES = '0;0.50;0.64;0.78;0.94;1';
const MOVE_SPLINES = '0 0 1 1;0.45 0 0.2 1;0 0 1 1;0.45 0 0.2 1;0 0 1 1';

function Slide({ dx }) {
  const v = `${r2(dx)} 0`;
  return (
    <animateTransform
      attributeName="transform"
      type="translate"
      values={`0 0;0 0;${v};${v};0 0;0 0`}
      keyTimes={MOVE_TIMES}
      calcMode="spline"
      keySplines={MOVE_SPLINES}
      dur={LOOP}
      repeatCount="indefinite"
    />
  );
}

function Unfold() {
  return (
    <animateTransform
      attributeName="transform"
      type="scale"
      values="1 1;1 1;0.001 1;0.001 1;1 1;1 1"
      keyTimes={MOVE_TIMES}
      calcMode="spline"
      keySplines={MOVE_SPLINES}
      dur={LOOP}
      repeatCount="indefinite"
    />
  );
}

/** Starts as the full word, folds away the extra letters so the provided ones meet, then unfolds again. */
function UnfoldPieces({ comp, spread }) {
  const panels = [];
  comp.pieces.forEach((p) => {
    const last = panels[panels.length - 1];
    if (!p.given && last && !last.flat) {
      last.right = p.right;
      last.nodes.push(p.node);
    } else {
      panels.push({ left: p.left, right: p.right, flat: p.given, nodes: [p.node] });
    }
  });
  const x0 = panels[0].left;
  const x1 = panels[panels.length - 1].right;
  const spaceAfter = panels.map((pn, k) => (pn.flat && panels[k + 1] && !panels[k + 1].flat && panels.slice(k + 2).some((q) => q.flat) ? spread : 0));
  const flatW = panels.reduce((acc, pn, k) => acc + (pn.flat ? pn.right - pn.left + spaceAfter[k] : 0), 0);
  let cursor = x0 + (x1 - x0 - flatW) / 2;
  const shifts = panels.map((pn, k) => {
    const dx = cursor - pn.left;
    if (pn.flat) cursor += pn.right - pn.left + spaceAfter[k];
    return dx;
  });
  return (
    <g>
      {panels.map((pn, k) => (
        <g key={k}>
          <Slide dx={shifts[k]} />
          <g transform={`translate(${r2(pn.left)} 0)`}>
            <g>
              {!pn.flat && <Unfold />}
              <g transform={`translate(${r2(-pn.left)} 0)`}>
                <g>
                  {!pn.flat && <animate attributeName="opacity" values="1;1;0;0;1;1" keyTimes={MOVE_TIMES} dur={LOOP} repeatCount="indefinite" />}
                  {pn.nodes.map((n, i) => (
                    <g key={i}>{n}</g>
                  ))}
                </g>
              </g>
            </g>
          </g>
        </g>
      ))}
    </g>
  );
}

/** Renders a composition. `px` is the rendered width per 100 composition units. */
export function Art({ comp, motion = null, px = 100, style }) {
  const reduced = usePrefersReducedMotion();
  const [x, y, w, h] = comp.box;
  const animate = motion === 'unfold' && !reduced;
  return (
    <svg
      key={animate ? 'unfold' : 'still'}
      viewBox={`${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}`}
      role="img"
      aria-label={comp.label}
      style={{ display: 'block', width: r2((w * px) / 100), maxWidth: '100%', height: 'auto', overflow: 'visible', flexShrink: 0, ...style }}
    >
      {animate ? <UnfoldPieces comp={comp} spread={h * 0.07} /> : comp.pieces.map((p, i) => <g key={i}>{p.node}</g>)}
    </svg>
  );
}

export function ProvidedLetters({ letters, size = 56, style }) {
  const comp = React.useMemo(() => providedComp(letters, size), [letters, size]);
  if (!letters) return null;
  return <Art comp={comp} style={style} />;
}

export function Wordmark({ width }) {
  const [x, y, w, h] = WORDMARK.box;
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label="stringlish" style={{ display: 'block', width, height: 'auto', overflow: 'visible' }}>
      {WORDMARK.pieces.map((p, i) => (
        <g key={i}>{p.node}</g>
      ))}
    </svg>
  );
}

export const INTRO_MS = 2600;
export const FADE_MS = 320;

/** Fill-in wordmark: the three colored letters wait while the rest drop into place. Remount (key) to replay. */
export function IntroWordmark({ width, leaving = false }) {
  const [x, y, w, h] = WORDMARK.box;
  const dy = h * 0.16;
  let order = 0;
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label="stringlish" style={{ display: 'block', width, height: 'auto', overflow: 'visible' }}>
      {WORDMARK.pieces.map((p, i) => {
        if (p.given) return <g key={i}>{p.node}</g>;
        if (leaving) {
          return (
            <g key={i} style={{ animation: `sl-out ${FADE_MS - 60}ms ease-in both` }}>
              {p.node}
            </g>
          );
        }
        const begin = `${(0.35 + order * 0.16).toFixed(2)}s`;
        order += 1;
        return (
          <g key={i} opacity={0}>
            <animate attributeName="opacity" from="0" to="1" begin={begin} dur="0.15s" fill="freeze" />
            <animateTransform attributeName="transform" type="translate" from={`0 ${r2(-dy)}`} to="0 0" begin={begin} dur="0.3s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.3 0 0.2 1" />
            {p.node}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Full-screen intro shown when a mode starts. Plays once (INTRO_MS); if `ready` is still false,
 * the added letters fade out and it plays again, checking after each play. Calls onDone once.
 */
export function IntroScreen({ mode, ready, onDone, big = false }) {
  const reduced = usePrefersReducedMotion();
  const [cycle, setCycle] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const finished = useRef(false);
  useEffect(() => {
    if (leaving) {
      const t = window.setTimeout(() => {
        setLeaving(false);
        setCycle((c) => c + 1);
      }, FADE_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(
      () => {
        if (readyRef.current) {
          if (!finished.current) {
            finished.current = true;
            if (doneRef.current) doneRef.current();
          }
        } else if (reduced) setCycle((c) => c + 1);
        else setLeaving(true);
      },
      reduced ? 700 : INTRO_MS,
    );
    return () => window.clearTimeout(t);
  }, [cycle, leaving, reduced]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: TINT[mode], ...center, flexDirection: 'column', gap: big ? 22 : 18, zIndex: 40 }} aria-busy={!ready} aria-label={`Starting ${mode}`}>
      {reduced ? <Wordmark width={big ? 320 : 250} /> : <IntroWordmark key={`${cycle}-${leaving}`} width={big ? 320 : 250} leaving={leaving} />}
      <ModeLabel mode={mode} big={big} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

export function GameIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="352.28 518.05 108.3 108.3" role="img" aria-label="Stringlish game icon" style={{ display: 'block', flexShrink: 0 }}>
      <rect x={353.28} y={519.05} width={106.3} height={106.3} rx={6.77} fill={HOME_BG} stroke={ICON_LINE} strokeWidth={2} />
      {ICON_DASHES.map(([x, y]) => (
        <line key={`${x}-${y}`} x1={x} y1={y} x2={x + 4.42} y2={y} stroke={ICON_DASH} strokeWidth={2} strokeLinecap="round" />
      ))}
      {ICON_TILES.map((tile, i) => (
        <g key={tile.x}>
          <rect x={tile.x} y={tile.y} width={26.43} height={27.82} rx={4.26} fill={WHITE} />
          <rect x={tile.x} y={tile.y} width={26.43} height={27.82} rx={4.26} fill={LETTER_COLORS[i]} opacity={0.7} />
          <line x1={tile.bar[0]} y1={tile.bar[2]} x2={tile.bar[1]} y2={tile.bar[2]} stroke={HOME_BG} strokeWidth={2} strokeLinecap="round" />
          <rect x={tile.x} y={tile.y} width={26.43} height={27.82} rx={4.26} fill="none" stroke={ICON_LINE} strokeWidth={1.5} />
        </g>
      ))}
    </svg>
  );
}

/** Names: back, home, stats, help, check, x, chevron, share, mail, bug. */
export function Icon({ name, size = 22, color = INK }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
      {name === 'back' && <path d="M14.5 5.5 8 12l6.5 6.5" {...s} strokeWidth={2.4} />}
      {name === 'home' && <path d="M4 11.2 12 4.5l8 6.7M6.3 9.6V19.5h11.4V9.6M10 19.5v-5h4v5" {...s} />}
      {name === 'stats' && (
        <g fill={color}>
          <rect x={3.5} y={12} width={4.4} height={8.5} rx={1.4} />
          <rect x={9.8} y={4.5} width={4.4} height={16} rx={1.4} />
          <rect x={16.1} y={8.5} width={4.4} height={12} rx={1.4} />
        </g>
      )}
      {name === 'help' && (
        <g>
          <circle cx={12} cy={12} r={9.2} {...s} />
          <path d="M9.4 9.4a2.7 2.7 0 1 1 3.8 2.5c-.8.4-1.2.9-1.2 1.8v.4" {...s} />
          <circle cx={12} cy={17.2} r={1.25} fill={color} />
        </g>
      )}
      {name === 'check' && <path d="M6 12.5l4 4 8-9" {...s} strokeWidth={2.6} />}
      {name === 'x' && <path d="M7.5 7.5l9 9M16.5 7.5l-9 9" {...s} strokeWidth={2.6} />}
      {name === 'chevron' && <path d="M7 9.5l5 5 5-5" {...s} strokeWidth={2.4} />}
      {name === 'share' && (
        <g>
          <path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4" {...s} />
          <circle cx={18} cy={5.5} r={2.7} fill={color} />
          <circle cx={6} cy={12} r={2.7} fill={color} />
          <circle cx={18} cy={18.5} r={2.7} fill={color} />
        </g>
      )}
      {name === 'mail' && (
        <g>
          <rect x={3.5} y={6} width={17} height={12.5} rx={2.2} {...s} />
          <path d="M4.5 7.5l7.5 5.5 7.5-5.5" {...s} />
        </g>
      )}
      {name === 'bug' && (
        <g>
          <ellipse cx={12} cy={13.8} rx={5} ry={6} {...s} />
          <path d="M9.4 8.2a2.6 2.6 0 0 1 5.2 0M12 9.8v10M4.6 10.6l2.9 1.4M19.4 10.6l-2.9 1.4M4.2 15h2.8M19.8 15H17M5.2 19.4l2.6-1.6M18.8 19.4l-2.6-1.6" {...s} />
        </g>
      )}
    </svg>
  );
}

/** 4-Guess is a crystal ball, Timed an alarm clock. */
export function ModeGlyph({ mode, size = 20, color = INK }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 2.1, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return mode === '4-Guess' ? (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={12} cy={10.2} r={7.2} {...s} />
      <path d="M7.4 20.6h9.2l-1.7-3.3H9.1z" {...s} />
      <path d="M10.2 6.4v3.4M8.5 8.1h3.4" {...s} strokeWidth={1.8} />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={12} cy={13.2} r={7.3} {...s} />
      <path d="M12 9.6v3.8l2.5 1.6" {...s} />
      <path d="M4.3 6.8l2.9-2.5M19.7 6.8l-2.9-2.5" {...s} />
    </svg>
  );
}

/** Font Awesome `faList`, the icon 4-Guess already used for Your Guesses. */
export function GuessListIcon({ size = 22, color = INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
      <path
        fill={color}
        d="M40 48C26.7 48 16 58.7 16 72l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24L40 48zM192 64c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L192 64zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-288 0zm0 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l288 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-288 0zM16 232l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24l-48 0c-13.3 0-24 10.7-24 24zM40 368c-13.3 0-24 10.7-24 24l0 48c0 13.3 10.7 24 24 24l48 0c13.3 0 24-10.7 24-24l0-48c0-13.3-10.7-24-24-24l-48 0z"
      />
    </svg>
  );
}

/** Icon-only button (or link when `href` is set). */
export function IconButton({ name, label, size = 22, onClick, href, buttonRef, style }) {
  const box = { ...resetButton, ...center, width: size + 12, height: size + 12, borderRadius: 8, ...style };
  if (href) {
    return (
      <a href={href} aria-label={label} title={label} className="sl-tap" style={{ ...box, textDecoration: 'none' }} ref={buttonRef}>
        <Icon name={name} size={size} />
      </a>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} className="sl-tap" style={box} onClick={onClick} ref={buttonRef}>
      <Icon name={name} size={size} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Game pieces                                                          */
/* ------------------------------------------------------------------ */

/** Back and wordmark both lead home; stats and help sit on the right. */
export function TopBar({ big = false, homeHref = '/', onStats, onHelp, statsRef, helpRef, showStats = true, showHelp = true }) {
  const size = big ? 26 : 22;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', height: big ? 44 : 36, flexShrink: 0 }}>
      <div style={{ display: 'flex' }}>
        <IconButton name="back" label="Back to home" size={size} href={homeHref} />
      </div>
      <a href={homeHref} aria-label="Go to home" title="Go to home" className="sl-tap" style={{ display: 'block' }}>
        <Wordmark width={big ? 150 : 112} />
      </a>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {showStats && <IconButton name="stats" label="Statistics" size={size} onClick={onStats} buttonRef={statsRef} />}
        {showHelp && <IconButton name="help" label="How to play" size={size} onClick={onHelp} buttonRef={helpRef} />}
      </div>
    </div>
  );
}

export function ModeLabel({ mode, big = false }) {
  return (
    <div style={{ ...center, gap: 6, height: big ? 26 : 20, flexShrink: 0 }}>
      <ModeGlyph mode={mode} size={big ? 22 : 18} />
      <span style={nun(big ? 18 : 15, 800)}>{mode}</span>
    </div>
  );
}

/** Score (4-Guess) or clock (Timed) chip, with Give Up on the right. Bump `pop` to replay the pop. */
export function StatusRow({ left, pop = 0, big = false, onGiveUp, showGiveUp = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, height: big ? 36 : 30, flexShrink: 0, overflow: 'visible' }}>
      <div
        key={pop}
        className={pop ? 'sl-score-pop' : undefined}
        style={{
          ...nun(big ? 16 : 14, 700),
          padding: '4px 10px',
          borderRadius: 8,
          border: `1.5px solid ${LINE}`,
          background: '#FFFFFF8C',
          fontVariantNumeric: 'tabular-nums',
          transformOrigin: 'center center',
        }}
      >
        {left}
      </div>
      {showGiveUp && onGiveUp && (
        <button type="button" className="sl-tap" onClick={onGiveUp} style={{ ...resetButton, ...nun(big ? 15 : 13.5, 700), textDecoration: 'underline', textUnderlineOffset: 3, padding: '4px 2px' }}>
          Give Up?
        </button>
      )}
    </div>
  );
}

/** Font size for the typed word: shrinks past `fit` characters so long words stay on one line. */
export function typedFontSize(len, base = 28, fit = 11, min = 15) {
  return len > fit ? Math.max(min, Math.floor((base * fit) / len)) : base;
}

/** Underlined entry line (phones and tablets); pair with className "sl-input" on a real input. */
export function inputLineStyle(len, base = 28) {
  return {
    display: 'block',
    margin: '4px auto 0',
    width: '84%',
    height: base + 12,
    boxSizing: 'border-box',
    border: 'none',
    borderBottom: `2px solid ${LINE}`,
    borderRadius: 0,
    background: 'transparent',
    outline: 'none',
    padding: '0 0 4px',
    textAlign: 'center',
    caretColor: 'transparent',
    ...nun(typedFontSize(len, base), 700, { letterSpacing: '0.04em', lineHeight: 1 }),
  };
}

/** Desktop entry field (no on-screen keyboard); pair with className "sl-input". */
export function desktopInputStyle(len) {
  return {
    display: 'block',
    margin: '6px auto 0',
    width: '72%',
    height: 56,
    boxSizing: 'border-box',
    border: 'none',
    borderBottom: `2px solid ${LINE}`,
    borderRadius: 0,
    background: 'transparent',
    outline: 'none',
    textAlign: 'center',
    ...nun(typedFontSize(len, 36, 14, 18), 700, { letterSpacing: '0.04em' }),
  };
}

/**
 * Moves an input style's underline onto a wrapper so the field can scale (hint pop) while the line stays still.
 * Put `frame` on the wrapping div and `field` on the <input>.
 */
export function splitUnderline(style) {
  const { display, margin, width, height, borderBottom, ...field } = style;
  return {
    frame: { display: 'block', margin, width, height, boxSizing: 'border-box', borderBottom },
    field: { ...field, display: 'block', width: '100%', height: '100%', margin: 0, boxSizing: 'border-box', transformOrigin: 'center center' },
  };
}

export function SubmitButton({ ready, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="sl-tap"
      style={{
        ...resetButton,
        ...center,
        alignSelf: 'center',
        width: 180,
        height: 44,
        margin: '14px auto 0',
        borderRadius: 10,
        flexShrink: 0,
        background: ready ? INK : '#FFFFFF80',
        border: `1.5px solid ${ready ? INK : LINE}`,
        ...nun(17, 800, { color: ready ? WHITE : INK }),
      }}
    >
      <span style={{ opacity: ready ? 1 : 0.4 }}>Submit</span>
    </button>
  );
}

function hintPath(w, h, r, sw) {
  const i = sw / 2;
  const rr = r - i;
  return `M ${w / 2} ${i} H ${w - i - rr} A ${rr} ${rr} 0 0 1 ${w - i} ${i + rr} V ${h - i - rr} A ${rr} ${rr} 0 0 1 ${w - i - rr} ${h - i} H ${i + rr} A ${rr} ${rr} 0 0 1 ${i} ${h - i - rr} V ${i + rr} A ${rr} ${rr} 0 0 1 ${i + rr} ${i} Z`;
}

/** state: 'loading' (border fills clockwise with progress 0..1), 'ready', or 'used'. `pop` replays the pop when a hint is taken. */
export function HintButton({ state, progress = 0, onClick, buttonRef, pop = false }) {
  const w = 54;
  const h = 32;
  const d = hintPath(w, h, 9, 2.2);
  const ready = state === 'ready';
  const p = Math.max(0, Math.min(1, progress));
  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onClick}
      className="sl-tap"
      aria-label={ready ? 'Hint' : state === 'used' ? 'Hint used' : 'Hint available after 30 seconds'}
      title={ready ? 'Hint' : state === 'used' ? 'Hint used' : 'Hint available after 30 seconds'}
      style={{
        ...resetButton,
        ...center,
        position: 'relative',
        width: w,
        height: h,
        flexShrink: 0,
        borderRadius: 9,
        background: ready ? INK : state === 'used' ? '#58595B2E' : '#FFFFFF73',
        animation: pop ? 'sl-hint-pop 0.3s ease-out' : ready ? 'sl-pop 0.3s ease-out' : undefined,
      }}
    >
      {!ready && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          <path d={d} fill="none" stroke={LINE} strokeWidth={1.5} />
          {state === 'loading' && (
            <path d={d} fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
          )}
        </svg>
      )}
      <span style={{ position: 'relative', ...nun(13.5, ready ? 800 : 700, { color: ready ? WHITE : INK, opacity: state === 'loading' ? 0.45 : state === 'used' ? 0.7 : 1 }) }}>Hint</span>
    </button>
  );
}

/** state: 'ok' | 'miss' | 'now' | 'empty'. */
export function GuessDot({ state, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" style={{ display: 'block' }}>
      {state === 'ok' && (
        <g>
          <circle cx={11} cy={11} r={10.5} fill={INK} />
          <path d="M6.6 11.4l3 3 5.8-6.4" fill="none" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {state === 'miss' && (
        <g>
          <circle cx={11} cy={11} r={10.5} fill={MISS_FILL} />
          <path d="M7.9 7.9l6.2 6.2M14.1 7.9l-6.2 6.2" stroke={MISS_MARK} strokeWidth={2} strokeLinecap="round" />
        </g>
      )}
      {state === 'now' && <circle cx={11} cy={11} r={9.75} fill={WHITE} stroke={INK} strokeWidth={2} />}
      {state === 'empty' && <circle cx={11} cy={11} r={9.75} fill="none" stroke={LINE} strokeWidth={1.5} />}
    </svg>
  );
}

/** One dot per guess. `results` is [{ ok }]; `popIndex` + changing `popKey` replays the pop on that dot. */
export function GuessDots({ results, total = 4, popIndex = -1, popKey = 0, current = true }) {
  return (
    <div style={{ display: 'flex', gap: 8 }} role="img" aria-label={`${results.length} of ${total} guesses used`}>
      {Array.from({ length: total }, (_, i) => {
        const st = i < results.length ? (results[i].ok ? 'ok' : 'miss') : i === results.length && current ? 'now' : 'empty';
        const popping = i === popIndex && popKey > 0;
        return (
          <span key={popping ? `p${popKey}` : `d${i}`} className={popping ? 'sl-dot-pop' : undefined} style={{ display: 'block' }}>
            <GuessDot state={st} />
          </span>
        );
      })}
    </div>
  );
}

/** The Your Guesses list icon with its chevron. */
export function GuessListToggle({ open, onClick, buttonRef }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onClick}
      aria-expanded={open}
      aria-label="Your guesses"
      title="Your guesses"
      className="sl-tap"
      style={{
        ...resetButton,
        ...center,
        flexDirection: 'column',
        gap: 2,
        minWidth: 36,
        padding: '3px 6px 2px',
        borderRadius: 8,
        background: open ? '#FFFFFFB8' : 'transparent',
      }}
    >
      <GuessListIcon size={20} />
      <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s ease-out' }}>
        <Icon name="chevron" size={9} color={PLACEHOLDER} />
      </span>
    </button>
  );
}

/** Popover card listing guesses. Position it under the toggle; `arrowLeft` lines the arrow up with the icon. */
export function GuessPopoverPanel({ results, onClose, wide = false, arrowLeft = 16, style, panelRef }) {
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Your guesses"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        width: wide ? 280 : 228,
        maxWidth: 'min(280px, 78vw)',
        boxSizing: 'border-box',
        background: HOME_BG,
        borderRadius: 12,
        border: `1px solid ${LINE}`,
        padding: '10px 12px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        textAlign: 'left',
        color: INK,
        fontFamily: NUNITO,
        animation: 'sl-fade 0.18s ease-out',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -6,
          left: arrowLeft,
          width: 12,
          height: 12,
          background: HOME_BG,
          borderLeft: `1px solid ${LINE}`,
          borderTop: `1px solid ${LINE}`,
          transform: 'rotate(45deg)',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <span style={nun(14, 800)}>Your Guesses</span>
        <button type="button" aria-label="Close" className="sl-tap" onClick={onClose} style={{ ...resetButton, ...nun(20, 600, { lineHeight: 1, padding: '0 2px' }) }}>
          {'\u00d7'}
        </button>
      </div>
      {results.length === 0 ? (
        <span style={nun(14, 600, { color: PLACEHOLDER })}>No guesses yet</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7 }}>
          {results.map((g, i) => (
            <GuessChip key={`${g.word}-${i}`} word={titleCase(g.word)} len={String(g.word || '').length} ok={g.ok} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Timed: round chips 1–3 with the Hint button after a divider. `round` is 0-based (3 = all done). */
export function RoundsRow({ round, hint, total = 3 }) {
  return (
    <div style={{ ...center, gap: 8, marginTop: 10, flexShrink: 0 }}>
      {Array.from({ length: total }, (_, n) => {
        const done = n < round;
        const now = n === round;
        return (
          <div
            key={n}
            title={`Round ${n + 1}`}
            style={{
              ...center,
              width: 46,
              height: 32,
              boxSizing: 'border-box',
              borderRadius: 9,
              background: done ? INK : now ? WHITE : 'transparent',
              border: `${now ? 2 : 1.5}px solid ${done || now ? INK : LINE}`,
              ...nun(14, 800, { color: done ? WHITE : INK }),
            }}
          >
            {n + 1}
          </div>
        );
      })}
      {hint && <div style={{ width: 1.5, height: 20, borderRadius: 1, background: LINE, margin: '0 4px' }} />}
      {hint}
    </div>
  );
}

export function Mistakes({ left, total = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, marginTop: 6, flexShrink: 0 }}>
      <span style={nun(12.5, 700)}>Mistakes Remaining</span>
      <div style={{ display: 'flex', gap: 7 }} role="img" aria-label={`${left} of ${total} mistakes remaining`}>
        {Array.from({ length: total }, (_, i) => (
          <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', boxSizing: 'border-box', background: i < left ? INK : 'transparent', border: `1.5px solid ${i < left ? INK : LINE}` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorSlot({ text, big = false }) {
  return (
    <div style={{ ...center, minHeight: 20, marginTop: 4, flexShrink: 0 }} aria-live="polite">
      {text && (
        <span key={text} style={{ ...nun(big ? 15 : 13.5, 700, { color: ERROR_TEXT }), textAlign: 'center', animation: 'sl-fade 0.2s ease-out' }}>
          {text}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* On-screen keyboard look                                              */
/* ------------------------------------------------------------------ */

/** Positions (0–2) of the provided letters that match a key; repeats give several, left to right. */
export function providedIndexes(letters, key) {
  const up = String(letters || '').toUpperCase().slice(0, 3);
  const k = String(key || '').toUpperCase();
  return [...up].map((c, j) => (c === k ? j : -1)).filter((j) => j >= 0);
}

/** Key fill: white, or the provided-letter tint(s) split into hard-stop bands. */
export function keyTintBackground(indexes) {
  if (!indexes || indexes.length === 0) return WHITE;
  if (indexes.length === 1) return KEY_TINTS[indexes[0]];
  const n = indexes.length;
  const stops = indexes.map((j, s) => `${KEY_TINTS[j]} ${((s / n) * 100).toFixed(3)}% ${(((s + 1) / n) * 100).toFixed(3)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** Base look of a key; size and position stay with the keyboard layout. */
export function keyFaceStyle({ indexes = [], down = false, special = false, active = false, radius = 7 } = {}) {
  const tinted = indexes.length > 0;
  return {
    background: tinted ? keyTintBackground(indexes) : special && (down || active) ? KEY_DOWN : down ? KEY_DOWN : WHITE,
    border: `1.2px solid ${LINE}`,
    borderRadius: radius,
    color: INK,
    fontFamily: NUNITO,
    fontWeight: 700,
    boxShadow: 'none',
  };
}

/** Small colored bars along the bottom of a provided-letter key (the lowered underline). */
export function KeyUnderlines({ indexes, scale = 1 }) {
  if (!indexes || indexes.length === 0) return null;
  const n = indexes.length;
  const segW = (n === 1 ? 12 : n === 2 ? 6.4 : 4.4) * scale;
  return (
    <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round(4 * scale), display: 'flex', justifyContent: 'center', gap: 1.6 * scale, pointerEvents: 'none' }}>
      {indexes.map((j, s) => (
        <span key={s} style={{ width: segW, height: 2.6 * scale, borderRadius: 1.3 * scale, background: LETTER_COLORS[j] }} />
      ))}
    </span>
  );
}

/** state: 'off' | 'on' | 'lock'. */
export function ShiftGlyph({ state = 'off', size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="-8 -1 16 22" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M 0 0.5 l 7 7.5 h -4 v 7 h -6 v -7 h -4 z" fill={state !== 'off' ? INK : 'none'} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      {state === 'lock' && <line x1={-5} x2={5} y1={19} y2={19} stroke={INK} strokeWidth={1.8} strokeLinecap="round" />}
    </svg>
  );
}

export function DeleteGlyph({ size = 24 }) {
  return (
    <svg width={size} height={(size * 14) / 20} viewBox="-10 -7 20 14" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M -9 0 l 5 -6 h 12 v 12 h -12 z M -1 -3 l 6 6 M 5 -3 l -6 6" fill="none" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* End of game                                                          */
/* ------------------------------------------------------------------ */

export function GuessChip({ word, len, ok }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 11px 5px 8px',
        borderRadius: 999,
        border: `1.5px solid ${ok ? INK : 'transparent'}`,
        background: ok ? WHITE : MISS_FILL,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...nun(14, 700),
      }}
    >
      <Icon name={ok ? 'check' : 'x'} size={14} color={ok ? INK : MISS_MARK} />
      {word}
      {len !== undefined && <span style={{ fontWeight: 600 }}>({len})</span>}
    </div>
  );
}

export function Chevron({ open }) {
  return (
    <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.25s ease-out' }}>
      <Icon name="chevron" size={15} />
    </span>
  );
}

/** `showLength` adds each answer's letter count, e.g. "Crush (5)". */
export function AnswerChips({ answers, showLength = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {answers.map((a) => (
        <span key={a} style={{ ...nun(14, 600), padding: '3px 10px', borderRadius: 999, background: FAINT }}>
          {a}
          {showLength && <span style={{ fontWeight: 500 }}> ({a.length})</span>}
        </span>
      ))}
    </div>
  );
}

/** Collapsible "Possible Answers" box. Controlled when `open` is passed, otherwise starts at `defaultOpen`. */
export function Disclosure({ title = 'Possible Answers', open: openProp, defaultOpen = false, onToggle, children }) {
  const [inner, setInner] = useState(defaultOpen);
  useEffect(() => setInner(defaultOpen), [defaultOpen]);
  const open = openProp !== undefined ? openProp : inner;
  const toggle = () => {
    if (onToggle) onToggle(!open);
    if (openProp === undefined) setInner(!open);
  };
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${LINE}`, background: open ? '#FFFFFFB3' : 'transparent', flexShrink: 0, textAlign: 'left' }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="sl-tap"
        style={{ ...resetButton, display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', boxSizing: 'border-box' }}
      >
        <span style={nun(14, 700)}>{title}</span>
        <Chevron open={open} />
      </button>
      {open && <div style={{ margin: '0 12px', padding: '8px 0 10px', borderTop: `1px solid ${HAIR}`, animation: 'sl-fade 0.25s ease-out' }}>{children}</div>}
    </div>
  );
}

export function RoundCard({ children, gap = 10 }) {
  return <div style={{ background: '#FFFFFF8C', border: `1px solid ${LINE}`, borderRadius: 14, padding: '9px 11px', display: 'flex', flexDirection: 'column', gap, flexShrink: 0 }}>{children}</div>;
}

export function RoundBadge({ n, ok }) {
  return (
    <div title={`Round ${n}`} style={{ ...center, width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: ok ? INK : MISS_FILL, ...nun(13, 800, { color: ok ? WHITE : INK }) }}>
      {n}
    </div>
  );
}

export function HomeButton({ href = '/', onClick }) {
  const style = { ...resetButton, ...center, gap: 6, alignSelf: 'center', padding: '8px 18px', borderRadius: 10, border: `2px solid ${INK}`, background: WHITE, marginTop: 6, flexShrink: 0, textDecoration: 'none', ...nun(15, 800) };
  const body = (
    <>
      <Icon name="home" size={18} />
      Home
    </>
  );
  return onClick ? (
    <button type="button" className="sl-tap" style={style} onClick={onClick}>
      {body}
    </button>
  ) : (
    <a className="sl-tap" style={style} href={href}>
      {body}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Modals                                                               */
/* ------------------------------------------------------------------ */

/** Full-screen scrim; clicking it calls onClose. */
export function ModalScrim({ children, onClose, zIndex = 9999, style, className }) {
  return (
    <div
      className={className}
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: SCRIM, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, boxSizing: 'border-box', zIndex, ...style }}
    >
      {children}
    </div>
  );
}

export function ModalCard({ children, gap = 12, maxWidth = 380, cardRef, style, labelledBy, onClick }) {
  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick(e);
      }}
      style={{
        width: '100%',
        maxWidth,
        maxHeight: 'min(92vh, 92dvh)',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: HOME_BG,
        borderRadius: 18,
        padding: '14px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap,
        color: INK,
        fontFamily: NUNITO,
        textAlign: 'left',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function ModalHeader({ icon, title, onClose, titleId }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 28, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <Icon name={icon} size={20} />}
        <span id={titleId} style={nun(18, 800)}>
          {title}
        </span>
      </div>
      {onClose && (
        <button type="button" aria-label="Close" className="sl-tap" onClick={onClose} style={{ ...resetButton, ...nun(24, 600, { lineHeight: 1, padding: '0 4px' }) }}>
          {'\u00d7'}
        </button>
      )}
    </div>
  );
}

export function ModalButton({ children, ghost = false, hidden = false, disabled = false, wide = false, bg = INK, onClick, type = 'button', style }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className="sl-tap"
      style={{
        ...resetButton,
        ...center,
        gap: 8,
        visibility: hidden ? 'hidden' : 'visible',
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: wide ? '11px 14px' : '7px 14px',
        flex: wide ? 1 : undefined,
        borderRadius: 10,
        background: ghost ? 'transparent' : bg,
        border: `2px solid ${ghost ? INK : bg}`,
        whiteSpace: 'nowrap',
        ...nun(wide ? 16 : 14, 800, { color: ghost ? INK : WHITE }),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function EmojiLine({ emoji, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 20, lineHeight: 1, width: 24, textAlign: 'center', flexShrink: 0 }} aria-hidden="true">
        {emoji}
      </span>
      <span style={nun(15.5, 600)}>{text}</span>
    </div>
  );
}

export function ModeLine({ mode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: TINT[mode], borderRadius: 12, border: `1px solid ${HAIR}`, padding: '11px 14px', flexShrink: 0 }}>
      <ModeGlyph mode={mode} size={24} />
      <span style={nun(15, 600, { lineHeight: 1.3 })}>
        <span style={{ fontWeight: 800 }}>{mode}.</span> {MODE_PITCH[mode]}
      </span>
    </div>
  );
}

export function VerdictTag({ ok, size = 22 }) {
  return (
    <div style={{ ...center, width: size, height: size, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0, background: ok ? INK : MISS_FILL }}>
      <Icon name={ok ? 'check' : 'x'} size={size * 0.64} color={ok ? WHITE : INK} />
    </div>
  );
}

export function ExampleRow({ ok, comp, note, motion }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <VerdictTag ok={ok} />
        <span style={nun(14.5, 800)}>{ok ? 'Valid' : 'Not valid'}</span>
      </div>
      <div style={{ ...center, background: WHITE, borderRadius: 12, border: `1px solid ${LINE}`, padding: '10px 10px 6px' }}>
        <Art comp={comp} motion={motion ?? null} px={50} />
      </div>
      {note && <span style={{ ...nun(14, 600), textAlign: 'center' }}>{note}</span>}
    </div>
  );
}

export function Checkbox({ label, checked, onChange }) {
  return (
    <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', alignSelf: 'flex-start' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <span aria-hidden="true" style={{ ...center, width: 18, height: 18, borderRadius: 5, boxSizing: 'border-box', background: checked ? INK : WHITE, border: `1.5px solid ${INK}` }}>
        {checked && <Icon name="check" size={13} color={WHITE} />}
      </span>
      <span style={nun(13.5, 600)}>{label}</span>
    </label>
  );
}

export function StepDots({ step, count = 3, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 6 }} role="tablist" aria-label="Steps">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === step}
          aria-label={`Step ${i + 1}`}
          onClick={onSelect ? () => onSelect(i) : undefined}
          style={{ ...resetButton, width: 8, height: 8, borderRadius: '50%', background: i === step ? INK : LINE, cursor: onSelect ? 'pointer' : 'default' }}
        />
      ))}
    </div>
  );
}

/**
 * Three-step How to Play card.
 * - From the hub: modes = both, closable on every step, no checkbox.
 * - Inside a game: modes = [that mode], × only on the last step, checkbox for "Show Rules on Game Start".
 */
export function RulesCard({
  step,
  onStep,
  modes = MODES,
  closableAnyStep = false,
  onClose,
  onDone,
  showCheckbox = false,
  checked = false,
  onCheck,
  cardRef,
  style,
  bodyProps,
}) {
  const last = step === 2;
  return (
    <ModalCard cardRef={cardRef} style={style} labelledBy="sl-rules-title">
      <ModalHeader icon="help" title="How to Play" titleId="sl-rules-title" onClose={closableAnyStep || last ? onClose : undefined} />
      <div key={step} {...bodyProps} style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'sl-fade 0.25s ease-out', ...(bodyProps && bodyProps.style) }}>
        {step === 0 && (
          <>
            <div style={{ ...center, padding: '6px 0' }}>
              <Art comp={LIN} px={78} />
            </div>
            {STEP1_RULES.map(([e, t]) => (
              <EmojiLine key={t} emoji={e} text={t} />
            ))}
          </>
        )}
        {step === 1 && (
          <>
            <div style={center}>
              <Art comp={LIN} px={46} />
            </div>
            <ExampleRow ok comp={PLACING} motion="unfold" />
            <ExampleRow ok={false} comp={NAILS} note="Provided letters not in order" />
          </>
        )}
        {last && (
          <>
            {COUNT_RULES.map(([e, t]) => (
              <EmojiLine key={t} emoji={e} text={t} />
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
              {modes.map((m) => (
                <ModeLine key={m} mode={m} />
              ))}
            </div>
            {showCheckbox && <Checkbox label="Show Rules on Game Start" checked={checked} onChange={onCheck} />}
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexShrink: 0 }}>
        <ModalButton ghost hidden={step === 0} onClick={() => onStep(Math.max(0, step - 1))}>
          Back
        </ModalButton>
        <StepDots step={step} onSelect={onStep} />
        <ModalButton onClick={() => (last ? (onDone || onClose)() : onStep(step + 1))}>{last ? "Let's Go!" : 'Next'}</ModalButton>
      </div>
    </ModalCard>
  );
}

export function GiveUpCard({ onKeep, onEnd, cardRef, style }) {
  return (
    <ModalCard gap={14} maxWidth={360} cardRef={cardRef} style={style} labelledBy="sl-giveup-title">
      <span id="sl-giveup-title" style={{ ...nun(19, 800), textAlign: 'center', paddingTop: 4 }}>
        Are You Sure?
      </span>
      <span style={{ ...nun(14.5, 600), textAlign: 'center' }}>Don&apos;t do something you may regret...dig deep-you got this!</span>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4 }}>
        <ModalButton ghost onClick={onKeep}>
          No, Keep Playing
        </ModalButton>
        <ModalButton onClick={onEnd}>Yes, End Game</ModalButton>
      </div>
    </ModalCard>
  );
}

export function Field({ id, label, value, onChange, placeholder, type = 'text', tall = false, autoComplete }) {
  const style = {
    display: 'block',
    width: '100%',
    background: WHITE,
    border: `1.5px solid ${LINE}`,
    borderRadius: 10,
    padding: '9px 12px',
    minHeight: tall ? 110 : undefined,
    boxSizing: 'border-box',
    resize: tall ? 'vertical' : undefined,
    outline: 'none',
    ...nun(16, 600),
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={id} style={nun(13.5, 700)}>
        {label}
      </label>
      {tall ? (
        <textarea id={id} value={value} onChange={onChange} placeholder={placeholder} className="sl-field" style={style} />
      ) : (
        <input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} className="sl-field" style={style} />
      )}
    </div>
  );
}

/** Contact / Report a Bug form card. */
export function ContactCard({ bug = false, email, subject, message, onEmail, onSubject, onMessage, onCancel, onSend, cardRef, style }) {
  return (
    <ModalCard gap={14} cardRef={cardRef} style={style} labelledBy="sl-contact-title">
      <ModalHeader icon={bug ? 'bug' : 'mail'} title={bug ? 'Report a Bug' : 'Contact'} titleId="sl-contact-title" onClose={onCancel} />
      <Field id="contact-email" label="Your email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={onEmail} />
      <Field id="contact-subject" label="Subject" placeholder="What is this about?" value={subject} onChange={onSubject} />
      <Field id="contact-message" label="Message" placeholder="Your message…" tall value={message} onChange={onMessage} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
        <ModalButton ghost onClick={onCancel}>
          Cancel
        </ModalButton>
        <ModalButton disabled={!String(message || '').trim()} onClick={onSend}>
          Send
        </ModalButton>
      </div>
    </ModalCard>
  );
}

/* ------------------------------------------------------------------ */
/* Statistics                                                           */
/* ------------------------------------------------------------------ */

/** Eased count from 0 to `target` (after `delay` ms, over `ms`); returns target when inactive. */
export function useCountUp(target, active, runKey = 0, delay = 80, ms = 1100) {
  const [v, setV] = useState(active ? 0 : target);
  useEffect(() => {
    if (!active) {
      setV(target);
      return undefined;
    }
    setV(0);
    let raf = 0;
    const begin = window.setTimeout(() => {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(begin);
      cancelAnimationFrame(raf);
    };
  }, [target, active, runKey, delay, ms]);
  return v;
}

/**
 * Result banner at the top of Statistics after a game. `value` is the final number (already counted up
 * by the caller); `celebrate` draws the three-color underline and bumps the banner when the count lands.
 */
export function ResultBanner({ mode, emoji, message, label, value, trend, celebrate = false }) {
  const drawAt = 0.35 + 1.1;
  return (
    <div style={{ background: TINT[mode], borderRadius: 12, padding: '10px 12px 11px', textAlign: 'center', flexShrink: 0, animation: celebrate ? `sl-bump 0.35s ease-out ${drawAt + 0.5}s both` : undefined }}>
      <div style={{ ...center, gap: 8, ...nun(17, 800) }}>
        <span aria-hidden="true" style={{ fontSize: 19, lineHeight: 1 }}>
          {emoji[0]}
        </span>
        {message}
        <span aria-hidden="true" style={{ fontSize: 19, lineHeight: 1 }}>
          {emoji[1]}
        </span>
      </div>
      {label && (
        <div style={nun(15, 700, { marginTop: 5 })}>
          {label}{' '}
          <span style={{ position: 'relative', display: 'inline-block', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: DEEP[mode] }}>
            {value}
            {celebrate && (
              <span style={{ position: 'absolute', left: -2, right: -2, bottom: -4, display: 'flex', gap: 2 }}>
                {LETTER_COLORS.map((c, i) => (
                  <span key={c} style={{ flex: 1, height: 3, borderRadius: 2, background: c, transformOrigin: 'left center', animation: `sl-draw 0.2s ease-out ${(drawAt + i * 0.14).toFixed(2)}s both` }} />
                ))}
              </span>
            )}
          </span>
        </div>
      )}
      {trend && <div style={nun(13.5, 600, { marginTop: 8 })}>{trend}</div>}
    </div>
  );
}

/** items: [[value, label], ...] */
export function StatGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 6, flexShrink: 0 }}>
      {items.map(([v, l]) => (
        <div key={l} style={{ textAlign: 'center' }}>
          <div style={nun(22, 800, { lineHeight: 1.1 })}>{v}</div>
          <div style={nun(12, 600, { lineHeight: 1.15, marginTop: 2 })}>{l}</div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal distribution bars with a fast/slow emoji rail; `highlight` (-1 for none) uses the mode's deep color. */
export function Distribution({ mode, title, top, bottom, labels, counts, highlight = -1 }) {
  const rowH = 19;
  const gap = 5;
  const max = Math.max(...counts, 1);
  const railH = labels.length * rowH + (labels.length - 1) * gap;
  const mid = (i) => i * (rowH + gap) + rowH / 2;
  const emojiStyle = (i) => ({ position: 'absolute', left: 0, right: 0, top: mid(i), transform: 'translateY(-50%)', textAlign: 'center', fontSize: 15, lineHeight: 1 });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
      <span style={{ ...nun(14, 800), textAlign: 'center' }}>{title}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', width: 22, height: railH, flexShrink: 0 }}>
          <span style={emojiStyle(0)} aria-hidden="true">
            {top}
          </span>
          <span style={{ position: 'absolute', left: 10, width: 2, top: mid(0) + 11, height: mid(labels.length - 1) - mid(0) - 22, background: LINE, borderRadius: 1 }} />
          {labels.slice(1, -1).map((l, k) => (
            <span key={l} style={{ position: 'absolute', left: 7, width: 8, height: 2, top: mid(k + 1) - 1, background: LINE, borderRadius: 1 }} />
          ))}
          <span style={emojiStyle(labels.length - 1)} aria-hidden="true">
            {bottom}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', columnGap: 8, rowGap: gap, gridAutoRows: rowH, alignItems: 'center' }}>
          {labels.map((l, i) => {
            const n = counts[i] || 0;
            const strong = i === highlight;
            return [
              <span key={`l-${l}`} style={{ ...nun(12, 700), textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {l}
              </span>,
              <div key={`b-${l}`} style={{ position: 'relative', height: rowH, borderRadius: 999, background: FAINT }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `max(30px, ${((n / max) * 100).toFixed(1)}%)`,
                    background: n > 0 ? (strong ? DEEP[mode] : BAR) : 'transparent',
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    paddingRight: 8,
                    boxSizing: 'border-box',
                    ...nun(12, 800, { color: strong ? WHITE : INK }),
                  }}
                >
                  {n}
                </div>
              </div>,
            ];
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Winning                                                              */
/* ------------------------------------------------------------------ */

const rnd = (i, s) => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Dash confetti in the three letter colors, over everything; calls onDone when it has fallen. */
export function Confetti({ onDone, zIndex = 10050 }) {
  const reduced = usePrefersReducedMotion();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => doneRef.current && doneRef.current(), reduced ? 0 : 3100);
    return () => window.clearTimeout(t);
  }, [reduced]);
  if (reduced) return null;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex }}>
      {Array.from({ length: 42 }, (_, i) => {
        const a = rnd(i, 1);
        const b = rnd(i, 2);
        const c = rnd(i, 3);
        const d = rnd(i, 4);
        const bx = (a - 0.5) * 320;
        const by = -(80 + b * 170);
        const w = 10 + Math.round(b * 9);
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '30%',
              width: w,
              height: 5,
              marginLeft: -w / 2,
              borderRadius: 3,
              background: LETTER_COLORS[i % 3],
              animation: `sl-burst 2.7s linear ${(d * 0.25).toFixed(2)}s both`,
              '--bx': `${r2(bx)}px`,
              '--by': `${r2(by)}px`,
              '--ex': `${r2(bx + (c - 0.5) * 90)}px`,
              '--ey': `${r2(by + 420 + d * 200)}px`,
              '--br': `${Math.round((c - 0.5) * 360)}deg`,
              '--er': `${Math.round((c - 0.5) * 360 + (a - 0.5) * 600)}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Home                                                                 */
/* ------------------------------------------------------------------ */

export function Sticker({ children }) {
  return (
    <div style={{ ...center, width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: '#FFFFFFB3', border: `1.5px solid ${LINE}`, fontSize: 19, lineHeight: 1 }} aria-hidden="true">
      {children}
    </div>
  );
}

/** Hub button for a mode. state: 'new' | 'inprogress' | 'won' | 'lost'; streak shows only before today's play. */
export function ModeButton({ mode, state, streak = 0, href, onClick }) {
  const done = state === 'won' || state === 'lost';
  const emoji = STATE_EMOJI[state];
  const sub = state === 'inprogress' ? IN_PROGRESS[mode] : state === 'won' ? 'Behold Your Work' : state === 'lost' ? 'Maybe Next Time' : '';
  const showStreak = state === 'new' && streak > 0;
  return (
    <a
      href={href}
      onClick={onClick}
      className="sl-tap"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px 10px 14px',
        minHeight: 64,
        boxSizing: 'border-box',
        borderRadius: 16,
        background: done ? DONE_BG : TINT[mode],
        border: `2px solid ${done ? LINE : INK}`,
        color: INK,
        fontFamily: NUNITO,
        textDecoration: 'none',
        textAlign: 'left',
      }}
    >
      <ModeGlyph mode={mode} size={28} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={nun(18, 800)}>{mode}</span>
          {showStreak && (
            <span style={{ ...nun(11.5, 800, { lineHeight: 1.1 }), padding: '2px 7px', borderRadius: 999, border: `1.5px solid ${INK}`, background: WHITE, whiteSpace: 'nowrap' }}>{streak}-Day Streak 🔥</span>
          )}
        </div>
        {sub ? <span style={nun(13, 700)}>{sub}</span> : null}
      </div>
      {emoji && <Sticker>{emoji}</Sticker>}
    </a>
  );
}

export function Footer({ onContact, onBug, style }) {
  const link = { ...resetButton, ...nun(13, 600), textDecoration: 'underline', textUnderlineOffset: 3 };
  return (
    <footer style={{ padding: '8px 14px max(8px, env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${LINE}`, textAlign: 'center', flexShrink: 0, ...style }}>
      <div style={{ ...center, gap: 18 }}>
        <button type="button" className="sl-tap" style={link} onClick={onContact}>
          Contact
        </button>
        <button type="button" className="sl-tap" style={link} onClick={onBug}>
          Report a Bug
        </button>
      </div>
      <div style={nun(12, 500, { marginTop: 4 })}>© {new Date().getFullYear()} Davis English. All Rights Reserved.</div>
    </footer>
  );
}
